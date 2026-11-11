import type { ItemStats, StatValue } from '../../data/items';

/**
 * Los dados ("1d4") no son numéricos pero cuentan como stat positiva.
 * Sin la clave (stats nuevas que solo tienen algunos ítems), vacío o "-" no cuenta:
 * antes Number(undefined) = NaN pasaba como «dado» y el filtro dejaba pasar todos los ítems.
 */
export const hasStat = (value: StatValue | null | undefined): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || text === '-') return false;
    const amount = Number(text.replace(',', '.'));
    return Number.isNaN(amount) || amount > 0;
  }
  return Number.isFinite(value) && value > 0;
};

export const formatStatValue = (value: StatValue): string =>
  Number(value) > 0 ? `+${value}` : String(value);

export const getVisibleStats = (stats: ItemStats): [string, StatValue][] =>
  Object.entries(stats).filter(([, value]) => value !== 0);
