import { findItem } from '../../data/items';
import { PARTY } from '../../data/party';
import { PLAYERS, savePlayerPatch } from '../../data/players';
import { findPlayerSheet, sheetBase } from './playerSheets';
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
export function playerTotalLine(playerName: string, equipment: string[]): StatLine {
  const sheet = findPlayerSheet(playerName);
  const parts: StatLine[] = [];
  const base = sheet ? sheetBase(sheet) : undefined;
  if (base) parts.push(base);
  for (const name of equipment) {
    const item = findItem(name);
    parts.push(item ? itemStatLine(item.stats) : emptyStatLine());
  }
  if (sheet?.extra) parts.push(sheet.extra);
  return sumStatLines(parts);
}

export function playerStatsDocument(playerName: string, equipment: string[]): PlayerStats {
  const total = playerTotalLine(playerName, equipment);
  const stats = { nivel: PARTY.level } as PlayerStats;
  for (const column of STAT_COLUMNS) {
    stats[LINE_TO_STORED[column.key]] = total[column.key];
  }
  return stats;
}

export async function syncPlayerStats(playerName: string, equipment: string[]): Promise<void> {
  await savePlayerPatch(playerName, { stats: playerStatsDocument(playerName, equipment) });
}

/** Recalcula y guarda el total de todos los players (p. ej. al cambiar el nivel). */
export async function syncAllPlayerStats(): Promise<void> {
  await Promise.all(
    PLAYERS.map(player => syncPlayerStats(player.name, player.equipamiento)),
  );
}
