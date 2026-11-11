import { findItem } from '../../data/items';
import { baseNamedEffectId, findNamedEffect, namedEffectName } from '../../data/namedEffects';

/** Ítems de la lista (en orden, con repeticiones) que tienen este efecto exclusivo (cualquier variante). */
function holders(items: string[], effectId: string): string[] {
  return items.filter(name => (findItem(name)?.namedEffects ?? []).some(id => baseNamedEffectId(id) === effectId));
}

/** Efectos exclusivos presentes en la lista. */
function exclusiveEffects(items: string[]): Set<string> {
  const ids = new Set<string>();
  for (const name of items) {
    for (const id of findItem(name)?.namedEffects ?? []) if (findNamedEffect(id)?.exclusive) ids.add(baseNamedEffectId(id));
  }
  return ids;
}

/**
 * Choque nuevo de efectos exclusivos al pasar de `prev` a `next` (añadir o cambiar un ítem).
 * Devuelve el mensaje («Salvavidas ya lo tiene Sterak…») o null. Choques que ya estaban no bloquean
 * (así se puede quitar o reordenar una build antigua).
 */
export function newNamedEffectClash(prev: string[], next: string[]): string | null {
  for (const id of exclusiveEffects(next)) {
    const after = holders(next, id);
    if (after.length < 2 || after.length <= holders(prev, id).length) continue;
    const before = holders(prev, id);
    const existing = before[0] ?? after[0];
    const added = after.find(name => name !== existing) ?? after[1];
    return `${namedEffectName(id)} ya lo tiene ${existing}: no se puede combinar con ${added}`;
  }
  return null;
}
