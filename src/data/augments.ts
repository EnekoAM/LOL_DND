import { readAppRole } from './appRole';

/** Aumento del catálogo (colección augments en Mongo). Admin: alta/edición/borrado. Sin precio propio: salen en la ruleta según su rareza. */
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
  /**
   * Solo aumentos con niveles: efecto de nivel 1, 2 y 3 del propio aumento
   * (se sube aparte del nivel del player/campeón).
   */
  levels?: string[];
  /** ISO. */
  createdAt: string;
};

export type AugmentDraft = {
  rarity: AugmentRarity;
  name: string;
  description: string;
  /** 3 efectos (nivel 1, 2 y 3) o null si el aumento no tiene niveles. */
  levels: string[] | null;
};

export const AUGMENT_NAME_MAX = 80;
export const AUGMENT_DESCRIPTION_MAX = 1000;
/** Niveles de un aumento con niveles (1, 2 y 3). No tiene nada que ver con el nivel del player. */
export const AUGMENT_LEVEL_COUNT = 3;
export const AUGMENT_LEVEL_EFFECT_MAX = 500;

/** Normaliza levels: exactamente 3 textos o undefined (sin niveles). */
export function augmentLevels(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.length === AUGMENT_LEVEL_COUNT && value.every(t => typeof t === 'string')
    ? (value as string[])
    : undefined;
}

/** Nivel actual válido (1-3) de un aumento con niveles. */
export const clampAugmentLevel = (level: unknown): number =>
  typeof level === 'number' && Number.isInteger(level) ? Math.min(AUGMENT_LEVEL_COUNT, Math.max(1, level)) : 1;

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
  const augment: Augment = {
    id: String(raw.id),
    rarity: raw.rarity === 'oro' || raw.rarity === 'prismatico' ? raw.rarity : 'plata',
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  };
  const levels = augmentLevels(raw.levels);
  if (levels) augment.levels = levels;
  return augment;
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

/** Elige una rareza según las probabilidades (%) de la ruleta. */
export function rollRarity(probs: Record<AugmentRarity, number>, random: () => number = Math.random): AugmentRarity {
  const total = AUGMENT_RARITIES.reduce((sum, r) => sum + Math.max(0, probs[r.value] ?? 0), 0);
  if (total <= 0) return 'plata';
  let ticket = random() * total;
  for (const { value } of AUGMENT_RARITIES) {
    ticket -= Math.max(0, probs[value] ?? 0);
    if (ticket < 0) return value;
  }
  return AUGMENT_RARITIES[AUGMENT_RARITIES.length - 1].value;
}

/** Hasta `count` aumentos distintos al azar de esa rareza. */
export function pickAugments(list: Augment[], rarity: AugmentRarity, count = 3, random: () => number = Math.random): Augment[] {
  const pool = list.filter(a => a.rarity === rarity);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
