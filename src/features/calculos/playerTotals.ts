import { findItem } from '../../data/items';
import { PARTY } from '../../data/party';
import { PLAYERS, savePlayerPatch, type Player, type PlayerSheet } from '../../data/players';
import { sheetBase, sheetExtra } from './playerSheets';
import {
  STAT_COLUMNS,
  emptyStatLine,
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
  'ATK_SPE',
  'ATK_SPE_%',
  'AB_SPE',
  'AB_SPE_%',
  'LETALIDAD',
  'PEN. MÁG.',
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
  atkSpe: 'ATK_SPE',
  atkSpePct: 'ATK_SPE_%',
  abSpe: 'AB_SPE',
  abSpePct: 'AB_SPE_%',
  lethality: 'LETALIDAD',
  magicPen: 'PEN. MÁG.',
};

/** Misma suma que la fila Total de Cálculos (base de rol + equipo + extra). */
export function playerTotalLine(sheet: PlayerSheet | undefined, equipment: string[]): StatLine {
  const parts: StatLine[] = [];
  const base = sheet ? sheetBase(sheet) : undefined;
  if (base) parts.push(base);
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
export function playerMaxHp(sheet: PlayerSheet | undefined, equipment: string[]): number | undefined {
  if (!sheet || !sheetBase(sheet)) return undefined;
  const hp = playerTotalLine(sheet, equipment).hp;
  return typeof hp === 'number' && Number.isFinite(hp) ? Math.max(0, Math.floor(hp)) : undefined;
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

export function playerStatsDocument(sheet: PlayerSheet | undefined, equipment: string[]): PlayerStats {
  const total = playerTotalLine(sheet, equipment);
  const stats = { nivel: PARTY.level } as PlayerStats;
  for (const column of STAT_COLUMNS) {
    stats[LINE_TO_STORED[column.key]] = total[column.key];
  }
  return stats;
}

export async function syncPlayerStats(
  playerName: string,
  sheet: PlayerSheet | undefined,
  equipment: string[],
  combat: Pick<Player, 'hp' | 'actualHp'> = {},
): Promise<void> {
  const hp = hpSyncPatch(combat, playerMaxHp(sheet, equipment));
  await savePlayerPatch(playerName, { stats: playerStatsDocument(sheet, equipment), ...hp });
}

/**
 * Recalcula y guarda el total (y los PG máximos) de todos los players con ficha (p. ej. al cambiar el nivel).
 * Los que aún no tienen `sheet` en Mongo no se tocan, para no pisar su total sin la base de rol.
 */
export async function syncAllPlayerStats(): Promise<void> {
  await Promise.all(
    PLAYERS.filter(player => player.sheet)
      .map(player => syncPlayerStats(player.name, player.sheet, player.equipamiento, player)),
  );
}
