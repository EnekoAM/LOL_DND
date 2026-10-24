import { normalizeName } from '../lib/text';
import type { LootRarity } from './loot';

/** AD y AP pueden venir como dados ("1d4"); el resto de stats son numéricas. */
export type StatValue = number | string;

export type ItemStats = Record<string, StatValue>;

export type Item = {
  nombre: string;
  rareza: string;
  stats: ItemStats;
  efecto: { pasiva: string; activa: string };
  cantidad: number;
  imagen: string;
  craftsTo: string[];
  craftsFrom: string[];
};

export let ITEMS: Item[] = [];

export let STAT_KEYS: string[] = [];

let itemsByName = new Map<string, Item>();

export function hydrateItems(items: Item[]): void {
  ITEMS = items;
  STAT_KEYS = Object.keys(items[0]?.stats ?? {});
  itemsByName = new Map();
  for (const item of items) {
    const key = normalizeName(item.nombre);
    if (!itemsByName.has(key)) itemsByName.set(key, item);
  }
}

export const findItem = (name: string): Item | undefined => itemsByName.get(normalizeName(name));

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

/** Suma una copia en la base, anota la tirada y deja el stock en memoria alineado. */
export async function grantItem(
  nombre: string,
  roll: { tirada: LootRarity; rareza: LootRarity },
): Promise<Item> {
  let response: Response;
  try {
    response = await fetch(`/api/items?nombre=${encodeURIComponent(nombre)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roll),
    });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar el ítem`));

  const saved = body as Item;
  const current = findItem(saved.nombre) ?? findItem(nombre);
  if (current && typeof saved.cantidad === 'number') current.cantidad = saved.cantidad;
  return current ?? saved;
}

export const findItems = (names: string[]): Item[] =>
  names.map(name => findItem(name)).filter((item): item is Item => item !== undefined);
