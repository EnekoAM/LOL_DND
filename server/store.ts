import type { Collection, Document, Filter } from 'mongodb';
import { getDb } from './db';
import { HttpError } from './errors';
import type { ChampionAbility, PartyPatch, PlayerPatch, PlayerReplace, RollRecord } from './validate';

const PUBLIC = { projection: { _id: 0, order: 0 } };
const CI = { locale: 'es', strength: 2 } as const;

type PlayerDoc = Document & {
  name: string;
  order?: number;
  abilities?: Record<string, string | null>;
};

type StringIdDoc = Document & { _id: string };

async function collection(name: string): Promise<Collection> {
  return (await getDb()).collection(name);
}

async function singleton(name: string): Promise<Collection<StringIdDoc>> {
  return (await getDb()).collection<StringIdDoc>(name);
}

async function one(col: Collection, filter: Filter<Document>, missing: string) {
  const doc = await col.findOne(filter, { ...PUBLIC, collation: CI });
  if (!doc) throw new HttpError(404, missing);
  return doc;
}

export async function getChampions(champion?: string) {
  const col = await collection('champions');
  if (!champion) return col.find({}, PUBLIC).sort({ order: 1 }).toArray();
  return one(col, { champion }, `No existe el campeón ${champion}`);
}

export async function updateChampionAbility(champion: string, slot: string, ability: ChampionAbility) {
  const col = await collection('champions');
  const existing = await col.findOne({ champion }, { collation: CI });
  if (!existing) throw new HttpError(404, `No existe el campeón ${champion}`);
  await col.updateOne(
    { _id: existing._id },
    { $set: { [`abilities.${slot}`]: ability, updatedAt: new Date().toISOString() } },
  );
  return getChampions(String(existing.champion));
}

export async function getItems(nombre?: string) {
  const col = await collection('items');
  if (!nombre) return col.find({}, PUBLIC).sort({ order: 1 }).toArray();
  return one(col, { nombre }, `No existe el item ${nombre}`);
}

/** Hora de España (península), como "01/01/2026 12:00:00". */
function rollTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '00';
  const hour = value('hour') === '24' ? '00' : value('hour');
  return `${value('day')}/${value('month')}/${value('year')} ${hour}:${value('minute')}:${value('second')}`;
}

/** Suma una copia al stock y deja la tirada en rollHistoric. */
export async function grantItem(nombre: string, roll: RollRecord) {
  const trimmed = nombre.trim();
  if (!trimmed) throw new HttpError(400, 'Falta el nombre del ítem');
  const col = await collection('items');
  const existing = await col.findOne({ nombre: trimmed }, { collation: CI });
  if (!existing) throw new HttpError(404, `No existe el item ${trimmed}`);

  const item = String(existing.nombre);
  await col.updateOne(
    { _id: existing._id },
    { $inc: { cantidad: 1 }, $set: { updatedAt: new Date().toISOString() } },
  );
  await (await collection('rollHistoric')).insertOne({
    timestamp: rollTimestamp(),
    item,
    tirada: roll.tirada,
    rareza: roll.rareza,
  });
  return getItems(item);
}

export async function getLoot() {
  const doc = await (await singleton('loot')).findOne({ _id: 'tables' }, { projection: { _id: 0 } });
  if (!doc) throw new HttpError(404, 'No hay tablas de loot. Ejecuta npm run seed');
  return doc;
}

export async function getParty() {
  const doc = await (await singleton('party')).findOne({ _id: 'current' }, { projection: { _id: 0 } });
  if (!doc) throw new HttpError(404, 'No hay grupo. Ejecuta npm run seed');
  return doc;
}

export async function updateParty(patch: PartyPatch) {
  const col = await singleton('party');
  const result = await col.updateOne(
    { _id: 'current' },
    { $set: { ...patch, updatedAt: new Date().toISOString() } },
  );
  if (result.matchedCount === 0) throw new HttpError(404, 'No hay grupo. Ejecuta npm run seed');
  return getParty();
}

async function players(): Promise<Collection<PlayerDoc>> {
  return (await getDb()).collection<PlayerDoc>('players');
}

export async function listPlayers() {
  return (await players()).find({}, PUBLIC).sort({ order: 1 }).toArray();
}

export async function getPlayer(name: string) {
  const doc = await (await players()).findOne({ name }, { ...PUBLIC, collation: CI });
  if (!doc) throw new HttpError(404, `No existe el jugador ${name}`);
  return doc;
}

export async function updatePlayer(name: string, patch: PlayerPatch) {
  const col = await players();
  const existing = await col.findOne({ name }, { collation: CI });
  if (!existing) throw new HttpError(404, `No existe el jugador ${name}`);

  const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  const $unset: Record<string, ''> = {};
  if (patch.abilities) $set.abilities = { ...existing.abilities, ...patch.abilities };
  if (patch.equipamiento) $set.equipamiento = patch.equipamiento;
  if (patch.build) $set.build = patch.build;
  if (patch.basicAttack === null) $unset.basicAttack = '';
  else if (patch.basicAttack) $set.basicAttack = patch.basicAttack;

  await col.updateOne(
    { _id: existing._id },
    Object.keys($unset).length ? { $set, $unset } : { $set },
  );
  return getPlayer(existing.name);
}

export async function upsertPlayer(name: string, input: PlayerReplace) {
  const col = await players();
  const trimmed = name.trim();
  if (!trimmed) throw new HttpError(400, 'Falta el nombre del jugador');
  const existing = await col.findOne({ name: trimmed }, { collation: CI });
  const storedName = existing?.name ?? trimmed;
  const order = existing?.order ?? (await col.countDocuments());

  await col.updateOne(
    { name: storedName },
    { $set: { ...input, name: storedName, order, updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
  return getPlayer(storedName);
}

export async function mongoStatus() {
  const db = await getDb();
  await db.command({ ping: 1 });
  const names = ['champions', 'items', 'players', 'loot', 'party', 'rollHistoric'] as const;
  const counts = Object.fromEntries(
    await Promise.all(names.map(async name => [name, await db.collection(name).estimatedDocumentCount()] as const)),
  );
  return {
    ok: true as const,
    db: db.databaseName,
    writes: process.env.API_WRITE_KEY?.trim() ? 'protegidas' as const : 'abiertas' as const,
    counts,
  };
}
