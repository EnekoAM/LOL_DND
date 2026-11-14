import type { AbilityDamage } from '../../data/champions';
import type { Item } from '../../data/items';
import { itemStatLine, type StatValue } from '../calculos/statLine';

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
export function parseDamageStat(source: StatValue): { groups: { count: number; sides: number; sign: number }[]; flat: number } {
  const text = String(source).replace(/\s+/g, '').replace(/,/g, '.');
  const groups: { count: number; sides: number; sign: number }[] = [];
  let flat = 0;
  if (!text || text === '-') return { groups, flat };
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
    groups.push({ count, sides, sign: die[1] === '-' ? -1 : 1 });
  }
  if (!Number.isFinite(flat)) throw new Error(`Estadística de daño no válida: ${source}`);
  return { groups, flat };
}

export function rollDamageStat(source: StatValue, random = Math.random): StatRoll {
  const parsed = parseDamageStat(source);
  const groups = parsed.groups.map(group => ({
    ...group,
    rolls: Array.from({ length: group.count }, () => Math.floor(random() * group.sides) + 1),
  }));
  const total = groups.reduce((sum, group) => sum + group.sign * group.rolls.reduce((a, b) => a + b, 0), parsed.flat);
  return { source, groups, flat: parsed.flat, total };
}

/** Valor esperado de un AD/AP con dados (sin tirar): n×(caras+1)/2 + plano. */
export function expectedDamageStat(source: StatValue | undefined): number {
  if (source == null || source === '' || source === '-') return 0;
  try {
    const parsed = parseDamageStat(source);
    const dice = parsed.groups.reduce((sum, group) => sum + group.sign * group.count * (group.sides + 1) / 2, 0);
    return parsed.flat + dice;
  } catch {
    return 0;
  }
}


/** AD por el que se reparte hpAdPer100. Ausente = 100 (compatibilidad). */
export function hpAdPerAmount(damage: AbilityDamage | undefined): number {
  const per = damage?.hpAdPer ?? 100;
  return Number.isFinite(per) && per > 0 ? per : 100;
}

/** Suma de la media de los dados de AD de ítems (p. ej. 2d6+1 = 8). Reutilizable. */
export function expectedItemAdFromDice(items: Array<Pick<Item, 'stats'> | null | undefined>): number {
  return items.reduce((sum, item) => {
    if (!item?.stats) return sum;
    return sum + expectedDamageStat(itemStatLine(item.stats).ad);
  }, 0);
}

/** Ratio extra de vida: (hpAdPer100 / 100) × (ad / hpAdPer). */
export function hpAdExtraRatio(damage: AbilityDamage | undefined, ad: number): number {
  const pct = damage?.hpAdPer100 ?? 0;
  if (!pct || !ad) return 0;
  return (pct / 100) * (ad / hpAdPerAmount(damage));
}

export function formatHpAdBonus(damage: AbilityDamage | undefined): string {
  if (!damage?.hpAdPer100) return '';
  const per = hpAdPerAmount(damage);
  const src = damage.hpAdSource === 'itemDiceAvg'
    ? 'AD media de dados de ítems'
    : damage.hpAdSource === 'total' ? 'AD total' : 'AD bonus';
  const pct = String(damage.hpAdPer100).replace('.', ',');
  return ` + ${pct}%/${per} ${src}`;
}

export const hasDamageScaling = (damage: AbilityDamage | undefined): boolean =>
  [damage?.ad, damage?.ap, damage?.hp].some(values => values?.some(value => Number.isFinite(value) && value !== 0));

/** A single coefficient remains constant; shorter lists stop at their last rank. */
export const scalingAtRank = (values: number[] | undefined, rank: number): number => {
  if (!values?.length || rank < 1) return 0;
  const value = values[Math.min(Math.floor(rank), values.length) - 1];
  if (!Number.isFinite(value)) throw new Error('El escalado de daño no es válido');
  return value;
};

export type HpScalingSource = 'max' | 'current' | 'missing' | 'bonus';

/** Daño = ratio de vida del rango × la vida (máx. / actual / faltante / bonus). 0 si no hay. */
export function hpDamageAmount(
  damage: AbilityDamage | undefined,
  rank: number,
  hp: { current: number; max?: number; bonus?: number },
  ad = 0,
): number {
  const ratio = scalingAtRank(damage?.hp, rank);
  const extra = hpAdExtraRatio(damage, ad);
  const totalRatio = ratio + extra;
  if (!totalRatio) return 0;
  const source = damage?.hpSource ?? 'max';
  const max = hp.max ?? 0;
  const current = hp.current;
  const base = source === 'current' ? current
    : source === 'missing' ? Math.max(0, max - current)
    : source === 'bonus' ? (hp.bonus ?? 0)
    : max;
  if (!base) return 0;
  return Math.round(totalRatio * base);
}

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