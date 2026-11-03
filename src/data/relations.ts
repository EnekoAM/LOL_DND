import { readAppRole } from './appRole';
import type { NpcImageFrame } from './npcs';

/**
 * Relaciones entre campeones y NPCs (colección relations en Mongo).
 * Simétricas: una relación entre A y B sale en la ficha de A y en la de B.
 * Admin: crea, cambia la nota y borra. Players: solo las ven, y solo entre fichas visibles.
 */
export type RelationKind = 'champion' | 'npc';

/** Campeón = su nombre; NPC = su id. */
export type RelationRef = { kind: RelationKind; id: string };

export type RelationEntity = RelationRef & {
  name: string;
  image: string;
  /** Encuadre de la tarjeta (solo NPCs). */
  imageFrame: NpcImageFrame | null;
  /** Activo (campeón) / visible (NPC) para los players. */
  visible: boolean;
};

export type Relation = {
  id: string;
  note: string;
  /** La otra punta respecto a la ficha abierta. */
  other: RelationEntity;
  createdAt: string;
};

export const RELATION_NOTE_MAX = 200;

export const RELATION_KIND_LABEL: Record<RelationKind, string> = { champion: 'Campeón', npc: 'NPC' };

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';
const ADMIN_ONLY = 'Solo el admin puede gestionar las relaciones';

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

function normalizeFrame(value: unknown): NpcImageFrame | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { x, y, zoom } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof zoom !== 'number') return null;
  return { x, y, zoom };
}

function normalize(raw: unknown): Relation | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const other = source.other as Record<string, unknown> | undefined;
  if (!other || (other.kind !== 'champion' && other.kind !== 'npc') || typeof other.id !== 'string') return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    id: String(source.id),
    note: text(source.note),
    other: {
      kind: other.kind,
      id: other.id,
      name: text(other.name) || other.id,
      image: text(other.image),
      imageFrame: normalizeFrame(other.imageFrame),
      visible: other.visible === true,
    },
    createdAt: text(source.createdAt),
  };
}

const roleHeaders = (): Record<string, string> => (readAppRole() === 'admin' ? { 'X-App-Role': 'admin' } : {});
const ADMIN_JSON = { 'Content-Type': 'application/json', 'X-App-Role': 'admin' };

function assertAdmin(): void {
  if (readAppRole() !== 'admin') throw new Error(ADMIN_ONLY);
}

export const sameRelationRef = (a: RelationRef, b: RelationRef): boolean =>
  a.kind === b.kind && (a.kind === 'champion' ? a.id.toLowerCase() === b.id.toLowerCase() : a.id === b.id);

/** Relaciones de una ficha (admin: todas; players: solo con fichas visibles). */
export async function loadRelations(ref: RelationRef): Promise<Relation[]> {
  const query = `kind=${encodeURIComponent(ref.kind)}&id=${encodeURIComponent(ref.id)}`;
  const body = await call(`/api/relations?${query}`, { headers: roleHeaders() }, 'al cargar las relaciones');
  if (!Array.isArray(body)) throw new Error('La API no devolvió las relaciones');
  return body.map(normalize).filter((r): r is Relation => r !== null);
}

/** Crea la relación entre la ficha abierta (from) y otra (to). Devuelve la vista desde from. */
export async function createRelation(from: RelationRef, to: RelationRef, note: string): Promise<Relation> {
  assertAdmin();
  const body = await call('/api/relations', {
    method: 'POST',
    headers: ADMIN_JSON,
    body: JSON.stringify({ a: from, b: to, note }),
  }, 'al crear la relación');
  const saved = normalize(body);
  if (!saved) throw new Error('La API no devolvió la relación');
  return saved;
}

export async function updateRelationNote(id: string, note: string): Promise<void> {
  assertAdmin();
  await call(`/api/relations?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: ADMIN_JSON,
    body: JSON.stringify({ note }),
  }, 'al guardar la relación');
}

export async function deleteRelation(id: string): Promise<void> {
  assertAdmin();
  await call(`/api/relations?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-App-Role': 'admin' },
  }, 'al borrar la relación');
}

// ── Abrir la ficha relacionada (también desde otra pantalla) ──

export const OPEN_RELATED_EVENT = 'relations:open';
let pendingOpen: RelationRef | null = null;

/** Deja pendiente abrir esa ficha; si su pantalla ya está montada, la abre al momento por el evento. */
export function openRelatedSheet(ref: RelationRef): void {
  pendingOpen = ref;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<RelationRef>(OPEN_RELATED_EVENT, { detail: ref }));
}

/** La pantalla de ese tipo recoge (y consume) la ficha pendiente de abrir. */
export function takePendingOpen(kind: RelationKind): string | null {
  if (!pendingOpen || pendingOpen.kind !== kind) return null;
  const { id } = pendingOpen;
  pendingOpen = null;
  return id;
}

export const RELATION_SCREEN_PATH: Record<RelationKind, string> = { champion: '/champions', npc: '/npcs' };
