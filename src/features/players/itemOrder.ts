export type ItemDragState = { group: string; index: number; items: readonly string[] };

/** Move by index, preserving duplicate items and never mutating the input. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Ignore external, cross-list/player and stale drags (e.g. a live update mid-drag). */
export function canDropItem(drag: ItemDragState | null, group: string, items: readonly string[]): drag is ItemDragState {
  return !!drag && drag.group === group && Number.isInteger(drag.index)
    && drag.index >= 0 && drag.index < items.length
    && drag.items.length === items.length && drag.items.every((item, index) => item === items[index]);
}