import { readAppRole } from './appRole';

/** Entrada de Mecánicas (Mongo: faq). Leer: todos. Crear/editar/reordenar/borrar: solo admin. */
export type FaqEntry = {
  id: string;
  title: string;
  /** Texto con formato ligero: párrafos, «- » listas, «1. » numeradas y **negrita**. */
  body: string;
  category?: string;
  order: number;
  createdAt: string;
  updatedAt?: string;
};

export type FaqDraft = { title: string; body: string; category: string };

export const FAQ_TITLE_MAX = 120;
export const FAQ_BODY_MAX = 4000;
export const FAQ_CATEGORY_MAX = 40;

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';
const ADMIN_JSON = { 'Content-Type': 'application/json', 'X-App-Role': 'admin' };

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

function assertAdmin(): void {
  if (readAppRole() !== 'admin') throw new Error('Solo el admin puede editar las Mecánicas');
}

function normalize(raw: unknown): FaqEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.id !== 'string') return null;
  const entry: FaqEntry = {
    id: source.id,
    title: typeof source.title === 'string' ? source.title : '',
    body: typeof source.body === 'string' ? source.body : '',
    order: typeof source.order === 'number' ? source.order : 0,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : '',
  };
  if (typeof source.category === 'string' && source.category) entry.category = source.category;
  if (typeof source.updatedAt === 'string') entry.updatedAt = source.updatedAt;
  return entry;
}

function asEntry(body: unknown): FaqEntry {
  const entry = normalize(body);
  if (!entry) throw new Error('La API no devolvió la entrada');
  return entry;
}

export async function loadFaq(): Promise<FaqEntry[]> {
  const body = await call('/api/faq', undefined, 'al cargar las Mecánicas');
  if (!Array.isArray(body)) throw new Error('La API no devolvió las Mecánicas');
  return body.map(normalize).filter((entry): entry is FaqEntry => entry !== null);
}

export async function createFaq(draft: FaqDraft): Promise<FaqEntry> {
  assertAdmin();
  const payload: Record<string, unknown> = { title: draft.title.trim(), body: draft.body.trim() };
  if (draft.category.trim()) payload.category = draft.category.trim();
  const body = await call('/api/faq', { method: 'POST', headers: ADMIN_JSON, body: JSON.stringify(payload) }, 'al guardar la entrada');
  return asEntry(body);
}

export async function updateFaq(id: string, patch: { title?: string; body?: string; category?: string | null; order?: number }): Promise<FaqEntry> {
  assertAdmin();
  const body = await call(`/api/faq?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: ADMIN_JSON,
    body: JSON.stringify(patch),
  }, 'al guardar la entrada');
  return asEntry(body);
}

export async function deleteFaq(id: string): Promise<void> {
  assertAdmin();
  await call(`/api/faq?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-App-Role': 'admin' } }, 'al borrar la entrada');
}
