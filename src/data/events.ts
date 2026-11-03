import { readAppRole } from './appRole';

/**
 * Eventos de la campaña (Mongo: events). Atemporales: sin fecha ni estado.
 * Visible para players = ya ha pasado; oculto = planeado (solo el admin lo ve).
 * El orden de la línea temporal es explícito (order).
 * Leer: todos (players solo los visibles). Crear/editar/reordenar/borrar: solo admin.
 */
export type CampaignEvent = {
  id: string;
  title: string;
  /** Formato ligero de Mecánicas: párrafos, «- » listas, «1. » numeradas y **negrita**. */
  body: string;
  /** Etiqueta libre: «Sesión 3», «Día 12 del viaje»… */
  session?: string;
  /** true = ya ha pasado (lo ven los players); false = planeado. */
  visibleToPlayers: boolean;
  order: number;
  createdAt: string;
  updatedAt?: string;
};

export type EventDraft = {
  title: string;
  body: string;
  session: string;
  visibleToPlayers: boolean;
};

export const EVENT_TITLE_MAX = 140;
export const EVENT_BODY_MAX = 8000;
export const EVENT_SESSION_MAX = 60;

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';
const ADMIN_JSON = { 'Content-Type': 'application/json', 'X-App-Role': 'admin' };
const roleHeaders = (): Record<string, string> => (readAppRole() === 'admin' ? { 'X-App-Role': 'admin' } : {});

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
  if (readAppRole() !== 'admin') throw new Error('Solo el admin puede editar los Eventos');
}

function normalize(raw: unknown): CampaignEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.id !== 'string') return null;
  const event: CampaignEvent = {
    id: source.id,
    title: typeof source.title === 'string' ? source.title : '',
    body: typeof source.body === 'string' ? source.body : '',
    visibleToPlayers: source.visibleToPlayers === true,
    order: typeof source.order === 'number' ? source.order : 0,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : '',
  };
  if (typeof source.session === 'string' && source.session) event.session = source.session;
  if (typeof source.updatedAt === 'string') event.updatedAt = source.updatedAt;
  return event;
}

function asEvent(body: unknown): CampaignEvent {
  const event = normalize(body);
  if (!event) throw new Error('La API no devolvió el evento');
  return event;
}

function asList(body: unknown): CampaignEvent[] {
  if (!Array.isArray(body)) throw new Error('La API no devolvió los eventos');
  return body.map(normalize).filter((event): event is CampaignEvent => event !== null);
}

export const sortEvents = (list: CampaignEvent[]) =>
  [...list].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

export async function loadEvents(): Promise<CampaignEvent[]> {
  return sortEvents(asList(await call('/api/events', { headers: roleHeaders() }, 'al cargar los eventos')));
}

/** Con afterId se coloca justo debajo de ese evento; si no, al final. */
export async function createEvent(draft: EventDraft, afterId?: string): Promise<CampaignEvent> {
  assertAdmin();
  const payload: Record<string, unknown> = {
    title: draft.title.trim(),
    body: draft.body.trim(),
    visibleToPlayers: draft.visibleToPlayers,
  };
  if (draft.session.trim()) payload.session = draft.session.trim();
  if (afterId) payload.afterId = afterId;
  return asEvent(await call('/api/events', { method: 'POST', headers: ADMIN_JSON, body: JSON.stringify(payload) }, 'al guardar el evento'));
}

export type EventPatch = Partial<{
  title: string;
  body: string;
  session: string | null;
  visibleToPlayers: boolean;
}>;

export async function updateEvent(id: string, patch: EventPatch): Promise<CampaignEvent> {
  assertAdmin();
  return asEvent(await call(`/api/events?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: ADMIN_JSON,
    body: JSON.stringify(patch),
  }, 'al guardar el evento'));
}

/** Guarda el orden completo de la línea temporal. Devuelve la lista ya ordenada. */
export async function reorderEvents(ids: string[]): Promise<CampaignEvent[]> {
  assertAdmin();
  return sortEvents(asList(await call('/api/events', { method: 'PUT', headers: ADMIN_JSON, body: JSON.stringify({ ids }) }, 'al reordenar')));
}

export async function deleteEvent(id: string): Promise<void> {
  assertAdmin();
  await call(`/api/events?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-App-Role': 'admin' } }, 'al borrar el evento');
}
