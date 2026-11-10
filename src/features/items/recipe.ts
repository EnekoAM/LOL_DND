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

/** Tasa de crafteo: 10% del precio del ítem (redondeo al entero más cercano). Misma regla en server/store.ts. */
export const CRAFT_FEE_RATE = 0.1;

export function craftPercentFee(coste: number): number {
  if (!Number.isFinite(coste) || coste <= 0) return 0;
  return Math.round(coste * CRAFT_FEE_RATE);
}

/**
 * Diferencia del paso: precio − suma precios hijos directos.
 * Si los componentes suman más que el ítem, se clampa a 0 (solo se cobra el 10%).
 * La misma cuenta está en server/store.ts.
 */
export function restanteGold(item: Item, lines: RecipeLine[]): number {
  const pieces = lines.flatMap(line => Array.from({ length: line.needed }, () => itemCost(line.item)));
  const coste = itemCost(item);
  const restante = coste - pieces.reduce((sum, cost) => sum + cost, 0);
  return restante > 0 ? restante : 0;
}

/**
 * Oro de un crafteo suelto (un solo paso): diferencia + 10% del precio.
 * Misma fórmula que cada paso del plan recursivo.
 */
export function craftGold(item: Item, lines: RecipeLine[]): number {
  return restanteGold(item, lines) + craftPercentFee(itemCost(item));
}

export type CraftStepCost = {
  /** max(0, precio − suma hijos directos). */
  difference: number;
  /** Math.round(10% × precio). */
  fee: number;
  /** difference + fee (siempre se cobran ambos). */
  gold: number;
};

/**
 * Coste de un paso del plan (intermedio o final): diferencia + 10% del precio.
 * Ya no hay tasas por rareza ni “diferencia cubierta” en intermedios.
 * La misma regla está en server/store.ts (planStepGold).
 */
export function craftStepCost(item: Item, _lines: RecipeLine[], _role?: 'final' | 'intermediate'): CraftStepCost {
  const lines = _lines;
  const difference = restanteGold(item, lines);
  const fee = craftPercentFee(itemCost(item));
  return { difference, fee, gold: difference + fee };
}

/** "Botas + 700 oro" o "Espada larga ×2 + 900 oro". */
export function craftSummary(item: Item, lines: RecipeLine[]): string {
  const parts = lines.map(line => (line.needed > 1 ? `${line.name} ×${line.needed}` : line.name));
  const gold = craftGold(item, lines);
  if (gold <= 0) return parts.join(' + ');
  return `${parts.join(' + ')} + ${gold.toLocaleString('es-ES')} oro`;
}
