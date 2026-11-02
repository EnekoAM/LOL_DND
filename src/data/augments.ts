import { readAppRole } from './appRole';

/** Aumento del catálogo (colección augments en Mongo). Admin: alta/edición/borrado. Players: comprar (próximamente). */
export type AugmentRarity = 'plata' | 'oro' | 'prismatico';

export const AUGMENT_RARITIES: { value: AugmentRarity; label: string }[] = [
  { value: 'plata', label: 'Plata' },
  { value: 'oro', label: 'Oro' },
  { value: 'prismatico', label: 'Prismático' },
];

export const rarityLabel = (r: AugmentRarity) => AUGMENT_RARITIES.find(x => x.value === r)?.label ?? 'Plata';

export type Augment = {
  id: string;
  rarity: AugmentRarity;
  name: string;
  description: string;
  /** Precio en oro. */
  price: number;
  /** ISO. */
  createdAt: string;
};

export type AugmentDraft = {
  rarity: AugmentRarity;
  name: string;
  description: string;
  price: number;
};

export const AUGMENT_NAME_MAX = 80;
export const AUGMENT_DESCRIPTION_MAX = 1000;

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';
const ADMIN_ONLY = 'Solo el admin puede gestionar los aumentos';

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

async function call(path: string, init: RequestInit | undefined, fallback: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} ${fallback}`));
  return body;
}

function normalize(raw: Augment): Augment {
  return {
    id: String(raw.id),
    rarity: raw.rarity === 'oro' || raw.rarity === 'prismatico' ? raw.rarity : 'plata',
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    price: typeof raw.price === 'number' && Number.isFinite(raw.price) ? raw.price : 0,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  };
}

function asAugment(body: unknown): Augment {
  if (!body || typeof body !== 'object') throw new Error('La API no devolvió el aumento');
  return normalize(body as Augment);
}

export async function loadAugments(): Promise<Augment[]> {
  const body = await call('/api/augments', undefined, 'al cargar los aumentos');
  if (!Array.isArray(body)) throw new Error('La API no devolvió los aumentos');
  return (body as Augment[]).map(normalize);
}

function assertAdmin(): void {
  if (readAppRole() !== 'admin') throw new Error(ADMIN_ONLY);
}

const ADMIN_JSON = { 'Content-Type': 'application/json', 'X-App-Role': 'admin' };

export async function createAugment(draft: AugmentDraft): Promise<Augment> {
  assertAdmin();
  return asAugment(await call('/api/augments', {
    method: 'POST',
    headers: ADMIN_JSON,
    body: JSON.stringify(draft),
  }, 'al guardar el aumento'));
}

export async function updateAugment(id: string, draft: AugmentDraft): Promise<Augment> {
  assertAdmin();
  return asAugment(await call(`/api/augments?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: ADMIN_JSON,
    body: JSON.stringify(draft),
  }, 'al editar el aumento'));
}

export async function deleteAugment(id: string): Promise<void> {
  assertAdmin();
  await call(`/api/augments?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-App-Role': 'admin' },
  }, 'al borrar el aumento');
}
