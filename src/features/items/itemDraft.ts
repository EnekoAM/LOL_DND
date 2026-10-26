import { STAT_KEYS, type Item, type ItemStats, type ItemUpdate, type StatValue } from '../../data/items';

export type ItemDraft = {
  rareza: string;
  pasiva: string;
  activa: string;
  coste: string;
  /** Texto tal cual lo escribe el usuario; se convierte al guardar. */
  stats: Record<string, string>;
};

/** El TSV marca con "-" los ítems sin ese efecto. */
const NO_EFFECT = '-';

/** Dados como "1d4", "2d6+1" o "d8". */
const DICE = /^\d*d\d+(\s*[+-]\s*\d+)?$/i;

const effectText = (text: string | undefined): string => {
  const trimmed = (text ?? '').trim();
  return trimmed === NO_EFFECT ? '' : trimmed;
};

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
    pasiva: effectText(item.efecto?.pasiva),
    activa: effectText(item.efecto?.activa),
    coste: typeof item.coste === 'number' ? String(item.coste) : '',
    stats,
  };
}

function parseStat(key: string, text: string, original: StatValue | undefined): StatValue {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const amount = Number(trimmed.replace(',', '.'));
  if (Number.isFinite(amount)) return amount;
  const compact = trimmed.replace(/\s+/g, '');
  if (DICE.test(compact)) return compact.toLowerCase();
  // Respeta textos raros que ya venían en los datos aunque no sean un dado.
  if (typeof original === 'string' && original.trim() === trimmed) return original;
  throw new Error(`${key} tiene que ser un número o un dado (por ejemplo 1d4)`);
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

  return {
    rareza,
    efecto: {
      pasiva: draft.pasiva.trim() || NO_EFFECT,
      activa: draft.activa.trim() || NO_EFFECT,
    },
    stats,
    coste: parseCost(draft.coste),
  };
}
