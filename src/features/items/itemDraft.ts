import { STAT_KEYS, type Item, type ItemLolStats, type ItemStats, type ItemUpdate, type StatValue } from '../../data/items';
import { lolToDice, type LolDiceStat } from '../../data/lolDiceTable';
import { compactStatText, isStatAmountText } from '../calculos/statLine';

export type ItemDraft = {
  rareza: string;
  coste: string;
  /** Descripcion libre del item. Pasiva / activa, CD, stacks, bonus... ya no se editan aqui (van en Efectos). */
  description: string;
  /** Efectos con nombre (ids). */
  namedEffects: string[];
  /** Texto tal cual lo escribe el usuario; se convierte al guardar. */
  stats: Record<string, string>;
  /** AD / AP del LoL tal cual se escriben (claves 'AD' / 'AP'); rellenan los dados de esa stat. */
  lol: Record<string, string>;
};

/** Stats del item que se pueden escribir con el valor del LoL (tabla de dados). */
export const lolDiceStatOf = (key: string): LolDiceStat | null => {
  const upper = key.trim().toUpperCase();
  return upper === 'AD' ? 'ad' : upper === 'AP' ? 'ap' : null;
};

/** Dados de la tabla para el valor del LoL escrito ('' si esta vacio o no vale). */
export function lolStatDice(key: string, text: string): string {
  const stat = lolDiceStatOf(key);
  const value = Number(text.trim().replace(',', '.'));
  if (!stat || !text.trim() || !Number.isFinite(value)) return '';
  return lolToDice(stat, value)?.text ?? '';
}

function lolDraft(item: Item): Record<string, string> {
  const lol: Record<string, string> = {};
  for (const [key, value] of Object.entries(item.lolStats ?? {})) if (typeof value === 'number') lol[key] = String(value);
  return lol;
}

function parseLolStats(draft: ItemDraft): ItemLolStats | null {
  const out: ItemLolStats = {};
  for (const [key, text] of Object.entries(draft.lol)) {
    if ((key !== 'AD' && key !== 'AP') || !text.trim()) continue;
    const value = Number(text.trim().replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) throw new Error(`${key} del LoL tiene que ser un n\u00famero igual o mayor que 0`);
    out[key] = value;
  }
  return out.AD !== undefined || out.AP !== undefined ? out : null;
}

/** Dados como "1d4", "5d6+1d2", "4d6+1d4+3" o "d8". */

/** Todas las stats conocidas, más las que tenga el ítem aunque no estén en el primero del JSON. */
export const editableStatKeys = (item: Item): string[] => {
  const keys = [...STAT_KEYS];
  for (const key of Object.keys(item.stats)) if (!keys.includes(key)) keys.push(key);
  return keys;
};

export function itemToDraft(item: Item): ItemDraft {
  const stats: Record<string, string> = {};
  for (const key of editableStatKeys(item)) {
    const value = item.stats[key];
    stats[key] = value === undefined || value === 0 ? '' : String(value);
  }
  return {
    rareza: item.rareza,
    coste: typeof item.coste === 'number' ? String(item.coste) : '',
    description: item.description ?? '',
    namedEffects: [...(item.namedEffects ?? [])],
    stats,
    lol: lolDraft(item),
  };
}

function parseStat(key: string, text: string, original: StatValue | undefined): StatValue {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const amount = Number(trimmed.replace(',', '.'));
  if (Number.isFinite(amount)) return amount;
  if (isStatAmountText(trimmed)) return compactStatText(trimmed).toLowerCase();
  // Respeta textos raros que ya venían en los datos aunque no sean un dado.
  if (typeof original === 'string' && original.trim() === trimmed) return original;
  throw new Error(`${key} tiene que ser un número o dados (por ejemplo 1d6+1d4)`);
}

function parseCost(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const cost = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(cost) || cost < 0) throw new Error('El coste tiene que ser un número igual o mayor que 0');
  return cost;
}

export function draftToItemUpdate(draft: ItemDraft, item: Item): ItemUpdate {
  const rareza = draft.rareza.trim();
  if (!rareza) throw new Error('El ítem necesita una rareza');

  const stats: ItemStats = {};
  for (const [key, text] of Object.entries(draft.stats)) {
    stats[key] = parseStat(key, text, item.stats[key]);
  }

  const description = draft.description.trim();
  if (description.length > 2000) throw new Error('La descripci\u00f3n no puede superar 2000 caracteres');

  return {
    rareza,
    // Sin efecto (pasiva / activa), stacks, CD, duracion, objetivo, nombre ni pasiva en combate:
    // el servidor deja esos campos como esten en la BD (ya no se editan desde aqui).
    stats,
    coste: parseCost(draft.coste),
    description: description || null,
    namedEffects: draft.namedEffects.length ? [...new Set(draft.namedEffects)] : null,
    lolStats: parseLolStats(draft),
  };
}
