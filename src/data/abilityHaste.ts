import { findItem, type ItemStats } from './items';
import { formatStat, type StatValue } from '../features/calculos/statLine';
import { getVisibleStats } from '../features/items/stats';

/**
 * Velocidad de habilidades (Ab haste) de los items con alcance:
 * - 'Ab haste': vale para todas las habilidades (la de siempre; es la que entra en la ficha como abSpePct).
 * - 'Ab haste basic': solo habilidades basicas (Q/W/E).
 * - 'Ab haste ult': solo la definitiva (R).
 * En todas partes se ensena solo la general; el detalle sale en el tooltip.
 */
export const HASTE_KEY = 'Ab haste';
export const HASTE_BASIC_KEY = 'Ab haste basic';
export const HASTE_ULT_KEY = 'Ab haste ult';
export const HASTE_KEYS: readonly string[] = [HASTE_KEY, HASTE_BASIC_KEY, HASTE_ULT_KEY];

export type HasteScope = 'all' | 'basic' | 'ult';
export const HASTE_SCOPES: { id: HasteScope; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'basic', label: 'Solo b\u00e1sicas (Q/W/E)' },
  { id: 'ult', label: 'Solo definitiva (R)' },
];
export const hasteKeyOf = (scope: HasteScope): string => (scope === 'basic' ? HASTE_BASIC_KEY : scope === 'ult' ? HASTE_ULT_KEY : HASTE_KEY);
export const scopeOfKey = (key: string | undefined): HasteScope => (key === HASTE_BASIC_KEY ? 'basic' : key === HASTE_ULT_KEY ? 'ult' : 'all');

const num = (value: StatValue | undefined | null): number => {
  if (value === undefined || value === null) return 0;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Nombre visible de una clave de stat de item (las de alcance llevan su etiqueta). */
export function statKeyLabel(key: string): string {
  if (key === HASTE_BASIC_KEY) return 'Ab haste (b\u00e1sicas)';
  if (key === HASTE_ULT_KEY) return 'Ab haste (R)';
  return key;
}

/** Tooltip: general, b\u00e1sicas (general + solo b\u00e1sicas) y definitiva (general + solo R). */
export function hasteTooltip(generic: StatValue, basic: number, ult: number): string {
  const g = formatStat(generic);
  return `Total haste: ${g}\nBasic haste: ${g} + ${formatStat(basic)}\nDefinitive haste: ${g} + ${formatStat(ult)}`;
}

export function itemHaste(stats: ItemStats | undefined): { generic: number; basic: number; ult: number } {
  return { generic: num(stats?.[HASTE_KEY]), basic: num(stats?.[HASTE_BASIC_KEY]), ult: num(stats?.[HASTE_ULT_KEY]) };
}

/** Tooltip de la velocidad de habilidades de un item (undefined si no tiene ninguna). */
export function itemHasteTitle(stats: ItemStats | undefined): string | undefined {
  const h = itemHaste(stats);
  return h.generic || h.basic || h.ult ? hasteTooltip(h.generic, h.basic, h.ult) : undefined;
}

/** Suma de las velocidades de habilidades con alcance del equipamiento (la general ya va en la ficha). */
export function equipmentScopedHaste(equipment: string[]): { basic: number; ult: number } {
  let basic = 0;
  let ult = 0;
  for (const name of equipment) {
    const h = itemHaste(findItem(name)?.stats);
    basic += h.basic;
    ult += h.ult;
  }
  return { basic, ult };
}

/** Tooltip del total de la ficha: general (total) + lo de b\u00e1sicas / R de los items equipados. */
export function totalHasteTitle(generic: StatValue, equipment: string[]): string {
  const scoped = equipmentScopedHaste(equipment);
  return hasteTooltip(generic, scoped.basic, scoped.ult);
}

/** Velocidad de habilidades que cuenta para una habilidad: general + b\u00e1sicas (Q/W/E) o general + definitiva (R). */
export function abilityHasteFor(generic: number, scoped: { basic: number; ult: number }, ultimate: boolean): number {
  return generic + (ultimate ? scoped.ult : scoped.basic);
}

/**
 * Filas de stats de un item para tarjetas / detalle / comparar: si tiene la general, solo esa (con tooltip);
 * si solo tiene de alcance, esas con su etiqueta (\u00abAb haste (R)\u00bb) y el tooltip.
 */
export function itemStatRows(stats: ItemStats): { key: string; label: string; value: StatValue; title?: string }[] {
  const h = itemHaste(stats);
  const title = itemHasteTitle(stats);
  const out: { key: string; label: string; value: StatValue; title?: string }[] = [];
  for (const [key, value] of getVisibleStats(stats)) {
    if ((key === HASTE_BASIC_KEY || key === HASTE_ULT_KEY) && h.generic) continue;
    out.push({ key, label: statKeyLabel(key), value, ...(HASTE_KEYS.includes(key) && title ? { title } : {}) });
  }
  return out;
}
