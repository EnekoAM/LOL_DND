export type EquipmentSwapTarget = { playerName: string; index: number; items: readonly string[] };

/** A picker must never change a different slot after a live update or player switch. */
export function isCurrentEquipmentTarget(target: EquipmentSwapTarget, playerName: string, items: readonly string[]): boolean {
  return target.playerName === playerName && Number.isInteger(target.index)
    && target.index >= 0 && target.index < items.length
    && target.items.length === items.length && target.items.every((item, index) => item === items[index]);
}

export function canReplaceEquipment(items: readonly string[], index: number, limit: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < items.length && index < limit;
}

/** Replace in place: no append/reorder, and the locked seventh slot cannot be reused. */
export function replaceEquipment(items: string[], index: number, replacement: string, limit: number): string[] {
  if (!canReplaceEquipment(items, index, limit) || !replacement.trim() || items[index] === replacement) return items;
  return items.map((item, slot) => slot === index ? replacement : item);
}