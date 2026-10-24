import { findItem, type Item } from '../../data/items';
import { normalizeName } from '../../lib/text';
import { itemAvailability } from './stock';

export type RecipeLine = {
  name: string;
  needed: number;
  /** Copias que nadie lleva equipadas. */
  available: number;
  item: Item | undefined;
};

/** Agrupa la receta por ítem. Una receta puede pedir el mismo ingrediente más de una vez. */
export function recipeLines(names: string[]): RecipeLine[] {
  const grouped = new Map<string, { name: string; needed: number }>();
  for (const raw of names) {
    const key = normalizeName(raw);
    const current = grouped.get(key);
    if (current) current.needed += 1;
    else grouped.set(key, { name: raw.trim(), needed: 1 });
  }

  return [...grouped.values()].map(entry => {
    const item = findItem(entry.name);
    return {
      name: item?.nombre ?? entry.name,
      needed: entry.needed,
      available: item ? itemAvailability(item).available : 0,
      item,
    };
  });
}

function itemCost(item: Item | undefined): number {
  return typeof item?.coste === 'number' && Number.isFinite(item.coste) && item.coste > 0 ? item.coste : 0;
}

/** Tarifa fija según la rareza del resultado. La misma tabla está en server/store.ts. */
const RARITY_CRAFT_GOLD: Record<string, number> = {
  epico: 400,
  legendario: 800,
};

function rarityKey(rareza: string): string {
  return rareza.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function rarityCraftGold(rareza: string): number {
  return RARITY_CRAFT_GOLD[rarityKey(rareza)] ?? 0;
}

/** Pico, Espadón y las dos varas: las piezas valen más y solo se cobran 200. La misma cifra está en server/store.ts. */
const SURPLUS_CRAFT_GOLD = 200;

/**
 * Oro del crafteo, sin la tarifa de rareza.
 * Si el resultado vale más que las piezas, se cobra la diferencia.
 * Si una sola pieza vale más, el coste guardado ya es el restante (Marcha veloz, 750).
 * Si varias piezas valen más, no se devuelve la diferencia: se cobran 200.
 * La misma cuenta está en server/store.ts.
 */
function restanteGold(item: Item, lines: RecipeLine[]): number {
  const pieces = lines.flatMap(line => Array.from({ length: line.needed }, () => itemCost(line.item)));
  const coste = itemCost(item);
  const restante = coste - pieces.reduce((sum, cost) => sum + cost, 0);
  if (restante >= 0) return restante;
  if (pieces.length === 1) return coste;
  return SURPLUS_CRAFT_GOLD;
}

/** Oro que se cobra: el restante más 400 si es épico o 800 si es legendario. */
export function craftGold(item: Item, lines: RecipeLine[]): number {
  return restanteGold(item, lines) + rarityCraftGold(item.rareza);
}

/** "Botas + 700 oro" o "Espada larga ×2 + 900 oro". */
export function craftSummary(item: Item, lines: RecipeLine[]): string {
  const parts = lines.map(line => (line.needed > 1 ? `${line.name} ×${line.needed}` : line.name));
  const gold = craftGold(item, lines);
  if (gold <= 0) return parts.join(' + ');
  return `${parts.join(' + ')} + ${gold.toLocaleString('es-ES')} oro`;
}
