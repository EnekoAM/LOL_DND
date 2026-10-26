import { normalizeName } from '../lib/text';
import type { LootRarity } from './loot';
import { setPartyGold } from './party';

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
  /** Precio de tienda. En un crafteo, el oro es este precio menos el de los componentes. */
  coste?: number;
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

/** Deja en memoria las cantidades que acaba de guardar la API. */
export function applyItemQuantities(items: { nombre: string; cantidad: number }[]): void {
  for (const item of items) {
    const current = findItem(item.nombre);
    if (current && typeof item.cantidad === 'number') current.cantidad = item.cantidad;
  }
}

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

/** Lo que se puede cambiar de la definición de un ítem. El nombre es su identidad y no se toca. */
export type ItemUpdate = {
  rareza: string;
  efecto: { pasiva: string; activa: string };
  stats: ItemStats;
  /** null quita el precio de tienda. */
  coste: number | null;
};

/**
 * Guarda la definición del ítem (rareza, efectos, stats y coste) y deja la copia en memoria alineada.
 * No toca la cantidad: eso sigue siendo cosa de grantItem, craftItem y la tienda.
 */
export async function saveItemUpdate(nombre: string, update: ItemUpdate): Promise<Item> {
  let response: Response;
  try {
    response = await fetch(`/api/items?nombre=${encodeURIComponent(nombre)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar el ítem`));
  if (!body || typeof body !== 'object' || typeof (body as Item).nombre !== 'string') {
    throw new Error('La API no devolvió el ítem guardado');
  }

  const saved = body as Partial<Item> & { nombre: string };
  const current = findItem(saved.nombre) ?? findItem(nombre);
  if (!current) {
    const fresh = saved as Item;
    hydrateItems([...ITEMS, fresh]);
    return fresh;
  }

  // Se actualiza el mismo objeto para que el resto de pantallas (builds, tienda…) vean el cambio.
  current.rareza = typeof saved.rareza === 'string' ? saved.rareza : update.rareza;
  current.efecto = saved.efecto ?? { ...update.efecto };
  current.stats = saved.stats ?? { ...update.stats };
  if (typeof saved.coste === 'number') current.coste = saved.coste;
  else delete current.coste;
  if (typeof saved.cantidad === 'number') current.cantidad = saved.cantidad;
  hydrateItems([...ITEMS]);
  return current;
}

/** Gasta la receta en la base y deja el stock en memoria alineado. */
export async function craftItem(nombre: string): Promise<Item> {
  let response: Response;
  try {
    response = await fetch(`/api/craft?nombre=${encodeURIComponent(nombre)}`, { method: 'POST' });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al craftear`));
  const saved = body as { items?: unknown; gold?: unknown };
  if (!saved || !Array.isArray(saved.items)) throw new Error('La API no devolvió el stock actualizado');
  if (typeof saved.gold === 'number') setPartyGold(saved.gold);

  let crafted: Item | undefined;
  for (const entry of saved.items) {
    if (!entry || typeof entry !== 'object' || typeof (entry as Item).nombre !== 'string') continue;
    const saved = entry as Item;
    const current = findItem(saved.nombre);
    if (current && typeof saved.cantidad === 'number') current.cantidad = saved.cantidad;
    if (normalizeName(saved.nombre) === normalizeName(nombre)) crafted = current ?? saved;
  }
  if (!crafted) throw new Error('La API no devolvió el ítem crafteado');
  return crafted;
}

export const findItems = (names: string[]): Item[] =>
  names.map(name => findItem(name)).filter((item): item is Item => item !== undefined);
