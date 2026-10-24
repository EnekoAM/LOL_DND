import type { ItemStats, StatValue } from '../../data/items';

/** Los dados ("1d4") no son numéricos pero cuentan como stat positiva. */
export const hasStat = (value: StatValue): boolean => {
  const amount = Number(value);
  return Number.isNaN(amount) || amount > 0;
};

export const formatStatValue = (value: StatValue): string =>
  Number(value) > 0 ? `+${value}` : String(value);

export const getVisibleStats = (stats: ItemStats): [string, StatValue][] =>
  Object.entries(stats).filter(([, value]) => value !== 0);
