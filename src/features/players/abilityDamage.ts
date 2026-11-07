import type { AbilityDamage } from '../../data/champions';
import type { StatValue } from '../calculos/statLine';

export type DamageStats = {
  ad: StatValue;
  ap: StatValue;
  bonus?: { ad: StatValue; ap: StatValue };
};

export type StatRoll = {
  source: StatValue;
  groups: { count: number; sides: number; rolls: number[]; sign: number }[];
  flat: number;
  total: number;
};

/** AD/AP can contain dice, flat modifiers, or both (e.g. 2d4+2d2+3). */
export function rollDamageStat(source: StatValue, random = Math.random): StatRoll {
  const text = String(source).replace(/\s+/g, '').replace(/,/g, '.');
  const groups: StatRoll['groups'] = [];
  let flat = 0;
  if (!text || text === '-') return { source, groups, flat, total: 0 };
  if (!/^[+-]?(?:\d*d\d+|\d+(?:\.\d+)?)(?:[+-](?:\d*d\d+|\d+(?:\.\d+)?))*$/i.test(text)) {
    throw new Error(`Estadística de daño no válida: ${source}`);
  }
  const terms = text.match(/[+-]?(?:\d*d\d+|\d+(?:\.\d+)?)/gi) ?? [];
  if (terms.join('') !== text) throw new Error(`Estadística de daño no válida: ${source}`);
  let diceCount = 0;
  for (const term of terms) {
    const die = term.match(/^([+-]?)(\d*)d(\d+)$/i);
    if (!die) {
      flat += Number(term);
      continue;
    }
    const count = Number(die[2] || 1);
    const sides = Number(die[3]);
    diceCount += count;
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(sides) || count < 1 || sides < 2 || diceCount > 1000) {
      throw new Error(`Dados de daño no válidos: ${source} (máximo 1000 dados)`);
    }
    groups.push({ count, sides, sign: die[1] === '-' ? -1 : 1, rolls: [] });
  }
  if (!Number.isFinite(flat)) throw new Error(`Estadística de daño no válida: ${source}`);
  // Validate the complete expression before drawing any dice.
  for (const group of groups) {
    group.rolls = Array.from({ length: group.count }, () => Math.floor(random() * group.sides) + 1);
  }
  const total = groups.reduce((sum, group) => sum + group.sign * group.rolls.reduce((a, b) => a + b, 0), flat);
  return { source, groups, flat, total };
}

export const hasDamageScaling = (damage: AbilityDamage | undefined): boolean =>
  [damage?.ad, damage?.ap].some(values => values?.some(value => Number.isFinite(value) && value !== 0));

/** A single coefficient remains constant; shorter lists stop at their last rank. */
export const scalingAtRank = (values: number[] | undefined, rank: number): number => {
  if (!values?.length || rank < 1) return 0;
  const value = values[Math.min(Math.floor(rank), values.length) - 1];
  if (!Number.isFinite(value)) throw new Error('El escalado de daño no es válido');
  return value;
};

export function rollAbilityDamage(
  damage: AbilityDamage,
  stats: DamageStats,
  rank: number,
  random = Math.random,
) {
  if (!Number.isFinite(rank) || rank < 1) throw new Error('Habilidad sin aprender (rango 0). Asigna un punto para tirar daño.');
  const contributions = (['ad', 'ap'] as const).flatMap(stat => {
    const scaling = scalingAtRank(damage[stat], rank);
    if (scaling === 0) return [];
    const source = damage[stat === 'ad' ? 'adSource' : 'apSource'] ?? 'total';
    if (source === 'bonus' && !stats.bonus) throw new Error('No se pudieron calcular las estadísticas bonus');
    const roll = rollDamageStat(source === 'bonus' ? stats.bonus![stat] : stats[stat], random);
    return [{ stat, source, scaling, roll, damage: roll.total * scaling }];
  });
  return { contributions, total: contributions.reduce((sum, entry) => sum + entry.damage, 0) };
}

export type AbilityDamageRoll = ReturnType<typeof rollAbilityDamage>;