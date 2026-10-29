import { PARTY } from '../../data/party';
import { findPlayer, type AbilityScoreKey, type PlayerSheet } from '../../data/players';
import { findRoleTable } from '../../data/roles';
import { STAT_COLUMNS, emptyStatLine, type StatKey, type StatLine } from './statLine';

export type { AbilityScoreKey, PlayerSheet } from '../../data/players';

export type AbilityScore = { score: number; modifier: number };

export const ABILITY_SCORES: { key: AbilityScoreKey; label: string; short: string }[] = [
  { key: 'strength', label: 'Fuerza', short: 'FUE' },
  { key: 'dexterity', label: 'Destreza', short: 'DES' },
  { key: 'constitution', label: 'Constitución', short: 'CON' },
  { key: 'intelligence', label: 'Inteligencia', short: 'INT' },
  { key: 'wisdom', label: 'Sabiduría', short: 'SAB' },
  { key: 'charisma', label: 'Carisma', short: 'CAR' },
];

export const DEFAULT_SCORE = 10;

/** Modificador D&D 5e: floor((puntuación - 10) / 2). */
export function scoreModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function abilityScore(sheet: PlayerSheet | undefined, key: AbilityScoreKey): AbilityScore | undefined {
  const score = sheet?.scores?.[key];
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined;
  return { score, modifier: scoreModifier(score) };
}

/** El nivel de la ficha es el del grupo guardado en la base de datos. */
export function sheetLevel(): number {
  return PARTY.level;
}

export function sheetBase(sheet: PlayerSheet): StatLine | undefined {
  return findRoleTable(sheet.roleId)?.levels[sheetLevel() - 1];
}

const STAT_KEYS = new Set<string>(STAT_COLUMNS.map(column => column.key));

/** Fila Extra completa (las claves que faltan valen 0). Undefined si no hay ninguna. */
export function sheetExtra(sheet: PlayerSheet | undefined): StatLine | undefined {
  if (!sheet?.extra) return undefined;
  const line = emptyStatLine();
  let any = false;
  for (const [key, value] of Object.entries(sheet.extra)) {
    if (!STAT_KEYS.has(key) || value === undefined) continue;
    line[key as StatKey] = value;
    any = true;
  }
  return any ? line : undefined;
}

/** Ficha guardada en Mongo para un player (por nombre). */
export function findPlayerSheet(name: string): PlayerSheet | undefined {
  return findPlayer(name)?.sheet;
}
