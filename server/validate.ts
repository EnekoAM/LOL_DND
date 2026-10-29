import { HttpError } from './errors';

const PARTY_FIELDS = ['gold', 'level', 'exp', 'expToNextLevel'] as const;
const ROLL_RARITIES = ['basico', 'epico', 'legendario'] as const;

export type RollRarity = (typeof ROLL_RARITIES)[number];

export type RollRecord = {
  tirada: RollRarity;
  rareza: RollRarity;
};

const HISTORY_KINDS = ['tirada', 'crafteo', 'compra', 'venta'] as const;

export type HistoryKind = (typeof HISTORY_KINDS)[number];

const EQUIPMENT_LIMIT = 7;
const ABILITY_SLOTS = ['P', 'H1', 'H2', 'H3', 'R'] as const;

export type PartyPatch = Partial<Record<(typeof PARTY_FIELDS)[number], number>> & {
  /** Suma o resta esta cantidad al oro del grupo, sin sustituir el saldo. */
  addGold?: number;
};

export type BasicAttackEntry = { type: string; scaling: number[] };
/** Un tipo (formato antiguo) o varios (p. ej. AD + AP). */
export type BasicAttack = BasicAttackEntry | BasicAttackEntry[];

export type PlayerPatch = {
  basicAttack?: BasicAttack | null;
  abilities?: Partial<Record<(typeof ABILITY_SLOTS)[number], string | null>>;
  equipamiento?: string[];
  build?: string[];
  stats?: Record<string, number | string>;
  /** Máximo de PG de combate (editable en la ficha). */
  hp?: number;
  /** PG actuales. */
  actualHp?: number;
  /** Escudo (no se muestra en la vista compacta). */
  escudo?: number;
  /** Vida temporal (solo en el editor). */
  vidaTemporal?: number;
  /** Máximo de maná (editable en la ficha). */
  mana?: number;
  /** Maná actual. */
  actualMana?: number;
  /** Ficha D&D (rol, características y extra). null la borra. */
  sheet?: PlayerSheet | null;
};

export type PlayerReplace = {
  basicAttack?: BasicAttack;
  abilities: Record<(typeof ABILITY_SLOTS)[number], string | null>;
  equipamiento: string[];
  build: string[];
};

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'El cuerpo tiene que ser un objeto JSON');
  }
  return body as Record<string, unknown>;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new HttpError(400, `${field} tiene que ser una lista de textos`);
  }
  return value.map(item => item.trim());
}

function equipmentList(value: unknown): string[] {
  const items = stringList(value, 'equipamiento');
  if (items.length > EQUIPMENT_LIMIT) {
    throw new HttpError(400, `El equipamiento admite como máximo ${EQUIPMENT_LIMIT} ítems`);
  }
  return items;
}

function basicAttackEntry(value: unknown, field: string): BasicAttackEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${field} tiene que ser un objeto`);
  }
  const attack = value as Record<string, unknown>;
  if (typeof attack.type !== 'string' || !attack.type.trim()) {
    throw new HttpError(400, `${field}.type tiene que ser un texto`);
  }
  if (!Array.isArray(attack.scaling) || attack.scaling.some(n => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new HttpError(400, `${field}.scaling tiene que ser una lista de números`);
  }
  return { type: attack.type.trim(), scaling: attack.scaling };
}

/** Acepta un objeto { type, scaling } o una lista de ellos (p. ej. AD + AP). */
function basicAttack(value: unknown): BasicAttack {
  if (Array.isArray(value)) {
    if (!value.length) throw new HttpError(400, 'basicAttack no puede ser una lista vacía');
    return value.map((entry, index) => basicAttackEntry(entry, `basicAttack[${index}]`));
  }
  return basicAttackEntry(value, 'basicAttack');
}

function abilities(
  value: unknown,
  requireAll: boolean,
): Partial<Record<(typeof ABILITY_SLOTS)[number], string | null>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'abilities tiene que ser un objeto');
  }
  const source = value as Record<string, unknown>;
  const parsed: Partial<Record<(typeof ABILITY_SLOTS)[number], string | null>> = {};
  for (const key of Object.keys(source)) {
    if (!ABILITY_SLOTS.includes(key as (typeof ABILITY_SLOTS)[number])) {
      throw new HttpError(400, `Hueco de habilidad desconocido: ${key}`);
    }
  }
  for (const slot of ABILITY_SLOTS) {
    if (!(slot in source)) {
      if (requireAll) throw new HttpError(400, `Falta la habilidad ${slot}`);
      continue;
    }
    const slotValue = source[slot];
    if (slotValue === null) {
      parsed[slot] = null;
      continue;
    }
    if (typeof slotValue !== 'string' || !slotValue.trim()) {
      throw new HttpError(400, `La habilidad ${slot} tiene que ser texto o null`);
    }
    parsed[slot] = slotValue.trim();
  }
  return parsed;
}

function rollRarity(value: unknown, field: string): RollRarity {
  if (typeof value !== 'string' || !ROLL_RARITIES.includes(value as RollRarity)) {
    throw new HttpError(400, `${field} tiene que ser basico, epico o legendario`);
  }
  return value as RollRarity;
}

export function parseRollRecord(body: unknown): RollRecord {
  const source = asObject(body);
  return {
    tirada: rollRarity(source.tirada, 'tirada'),
    rareza: rollRarity(source.rareza, 'rareza'),
  };
}

export function parsePartyPatch(body: unknown): PartyPatch {
  const source = asObject(body);
  const patch: PartyPatch = {};
  for (const key of PARTY_FIELDS) {
    if (source[key] === undefined) continue;
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new HttpError(400, `${key} tiene que ser un número`);
    }
    if (key === 'level' && (!Number.isInteger(value) || value < 1)) {
      throw new HttpError(400, 'level tiene que ser un entero mayor que 0');
    }
    if (key === 'expToNextLevel' && value <= 0) {
      throw new HttpError(400, 'expToNextLevel tiene que ser mayor que 0');
    }
    patch[key] = value;
  }
  if (source.addGold !== undefined) {
    const addGold = source.addGold;
    if (typeof addGold !== 'number' || !Number.isInteger(addGold) || addGold === 0) {
      throw new HttpError(400, 'addGold tiene que ser un entero distinto de 0');
    }
    if (patch.gold !== undefined) {
      throw new HttpError(400, 'No se puede fijar el oro y sumarlo a la vez');
    }
    patch.addGold = addGold;
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'No hay campos para actualizar');
  return patch;
}


function playerStats(value: unknown): Record<string, number | string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'stats tiene que ser un objeto');
  }
  const stats: Record<string, number | string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) throw new HttpError(400, 'stats no admite claves vacías');
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      stats[key] = raw;
      continue;
    }
    if (typeof raw === 'string') {
      stats[key] = raw;
      continue;
    }
    throw new HttpError(400, `stats.${key} tiene que ser un número o un texto`);
  }
  return stats;
}

function nonNegInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${field} tiene que ser un entero ≥ 0`);
  }
  return value;
}

export const ABILITY_SCORE_KEYS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export type AbilityScoreKey = (typeof ABILITY_SCORE_KEYS)[number];

/** Claves de la fila Extra, iguales que las columnas de Cálculos (statLine.ts). */
export const SHEET_STAT_KEYS = [
  'hp',
  'ac',
  'mr',
  'mana',
  'ad',
  'ap',
  'critChance',
  'critDamage',
  'spe',
  'atkSpe',
  'atkSpePct',
  'abSpe',
  'abSpePct',
  'lethality',
  'magicPen',
] as const;

export type SheetStatKey = (typeof SHEET_STAT_KEYS)[number];

/** Ficha D&D guardada en players.sheet. El modificador se calcula: floor((puntuación - 10) / 2). */
export type PlayerSheet = {
  /** Id del rol (colección roles), p. ej. "asesino-ad". */
  roleId: string;
  scores?: Record<AbilityScoreKey, number>;
  /** Bonos fijos que se suman al total (solo las claves distintas de 0). */
  extra?: Partial<Record<SheetStatKey, number | string>>;
};

const ROLE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SCORE_MIN = 1;
const SCORE_MAX = 30;
const SHEET_TEXT_LIMIT = 20;

function sheetScores(value: unknown): Record<AbilityScoreKey, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'sheet.scores tiene que ser un objeto');
  }
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!ABILITY_SCORE_KEYS.includes(key as AbilityScoreKey)) {
      throw new HttpError(400, `Característica desconocida: ${key}`);
    }
  }
  const scores = {} as Record<AbilityScoreKey, number>;
  for (const key of ABILITY_SCORE_KEYS) {
    const raw = source[key];
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < SCORE_MIN || raw > SCORE_MAX) {
      throw new HttpError(400, `sheet.scores.${key} tiene que ser un entero entre ${SCORE_MIN} y ${SCORE_MAX}`);
    }
    scores[key] = raw;
  }
  return scores;
}

function sheetExtra(value: unknown): Partial<Record<SheetStatKey, number | string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'sheet.extra tiene que ser un objeto');
  }
  const extra: Partial<Record<SheetStatKey, number | string>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SHEET_STAT_KEYS.includes(key as SheetStatKey)) throw new HttpError(400, `Stat extra desconocida: ${key}`);
    const stat = key as SheetStatKey;
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) throw new HttpError(400, `sheet.extra.${key} tiene que ser un número`);
      if (raw !== 0) extra[stat] = raw;
      continue;
    }
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (text.length > SHEET_TEXT_LIMIT) throw new HttpError(400, `sheet.extra.${key} es demasiado largo`);
      if (text && text !== '0' && text !== '-') extra[stat] = text;
      continue;
    }
    throw new HttpError(400, `sheet.extra.${key} tiene que ser un número o un dado (por ejemplo 1d4)`);
  }
  return extra;
}

export function parsePlayerSheet(value: unknown): PlayerSheet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'sheet tiene que ser un objeto');
  }
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (key !== 'roleId' && key !== 'scores' && key !== 'extra') {
      throw new HttpError(400, `Campo de ficha desconocido: ${key}`);
    }
  }
  const roleId = typeof source.roleId === 'string' ? source.roleId.trim() : '';
  if (!ROLE_ID.test(roleId)) throw new HttpError(400, 'sheet.roleId tiene que ser un id de rol (p. ej. asesino-ad)');

  const sheet: PlayerSheet = { roleId };
  if (source.scores !== undefined && source.scores !== null) sheet.scores = sheetScores(source.scores);
  if (source.extra !== undefined && source.extra !== null) {
    const extra = sheetExtra(source.extra);
    if (Object.keys(extra).length) sheet.extra = extra;
  }
  return sheet;
}

export function parsePlayerPatch(body: unknown): PlayerPatch {
  const source = asObject(body);
  const patch: PlayerPatch = {};
  if ('basicAttack' in source) {
    patch.basicAttack = source.basicAttack === null ? null : basicAttack(source.basicAttack);
  }
  if ('abilities' in source) patch.abilities = abilities(source.abilities, false);
  if ('equipamiento' in source) patch.equipamiento = equipmentList(source.equipamiento);
  if ('build' in source) patch.build = stringList(source.build, 'build');
  if ('stats' in source) patch.stats = playerStats(source.stats);
  if ('hp' in source) patch.hp = nonNegInt(source.hp, 'hp');
  if ('actualHp' in source) patch.actualHp = nonNegInt(source.actualHp, 'actualHp');
  if ('escudo' in source) patch.escudo = nonNegInt(source.escudo, 'escudo');
  if ('vidaTemporal' in source) patch.vidaTemporal = nonNegInt(source.vidaTemporal, 'vidaTemporal');
  if ('mana' in source) patch.mana = nonNegInt(source.mana, 'mana');
  if ('actualMana' in source) patch.actualMana = nonNegInt(source.actualMana, 'actualMana');
  if ('sheet' in source) patch.sheet = source.sheet === null ? null : parsePlayerSheet(source.sheet);
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'No hay campos para actualizar');
  return patch;
}

const CHAMPION_SLOTS = ['P', 'Q', 'W', 'E', 'R'] as const;

export type ChampionSlot = (typeof CHAMPION_SLOTS)[number];

export type ChampionAbilityDamage = {
  type?: string;
  ap?: number[];
  ad?: number[];
  damageBonus?: number;
};

export type ChampionAbilityEffect = {
  name: string;
  values?: number[];
  duration?: number[];
};

export type ChampionAbility = {
  name: string;
  description?: string;
  learned?: boolean;
  damage?: ChampionAbilityDamage;
  effect?: ChampionAbilityEffect[];
  cost?: string;
};

export type ChampionAbilityPatch = {
  slot: ChampionSlot;
  ability: ChampionAbility;
};

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${field} tiene que ser un texto`);
  const text = value.trim();
  return text || undefined;
}

function finiteNumbers(value: unknown, field: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new HttpError(400, `${field} tiene que ser una lista de números`);
  }
  return value.length ? value : undefined;
}

function parseDamage(value: unknown): ChampionAbilityDamage | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'damage tiene que ser un objeto');
  }
  const source = value as Record<string, unknown>;
  const damage: ChampionAbilityDamage = {};
  const type = optionalText(source.type, 'damage.type');
  if (type) damage.type = type;
  const ap = finiteNumbers(source.ap, 'damage.ap');
  const ad = finiteNumbers(source.ad, 'damage.ad');
  if (ap) damage.ap = ap;
  if (ad) damage.ad = ad;
  if (source.damageBonus !== undefined) {
    if (typeof source.damageBonus !== 'number' || !Number.isFinite(source.damageBonus)) {
      throw new HttpError(400, 'damage.damageBonus tiene que ser un número');
    }
    damage.damageBonus = source.damageBonus;
  }
  return Object.keys(damage).length ? damage : undefined;
}

function parseEffects(value: unknown): ChampionAbilityEffect[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, 'effect tiene que ser una lista');
  const effects: ChampionAbilityEffect[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, 'Cada efecto tiene que ser un objeto');
    }
    const source = item as Record<string, unknown>;
    const name = optionalText(source.name, 'effect.name');
    if (!name) throw new HttpError(400, 'Cada efecto necesita un nombre');
    const effect: ChampionAbilityEffect = { name };
    const values = finiteNumbers(source.values, 'effect.values');
    const duration = finiteNumbers(source.duration, 'effect.duration');
    if (values) effect.values = values;
    if (duration) effect.duration = duration;
    effects.push(effect);
  }
  return effects.length ? effects : undefined;
}

export function parseChampionAbilityPatch(body: unknown): ChampionAbilityPatch {
  const source = asObject(body);
  if (typeof source.slot !== 'string' || !CHAMPION_SLOTS.includes(source.slot as ChampionSlot)) {
    throw new HttpError(400, 'slot tiene que ser P, Q, W, E o R');
  }
  if (!source.ability || typeof source.ability !== 'object' || Array.isArray(source.ability)) {
    throw new HttpError(400, 'ability tiene que ser un objeto');
  }
  const abilitySource = source.ability as Record<string, unknown>;
  const name = optionalText(abilitySource.name, 'name');
  if (!name) throw new HttpError(400, 'La habilidad necesita un nombre');

  const ability: ChampionAbility = { name };
  const description = optionalText(abilitySource.description, 'description');
  const cost = optionalText(abilitySource.cost, 'cost');
  if (description) ability.description = description;
  if (cost) ability.cost = cost;
  if ('learned' in abilitySource) {
    if (typeof abilitySource.learned !== 'boolean') {
      throw new HttpError(400, 'learned tiene que ser verdadero o falso');
    }
    ability.learned = abilitySource.learned;
  }
  if ('damage' in abilitySource) {
    const damage = parseDamage(abilitySource.damage);
    if (damage) ability.damage = damage;
  }
  if ('effect' in abilitySource) {
    const effect = parseEffects(abilitySource.effect);
    if (effect) ability.effect = effect;
  }
  return { slot: source.slot as ChampionSlot, ability };
}

export type ItemUpdate = {
  rareza: string;
  efecto: { pasiva: string; activa: string };
  stats: Record<string, number | string>;
  /** undefined deja el coste como está; null lo quita. */
  coste?: number | null;
};

const ITEM_TEXT_LIMIT = 2000;
const STAT_TEXT_LIMIT = 20;

function effectText(value: unknown, field: string): string {
  if (value === undefined || value === null) return '-';
  if (typeof value !== 'string') throw new HttpError(400, `${field} tiene que ser un texto`);
  const text = value.trim();
  if (text.length > ITEM_TEXT_LIMIT) throw new HttpError(400, `${field} es demasiado largo`);
  return text || '-';
}

function itemStats(value: unknown): Record<string, number | string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'stats tiene que ser un objeto');
  }
  const stats: Record<string, number | string> = {};
  for (const [rawKey, stat] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    // Mongo no admite "." ni "$" en las claves que se usan con $set.
    if (!key || key.includes('.') || key.startsWith('$')) throw new HttpError(400, `Stat no válida: ${rawKey}`);
    if (typeof stat === 'number') {
      if (!Number.isFinite(stat)) throw new HttpError(400, `${key} tiene que ser un número`);
      stats[key] = stat;
      continue;
    }
    if (typeof stat === 'string' && stat.trim() && stat.trim().length <= STAT_TEXT_LIMIT) {
      stats[key] = stat.trim();
      continue;
    }
    throw new HttpError(400, `${key} tiene que ser un número o un dado (por ejemplo 1d4)`);
  }
  return stats;
}

/** Definición de un ítem para PUT /api/items. El nombre va en la query y no se puede cambiar. */
export function parseItemUpdate(body: unknown): ItemUpdate {
  const source = asObject(body);
  if ('cantidad' in source) {
    throw new HttpError(400, 'La cantidad no se edita aquí: usa tiradas, crafteos o la tienda');
  }
  const rareza = optionalText(source.rareza, 'rareza');
  if (!rareza) throw new HttpError(400, 'El ítem necesita una rareza');

  if (!source.efecto || typeof source.efecto !== 'object' || Array.isArray(source.efecto)) {
    throw new HttpError(400, 'efecto tiene que ser un objeto con pasiva y activa');
  }
  const efecto = source.efecto as Record<string, unknown>;

  const update: ItemUpdate = {
    rareza,
    efecto: {
      pasiva: effectText(efecto.pasiva, 'efecto.pasiva'),
      activa: effectText(efecto.activa, 'efecto.activa'),
    },
    stats: itemStats(source.stats),
  };

  if (source.coste === null) {
    update.coste = null;
  } else if (source.coste !== undefined) {
    if (typeof source.coste !== 'number' || !Number.isFinite(source.coste) || source.coste < 0) {
      throw new HttpError(400, 'coste tiene que ser un número igual o mayor que 0');
    }
    update.coste = source.coste;
  }
  return update;
}

const SHOP_MODES = ['compra', 'venta'] as const;

export type ShopMode = (typeof SHOP_MODES)[number];

export type ShopLine = {
  nombre: string;
  cantidad: number;
};

export type ShopOrder = {
  mode: ShopMode;
  lines: ShopLine[];
};

export function parseShopOrder(body: unknown): ShopOrder {
  const source = asObject(body);
  if (typeof source.mode !== 'string' || !SHOP_MODES.includes(source.mode as ShopMode)) {
    throw new HttpError(400, 'La tienda tiene que ser una compra o una venta');
  }
  if (!Array.isArray(source.lines) || source.lines.length === 0) throw new HttpError(400, 'El carrito está vacío');
  if (source.lines.length > 40) throw new HttpError(400, 'El carrito admite como máximo 40 objetos');

  const seen = new Set<string>();
  const lines: ShopLine[] = [];
  for (const entry of source.lines) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new HttpError(400, 'Cada línea del carrito tiene que ser un objeto');
    }
    const line = entry as Record<string, unknown>;
    if (typeof line.nombre !== 'string' || !line.nombre.trim()) throw new HttpError(400, 'Falta el nombre de un objeto del carrito');
    if (typeof line.cantidad !== 'number' || !Number.isInteger(line.cantidad) || line.cantidad < 1 || line.cantidad > 99) {
      throw new HttpError(400, 'La cantidad del carrito tiene que ser un entero entre 1 y 99');
    }
    const nombre = line.nombre.trim();
    const key = nombre.toLowerCase();
    if (seen.has(key)) throw new HttpError(400, 'El carrito repite un objeto');
    seen.add(key);
    lines.push({ nombre, cantidad: line.cantidad });
  }
  return { mode: source.mode as ShopMode, lines };
}

export function parseHistoryRevert(body: unknown): { id: string; kind: HistoryKind } {
  const source = asObject(body);
  if (typeof source.id !== 'string' || !source.id.trim()) throw new HttpError(400, 'Falta el historial');
  if (typeof source.kind !== 'string' || !HISTORY_KINDS.includes(source.kind as HistoryKind)) {
    throw new HttpError(400, 'El historial tiene que ser una tirada, un crafteo, una compra o una venta');
  }
  return { id: source.id.trim(), kind: source.kind as HistoryKind };
}

export function parsePlayerReplace(body: unknown): PlayerReplace {
  const source = asObject(body);
  return {
    ...(source.basicAttack === undefined ? {} : { basicAttack: basicAttack(source.basicAttack) }),
    abilities: abilities(source.abilities, true) as PlayerReplace['abilities'],
    equipamiento: equipmentList(source.equipamiento),
    build: stringList(source.build, 'build'),
  };
}

/** Fila de una tabla de rol: las mismas columnas que la ficha (hp, ac, mana, ad…). */
export type RoleStatLine = Record<SheetStatKey, number | string>;

export type RoleTable = {
  id: string;
  name: string;
  /** Índice 0 = nivel 1. */
  levels: RoleStatLine[];
};

export type RolePatch = {
  name?: string;
  levels?: RoleStatLine[];
};

const ROLE_NAME_LIMIT = 40;
const ROLE_LEVEL_LIMIT = 30;
const ROLE_TEXT_LIMIT = 40;

export function isRoleId(value: string): boolean {
  return ROLE_ID.test(value);
}

function roleStatLine(value: unknown, index: number): RoleStatLine {
  const field = `levels[${index}]`;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${field} tiene que ser un objeto`);
  }
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!SHEET_STAT_KEYS.includes(key as SheetStatKey)) throw new HttpError(400, `${field}: stat desconocida ${key}`);
  }
  const line = {} as RoleStatLine;
  for (const key of SHEET_STAT_KEYS) {
    const raw = source[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      line[key] = raw;
      continue;
    }
    if (typeof raw === 'string' && raw.trim() && raw.trim().length <= ROLE_TEXT_LIMIT) {
      line[key] = raw.trim();
      continue;
    }
    throw new HttpError(400, `${field}.${key} tiene que ser un número o un dado (por ejemplo 2d4)`);
  }
  return line;
}

export function parseRolePatch(body: unknown): RolePatch {
  const source = asObject(body);
  for (const key of Object.keys(source)) {
    if (key !== 'name' && key !== 'levels') throw new HttpError(400, `Campo de rol desconocido: ${key}`);
  }
  const patch: RolePatch = {};
  if ('name' in source) {
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (!name || name.length > ROLE_NAME_LIMIT) {
      throw new HttpError(400, `name tiene que ser un texto de 1 a ${ROLE_NAME_LIMIT} caracteres`);
    }
    patch.name = name;
  }
  if ('levels' in source) {
    const levels = source.levels;
    if (!Array.isArray(levels) || levels.length === 0 || levels.length > ROLE_LEVEL_LIMIT) {
      throw new HttpError(400, `levels tiene que ser una lista de 1 a ${ROLE_LEVEL_LIMIT} niveles`);
    }
    patch.levels = levels.map(roleStatLine);
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'No hay campos para actualizar');
  return patch;
}

const LOOT_RARITIES = ['basico', 'epico', 'legendario'] as const;
const SPAWN_TYPES = ['Basico', 'Epico'] as const;
const DROP_ITEMS = ['Prob. basico', 'Prob. epico', 'Prob. legendario'] as const;
const DROP_TABLES = ['Drop basico', 'Drop epico', 'Drop legendario'] as const;

export type LootRuleRarity = (typeof LOOT_RARITIES)[number];
export type DropTableKey = (typeof DROP_TABLES)[number];
export type SpawnRoll = { type: (typeof SPAWN_TYPES)[number]; prob: number };
export type DropChance = { item: (typeof DROP_ITEMS)[number]; prob: number };

/**
 * Reglas fijas del botín guardadas en loot/tables.
 * wildCard: parte fija de "Lo que quieras" en cada tabla (0 a 1); el resto se reparte entre los ítems.
 */
export type LootRules = {
  rolls: SpawnRoll[];
  wildCard: Record<LootRuleRarity, number>;
} & Record<DropTableKey, DropChance[]>;

export type LootRulesPatch = Partial<LootRules>;

export const LOOT_RULE_KEYS = ['rolls', ...DROP_TABLES, 'wildCard'] as const;

function percent(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new HttpError(400, `${field} tiene que ser un número entre 0 y 100`);
  }
  return value;
}

function spawnRolls(value: unknown): SpawnRoll[] {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, 'rolls tiene que ser una lista');
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const entry = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
    const type = entry?.type;
    if (typeof type !== 'string' || !SPAWN_TYPES.includes(type as SpawnRoll['type'])) {
      throw new HttpError(400, `rolls[${index}].type tiene que ser ${SPAWN_TYPES.join(' o ')}`);
    }
    if (seen.has(type)) throw new HttpError(400, `rolls repite el tipo ${type}`);
    seen.add(type);
    return { type: type as SpawnRoll['type'], prob: percent(entry?.prob, `rolls[${index}].prob`) };
  });
}

function dropTable(value: unknown, field: DropTableKey): DropChance[] {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, `${field} tiene que ser una lista`);
  const seen = new Set<string>();
  const entries = value.map((raw, index) => {
    const entry = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
    const item = entry?.item;
    if (typeof item !== 'string' || !DROP_ITEMS.includes(item as DropChance['item'])) {
      throw new HttpError(400, `${field}[${index}].item tiene que ser ${DROP_ITEMS.join(', ')}`);
    }
    if (seen.has(item)) throw new HttpError(400, `${field} repite ${item}`);
    seen.add(item);
    return { item: item as DropChance['item'], prob: percent(entry?.prob, `${field}[${index}].prob`) };
  });
  const total = entries.reduce((sum, entry) => sum + entry.prob, 0);
  if (Math.abs(total - 100) > 1e-6) throw new HttpError(400, `${field} tiene que sumar 100 (suma ${total})`);
  return entries;
}

function wildCard(value: unknown, partial: boolean): Partial<Record<LootRuleRarity, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'wildCard tiene que ser un objeto');
  }
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!LOOT_RARITIES.includes(key as LootRuleRarity)) throw new HttpError(400, `wildCard: rareza desconocida ${key}`);
  }
  const result: Partial<Record<LootRuleRarity, number>> = {};
  for (const rarity of LOOT_RARITIES) {
    const raw = source[rarity];
    if (raw === undefined && partial) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw >= 1) {
      throw new HttpError(400, `wildCard.${rarity} tiene que ser un número entre 0 y 1 (sin llegar a 1)`);
    }
    result[rarity] = raw;
  }
  return result;
}

/** Cambia solo las reglas del botín; los ítems se calculan siempre del catálogo. */
export function parseLootRulesPatch(body: unknown): LootRulesPatch {
  const source = asObject(body);
  for (const key of Object.keys(source)) {
    if (!LOOT_RULE_KEYS.includes(key as (typeof LOOT_RULE_KEYS)[number])) {
      throw new HttpError(400, `Campo de botín desconocido: ${key}`);
    }
  }
  const patch: LootRulesPatch = {};
  if ('rolls' in source) patch.rolls = spawnRolls(source.rolls);
  for (const table of DROP_TABLES) {
    if (table in source) patch[table] = dropTable(source[table], table);
  }
  if ('wildCard' in source) patch.wildCard = wildCard(source.wildCard, true) as LootRules['wildCard'];
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'No hay campos para actualizar');
  return patch;
}

/** Lee las reglas completas guardadas en Mongo. Lanza si falta algo. */
export function parseLootRules(value: unknown): LootRules {
  const source = asObject(value);
  const rules = {
    rolls: spawnRolls(source.rolls),
    wildCard: wildCard(source.wildCard, false) as LootRules['wildCard'],
  } as LootRules;
  for (const table of DROP_TABLES) rules[table] = dropTable(source[table], table);
  return rules;
}
