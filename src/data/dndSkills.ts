import type { AbilityScoreKey } from './players';

/** Claves de las 18 habilidades de D&D 5e (players.sheet.skills). */
export const DND_SKILL_KEYS = [
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
] as const;

export type DndSkillKey = (typeof DND_SKILL_KEYS)[number];

/** Competencias marcadas (solo se guardan las `true`). */
export type DndSkillProficiencies = Partial<Record<DndSkillKey, boolean>>;

/** `altAbilities`: se usa el mod más alto entre `ability` y estas. */
export type DndSkill = { key: DndSkillKey; label: string; ability: AbilityScoreKey; altAbilities?: AbilityScoreKey[] };

/** Orden alfabético en español, como la hoja de Let's Role. */
export const DND_SKILLS: DndSkill[] = [
  { key: 'acrobatics', label: 'Acrobacias', ability: 'dexterity' },
  { key: 'arcana', label: 'C. Arcano', ability: 'intelligence' },
  { key: 'athletics', label: 'Atletismo', ability: 'strength' },
  { key: 'deception', label: 'Engaño', ability: 'charisma' },
  { key: 'history', label: 'Historia', ability: 'intelligence' },
  { key: 'performance', label: 'Interpretación', ability: 'charisma' },
  { key: 'intimidation', label: 'Intimidación', ability: 'charisma', altAbilities: ['strength'] },
  { key: 'investigation', label: 'Investigación', ability: 'intelligence' },
  { key: 'sleightOfHand', label: 'Juego de Manos', ability: 'dexterity' },
  { key: 'medicine', label: 'Medicina', ability: 'wisdom' },
  { key: 'nature', label: 'Naturaleza', ability: 'intelligence' },
  { key: 'perception', label: 'Percepción', ability: 'wisdom' },
  { key: 'insight', label: 'Perspicacia', ability: 'wisdom' },
  { key: 'persuasion', label: 'Persuasión', ability: 'charisma' },
  { key: 'religion', label: 'Religión', ability: 'intelligence' },
  { key: 'stealth', label: 'Sigilo', ability: 'dexterity' },
  { key: 'survival', label: 'Supervivencia', ability: 'wisdom' },
  { key: 'animalHandling', label: 'T. con Animales', ability: 'wisdom' },
];

/** Bono de competencia D&D 5e: +2 en 1–4, +3 en 5–8, … +6 en 17–20. */
export function proficiencyBonus(level: number): number {
  const lvl = Math.max(1, Math.floor(level) || 1);
  return Math.floor((lvl - 1) / 4) + 2;
}