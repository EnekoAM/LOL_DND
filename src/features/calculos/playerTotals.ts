import { findItem } from '../../data/items';
import { invertLolDice, lolToDice, type LolDiceStat } from '../../data/lolDiceTable';
import { lolStatBonusOf } from '../../data/lolStatBonus';
import { ensureNamedEffectData, getNamedEffectData } from '../../data/namedEffectDescriptions';
import { PARTY } from '../../data/party';
import { itemPermanentStackLines } from '../../data/permanentStacks';
import { PLAYERS, savePlayerPatch, type Player, type PlayerSheet } from '../../data/players';
import { sheetBase, sheetExtra } from './playerSheets';
import { playerAbilityPassiveLines } from '../players/abilityPassiveStats';
import {
  STAT_COLUMNS,
  emptyStatLine,
  roundDefense,
  isDefenseKey,
  isZeroStat,
  itemStatLine,
  sumStatLines,
  type StatKey,
  type StatLine,
  type StatValue,
} from './statLine';

/** Claves del documento `stats` en Mongo, alineadas con el total de Cálculos. */
export const PLAYER_STATS_KEYS = [
  'nivel',
  'HP',
  'AC',
  'MR',
  'MANA',
  'AD',
  'AP',
  'PROB. CRÍT',
  'DAÑO CRÍT',
  'SPE',
  'Attacks',
  'ATK spe',
  'Abilities',
  'Ab haste',
  'LETALIDAD',
  'PEN. MÁG.',
  'PEN. ARM. %',
  'PEN. MÁG. %',
  'CUR/ESC %',
  'TENACIDAD %',
  'RES. RALENT. %',
  'ROBO VIDA %',
  'OMNISUCCIÓN %',
  'RANGO',
  'REGEN. VIDA',
  'REGEN. MANÁ',
] as const;

export type PlayerStatsKey = (typeof PLAYER_STATS_KEYS)[number];

export type PlayerStats = Record<PlayerStatsKey, StatValue>;

const LINE_TO_STORED: Record<StatKey, Exclude<PlayerStatsKey, 'nivel'>> = {
  hp: 'HP',
  ac: 'AC',
  mr: 'MR',
  mana: 'MANA',
  ad: 'AD',
  ap: 'AP',
  critChance: 'PROB. CRÍT',
  critDamage: 'DAÑO CRÍT',
  spe: 'SPE',
  atkSpe: 'Attacks',
  atkSpePct: 'ATK spe',
  abSpe: 'Abilities',
  abSpePct: 'Ab haste',
  lethality: 'LETALIDAD',
  magicPen: 'PEN. MÁG.',
  armorPenPct: 'PEN. ARM. %',
  magicPenPct: 'PEN. MÁG. %',
  healShieldPct: 'CUR/ESC %',
  tenacityPct: 'TENACIDAD %',
  slowResistPct: 'RES. RALENT. %',
  lifeStealPct: 'ROBO VIDA %',
  omnivampPct: 'OMNISUCCIÓN %',
  range: 'RANGO',
  healthRegen: 'REGEN. VIDA',
  manaRegen: 'REGEN. MANÁ',
};

/** Stats del total que se redondean al entero más cercano. */
const ROUNDED_TOTAL_KEYS = ['lethality', 'magicPen'] as const;


/** Ability passives + equipped permanent item-stack bonuses. Combat must NOT also pass combatExtraLines that already include stacks. */
export function playerPersistentBonusLines(player: Player, equipment: string[] = player.equipamiento, level?: number): StatLine[] {
  return [
    ...playerAbilityPassiveLines(player, level),
    ...itemPermanentStackLines(equipment, getNamedEffectData(), player.stacks),
  ];
}

function lolContribution(stat: LolDiceStat, value: StatValue | undefined, lol?: number): { lol: number; leftover?: StatValue } {
  if (typeof lol === 'number' && Number.isFinite(lol)) return { lol };
  if (value === undefined || isZeroStat(value)) return { lol: 0 };
  if (typeof value === 'string') {
    const inverted = invertLolDice(stat, value);
    if (inverted !== null) return { lol: inverted };
    return { lol: 0, leftover: value };
  }
  return { lol: 0, leftover: value };
}

function combineLolStat(stat: LolDiceStat, parts: { lol: number; leftover?: StatValue }[]): StatValue {
  const lolSum = parts.reduce((sum, part) => sum + part.lol, 0);
  const lines: StatLine[] = [];
  const converted = lolToDice(stat, Math.max(0, lolSum));
  if (converted && !isZeroStat(converted.text)) {
    const line = emptyStatLine();
    line[stat] = converted.text;
    lines.push(line);
  }
  for (const part of parts) {
    if (part.leftover === undefined || isZeroStat(part.leftover)) continue;
    const line = emptyStatLine();
    line[stat] = part.leftover;
    lines.push(line);
  }
  if (!lines.length) return 0;
  return sumStatLines(lines)[stat];
}

function lolPartsFor(stat: LolDiceStat, sheet: PlayerSheet | undefined, equipment: string[], extraLines: StatLine[], base: StatLine | undefined): { lol: number; leftover?: StatValue }[] {
  const parts: { lol: number; leftover?: StatValue }[] = [];
  if (base) parts.push(lolContribution(stat, base[stat]));
  for (const name of equipment) {
    const item = findItem(name);
    const key = stat === 'ad' ? 'AD' : 'AP';
    parts.push(lolContribution(stat, item?.stats?.[key], item?.lolStats?.[key]));
  }
  const extra = sheetExtra(sheet);
  if (extra) parts.push(lolContribution(stat, extra[stat]));
  for (const line of extraLines) {
    const lol = lolStatBonusOf(line);
    if (lol && typeof lol[stat] === 'number' && Number.isFinite(lol[stat])) {
      parts.push({ lol: lol[stat] });
      continue;
    }
    parts.push(lolContribution(stat, line[stat]));
  }
  return parts;
}

/** Misma suma que la fila Total de Cálculos (base de rol + equipo + extra). AD/AP: suma LoL y convierte una vez. */
export function playerTotalLine(
  sheet: PlayerSheet | undefined,
  equipment: string[],
  level?: number,
  /** Bonus temporales de combate (cuentan como bonus, antes de redondear). */
  extra: StatLine[] = [],
): StatLine {
  const base = sheet ? sheetBase(sheet, level) : undefined;
  const total = sumStatLines([...(base ? [base] : []), playerBonusLine(sheet, equipment, extra)]);
  total.ad = combineLolStat('ad', lolPartsFor('ad', sheet, equipment, extra, base));
  total.ap = combineLolStat('ap', lolPartsFor('ap', sheet, equipment, extra, base));
  // Letalidad y pen. mágica planas: al entero más cercano (sobre el total, no por ítem).
  for (const key of ROUNDED_TOTAL_KEYS) {
    const value = total[key];
    if (typeof value === 'number' && Number.isFinite(value)) total[key] = Math.round(value);
  }
  return total;
}

/** Bonus = equipo + extras; nunca incluye dados ni planos de la base de rol/nivel. */
export function playerBonusLine(sheet: PlayerSheet | undefined, equipment: string[], extraLines: StatLine[] = []): StatLine {
  const parts: StatLine[] = [...extraLines];
  for (const name of equipment) {
    const item = findItem(name);
    parts.push(item ? itemStatLine(item.stats) : emptyStatLine());
  }
  const extra = sheetExtra(sheet);
  if (extra) parts.push(extra);
  return sumStatLines(parts);
}

/**
 * PG máximos de la ficha = HP del TOTAL de Cálculos (base rol×nivel + equipo + extra).
 * Undefined si la ficha no tiene tabla de rol: entonces el máximo sigue siendo el guardado a mano.
 */
export function playerMaxHp(
  sheet: PlayerSheet | undefined,
  equipment: string[],
  /** Bonus fijos fuera del equipo (pasivas de habilidades con stats). */
  extra: StatLine[] = [],
): number | undefined {
  if (!sheet || !sheetBase(sheet)) return undefined;
  const hp = playerTotalLine(sheet, equipment, undefined, extra).hp;
  return typeof hp === 'number' && Number.isFinite(hp) ? Math.max(0, Math.floor(hp)) : undefined;
}

/** Mana max from the sheet total (numeric only). */
export function playerMaxMana(
  sheet: PlayerSheet | undefined,
  equipment: string[],
  extra: StatLine[] = [],
): number | undefined {
  if (!sheet || !sheetBase(sheet)) return undefined;
  const mana = playerTotalLine(sheet, equipment, undefined, extra).mana;
  return typeof mana === 'number' && Number.isFinite(mana) ? Math.max(0, Math.floor(mana)) : undefined;
}

const finiteNumber = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Alinea `hp` (máximo guardado) con el máximo de la tabla.
 * El actual se mueve lo mismo que el máximo (como en LoL al comprar/vender vida), sin bajar de 0
 * ni pasar del nuevo máximo; si estaba vivo, no lo deja a 0 por quitarse un ítem.
 * Devuelve null si ya está alineado.
 */
export function hpSyncPatch(
  player: Pick<Player, 'hp' | 'actualHp'>,
  nextMax: number | undefined,
): { hp: number; actualHp: number } | null {
  if (nextMax === undefined) return null;
  const oldMax = finiteNumber(player.hp) ? player.hp : undefined;
  const actual = finiteNumber(player.actualHp) ? player.actualHp : (oldMax ?? nextMax);
  const delta = oldMax === undefined ? 0 : nextMax - oldMax;
  let nextActual = Math.min(nextMax, Math.max(0, actual + delta));
  if (actual > 0 && nextActual === 0 && nextMax > 0) nextActual = 1;
  if (oldMax === nextMax && nextActual === player.actualHp) return null;
  return { hp: nextMax, actualHp: nextActual };
}

/** Align `mana` (max) with the table, same rules as hpSyncPatch. */
export function manaSyncPatch(
  player: Pick<Player, 'mana' | 'actualMana'>,
  nextMax: number | undefined,
): { mana: number; actualMana: number } | null {
  if (nextMax === undefined) return null;
  const oldMax = finiteNumber(player.mana) ? player.mana : undefined;
  const actual = finiteNumber(player.actualMana) ? player.actualMana : (oldMax ?? nextMax);
  const delta = oldMax === undefined ? 0 : nextMax - oldMax;
  let nextActual = Math.min(nextMax, Math.max(0, actual + delta));
  if (actual > 0 && nextActual === 0 && nextMax > 0) nextActual = 1;
  if (oldMax === nextMax && nextActual === player.actualMana) return null;
  return { mana: nextMax, actualMana: nextActual };
}

export function playerStatsDocument(sheet: PlayerSheet | undefined, equipment: string[], extra: StatLine[] = []): PlayerStats {
  const total = playerTotalLine(sheet, equipment, undefined, extra);
  const stats = { nivel: PARTY.level } as PlayerStats;
  for (const column of STAT_COLUMNS) {
    stats[LINE_TO_STORED[column.key]] = isDefenseKey(column.key)
      ? roundDefense(total[column.key])
      : total[column.key];
  }
  return stats;
}

export async function syncPlayerStats(
  playerName: string,
  sheet: PlayerSheet | undefined,
  equipment: string[],
  combat: Pick<Player, 'hp' | 'actualHp' | 'mana' | 'actualMana'> = {},
  /** Pasivas de habilidades con stats (playerAbilityPassiveLines). */
  extra: StatLine[] = [],
): Promise<void> {
  const hp = hpSyncPatch(combat, playerMaxHp(sheet, equipment, extra));
  const mana = manaSyncPatch(combat, playerMaxMana(sheet, equipment, extra));
  await savePlayerPatch(playerName, { stats: playerStatsDocument(sheet, equipment, extra), ...hp, ...mana });
}

/** ¿El total guardado ya coincide con el calculado? */
function sameStats(saved: Player['stats'], next: PlayerStats): boolean {
  if (!saved) return false;
  return PLAYER_STATS_KEYS.every(key => saved[key] === next[key]);
}

/**
 * Recalcula y guarda el total (y los PG máximos) de todos los players con ficha (p. ej. al cambiar el nivel).
 * Los que aún no tienen `sheet` en Mongo no se tocan, para no pisar su total sin la base de rol.
 * Solo se hace PATCH de los que de verdad cambian (así no se avisa a las otras pestañas por nada).
 * Devuelve cuántos players se guardaron.
 */
export async function syncAllPlayerStats(): Promise<number> {
  await ensureNamedEffectData();
  const saves = PLAYERS.filter(player => player.sheet).flatMap(player => {
    const extra = playerPersistentBonusLines(player, player.equipamiento, PARTY.level);
    const stats = playerStatsDocument(player.sheet, player.equipamiento, extra);
    const hp = hpSyncPatch(player, playerMaxHp(player.sheet, player.equipamiento, extra));
    const mana = manaSyncPatch(player, playerMaxMana(player.sheet, player.equipamiento, extra));
    if (!hp && !mana && sameStats(player.stats, stats)) return [];
    return [savePlayerPatch(player.name, { stats, ...hp, ...mana })];
  });
  await Promise.all(saves);
  return saves.length;
}
