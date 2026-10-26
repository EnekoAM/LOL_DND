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

export type BasicAttack = { type: string; scaling: number[] };

export type PlayerPatch = {
  basicAttack?: BasicAttack | null;
  abilities?: Partial<Record<(typeof ABILITY_SLOTS)[number], string | null>>;
  equipamiento?: string[];
  build?: string[];
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

function basicAttack(value: unknown): BasicAttack {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'basicAttack tiene que ser un objeto');
  }
  const attack = value as Record<string, unknown>;
  if (typeof attack.type !== 'string' || !attack.type.trim()) {
    throw new HttpError(400, 'basicAttack.type tiene que ser un texto');
  }
  if (!Array.isArray(attack.scaling) || attack.scaling.some(n => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new HttpError(400, 'basicAttack.scaling tiene que ser una lista de números');
  }
  return { type: attack.type.trim(), scaling: attack.scaling };
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

export function parsePlayerPatch(body: unknown): PlayerPatch {
  const source = asObject(body);
  const patch: PlayerPatch = {};
  if ('basicAttack' in source) {
    patch.basicAttack = source.basicAttack === null ? null : basicAttack(source.basicAttack);
  }
  if ('abilities' in source) patch.abilities = abilities(source.abilities, false);
  if ('equipamiento' in source) patch.equipamiento = equipmentList(source.equipamiento);
  if ('build' in source) patch.build = stringList(source.build, 'build');
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
