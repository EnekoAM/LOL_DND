import { PARTY } from '../../data/party';
import { normalizeName } from '../../lib/text';
import { findRoleTable } from './roleTables';
import { emptyStatLine, type StatLine } from './statLine';

export type AbilityScore = { score: number; modifier: number };

export type AbilityScoreKey =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export const ABILITY_SCORES: { key: AbilityScoreKey; label: string }[] = [
  { key: 'strength', label: 'Fuerza' },
  { key: 'dexterity', label: 'Destreza' },
  { key: 'constitution', label: 'Constitución' },
  { key: 'intelligence', label: 'Inteligencia' },
  { key: 'wisdom', label: 'Sabiduría' },
  { key: 'charisma', label: 'Carisma' },
];

export type PlayerSheet = {
  roleId: string;
  extra?: StatLine;
  scores?: Record<AbilityScoreKey, AbilityScore>;
};

/** El nivel de la ficha es el del grupo guardado en la base de datos. */
export function sheetLevel(): number {
  return PARTY.level;
}

export function sheetBase(sheet: PlayerSheet): StatLine | undefined {
  return findRoleTable(sheet.roleId)?.levels[sheetLevel() - 1];
}

const ZERAF: PlayerSheet = {
  roleId: 'asesino-ad',
  extra: { ...emptyStatLine(), mana: 5 },
  scores: {
    strength: { score: 8, modifier: -1 },
    dexterity: { score: 16, modifier: 3 },
    constitution: { score: 14, modifier: 2 },
    intelligence: { score: 8, modifier: -1 },
    wisdom: { score: 8, modifier: -1 },
    charisma: { score: 15, modifier: 2 },
  },
};

const SAMAEL: PlayerSheet = { roleId: 'mago' };

const COMBATIENTE: PlayerSheet = { roleId: 'luchador-ad' };

const SHEETS: Record<string, PlayerSheet> = {
  [normalizeName('Zeraf')]: ZERAF,
  [normalizeName('Samael')]: SAMAEL,
  [normalizeName('Combatiente')]: COMBATIENTE,
};

export function findPlayerSheet(name: string): PlayerSheet | undefined {
  return SHEETS[normalizeName(name)];
}
