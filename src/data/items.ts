import { ITEM_ONLY_STAT_KEYS } from '../features/calculos/statLine';
import { normalizeName } from '../lib/text';
import type { LootRarity } from './loot';
import { setPartyGold } from './party';

/** AD y AP pueden venir como dados ("1d4"); el resto de stats son numéricas. */
export type StatValue = number | string;

export type ItemStats = Record<string, StatValue>;

/** Cuándo salta la pasiva de un ítem en combate: al golpear con AA, al usar habilidad o al usar el ítem. */
export type PassiveTrigger = 'on-hit' | 'on-ability' | 'on-use';
export const PASSIVE_TRIGGERS: { id: PassiveTrigger; label: string }[] = [
  { id: 'on-hit', label: 'Al golpear (AA)' },
  { id: 'on-ability', label: 'Al usar habilidad' },
  { id: 'on-use', label: 'Al usar el objeto' },
];

/** Bonus temporal de la pasiva (clave de stat de Cálculos, p. ej. lethality). */
export type ItemPassiveBonus = {
  trigger: PassiveTrigger;
  stat: string;
  amount: number;
  maxStacks?: number;
  durationTurns?: number;
};

/** Daño de la pasiva: % de la vida actual del objetivo. */
export type ItemPassiveDamage = { trigger: PassiveTrigger; currentHpPct: number };

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
  /** Si true, la ficha muestra un contador de stacks. */
  hasStacks?: boolean;
  /** Tope opcional del contador. */
  maxStacks?: number;
  /** Cooldown en turnos (si está definido, la ficha muestra Usar/CD). */
  cooldown?: number;
  /** Duración del efecto en turnos (p. ej. pociones). */
  effectDuration?: number;
  /** Destino del efecto al activar. Ausente = self. */
  effectTarget?: 'self' | 'enemy';
  /** Nombre del estado en combate si el objetivo es enemigo. Ausente = el del ítem. */
  effectName?: string;
  /** Pasiva en combate: bonus de stats que se añade / acumula al saltar. */
  passiveBonus?: ItemPassiveBonus;
  /** Pasiva en combate: daño extra (% vida actual del objetivo). */
  passiveDamage?: ItemPassiveDamage;
  /** Efectos con nombre (ids de data/namedEffects.ts: Vigor, Salvavidas…). */
  namedEffects?: string[];
};

export let ITEMS: Item[] = [];

export let STAT_KEYS: string[] = [];

let itemsByName = new Map<string, Item>();

export function hydrateItems(items: Item[]): void {
  ITEMS = items;
  STAT_KEYS = Object.keys(items[0]?.stats ?? {});
  // Stats nuevas que solo dan los ítems: disponibles en editor y filtros aunque ningún ítem las tenga.
  for (const key of ITEM_ONLY_STAT_KEYS) if (!STAT_KEYS.includes(key)) STAT_KEYS.push(key);
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
  hasStacks?: boolean;
  maxStacks?: number | null;
  cooldown?: number | null;
  effectDuration?: number | null;
  effectTarget?: 'self' | 'enemy' | null;
  effectName?: string | null;
  passiveBonus?: ItemPassiveBonus | null;
  passiveDamage?: ItemPassiveDamage | null;
  namedEffects?: string[] | null;
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
  if (saved.hasStacks === true) current.hasStacks = true;
  else delete current.hasStacks;
  if (typeof saved.maxStacks === 'number') current.maxStacks = saved.maxStacks;
  else delete current.maxStacks;
  if (typeof saved.cooldown === 'number') current.cooldown = saved.cooldown;
  else delete current.cooldown;
  if (typeof saved.effectDuration === 'number') current.effectDuration = saved.effectDuration;
  else delete current.effectDuration;
  if (saved.effectTarget === 'enemy') current.effectTarget = 'enemy';
  else delete current.effectTarget;
  if (typeof saved.effectName === 'string' && saved.effectName.trim()) current.effectName = saved.effectName.trim();
  else delete current.effectName;
  if (saved.passiveBonus && typeof saved.passiveBonus === 'object') current.passiveBonus = saved.passiveBonus;
  else delete current.passiveBonus;
  if (saved.passiveDamage && typeof saved.passiveDamage === 'object') current.passiveDamage = saved.passiveDamage;
  else delete current.passiveDamage;
  if (Array.isArray(saved.namedEffects) && saved.namedEffects.length) current.namedEffects = [...saved.namedEffects];
  else delete current.namedEffects;
  if (typeof saved.cantidad === 'number') current.cantidad = saved.cantidad;
  hydrateItems([...ITEMS]);
  return current;
}

/** Gasta la receta en la base y deja el stock en memoria alineado.
 * Con `recursive: true` el servidor prepara intermedios y cobra el oro del plan de una vez
 * (misma fórmula que planCraft). Con `buyMissing` compra piezas básicas faltantes.
 * Con `preview` solo calcula (no muta). */
export async function craftItem(
  nombre: string,
  opts?: { recursive?: boolean; buyMissing?: boolean; preview?: boolean },
): Promise<Item> {
  let response: Response;
  try {
    const params = new URLSearchParams({ nombre });
    if (opts?.recursive) params.set('recursive', '1');
    if (opts?.buyMissing) params.set('buyMissing', '1');
    if (opts?.preview) params.set('preview', '1');
    response = await fetch(`/api/craft?${params}`, { method: 'POST' });
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

/** Vista previa del crafteo recursivo (opcionalmente comprando lo que falta). No muta. */
export async function previewCraft(
  nombre: string,
  opts?: { buyMissing?: boolean },
): Promise<{
  preview: true;
  oro: number;
  buyGold: number;
  craftGold: number;
  directBuyGold: number;
  cheaperDirect: boolean;
  purchases: { nombre: string; cantidad: number; oro: number; unitCost?: number }[];
  steps: { item: string; role: string; oro: number; diferencia?: number; tasa?: number }[];
  gold: number;
}> {
  let response: Response;
  try {
    const params = new URLSearchParams({ nombre, recursive: '1', preview: '1' });
    if (opts?.buyMissing) params.set('buyMissing', '1');
    response = await fetch(`/api/craft?${params}`, { method: 'POST' });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al previsualizar el crafteo`));
  return body as {
    preview: true;
    oro: number;
    buyGold: number;
    craftGold: number;
    directBuyGold: number;
    cheaperDirect: boolean;
    purchases: { nombre: string; cantidad: number; oro: number; unitCost?: number }[];
    steps: { item: string; role: string; oro: number; diferencia?: number; tasa?: number }[];
    gold: number;
  };
}

export const findItems = (names: string[]): Item[] =>
  names.map(name => findItem(name)).filter((item): item is Item => item !== undefined);
