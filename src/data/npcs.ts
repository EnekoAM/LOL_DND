import type { CSSProperties } from 'react';
import { readAppRole } from './appRole';
import type { AbilityDamage, AbilityEffect } from './champions';

/** NPCs y monstruos (colección npcs en Mongo). Admin: alta/edición/borrado; players solo ven los visibles. */
export type NpcKind = 'npc' | 'monstruo';

export const NPC_KINDS: { value: NpcKind; label: string; icon: string }[] = [
  { value: 'npc', label: 'NPC', icon: '🧙' },
  { value: 'monstruo', label: 'Monstruo', icon: '🐉' },
];

export const npcKindLabel = (kind: NpcKind) => NPC_KINDS.find(k => k.value === kind)?.label ?? 'NPC';
export const npcKindIcon = (kind: NpcKind) => NPC_KINDS.find(k => k.value === kind)?.icon ?? '🧙';

export type NpcStatKey = 'hp' | 'mana' | 'ac' | 'mr' | 'spe' | 'ad' | 'ap';

export const NPC_STATS: { key: NpcStatKey; label: string; title: string }[] = [
  { key: 'hp', label: 'Vida', title: 'Puntos de vida' },
  { key: 'mana', label: 'Maná', title: 'Maná / recurso' },
  { key: 'ac', label: 'CA', title: 'Clase de armadura' },
  { key: 'mr', label: 'MR', title: 'Resistencia mágica' },
  { key: 'spe', label: 'Velocidad', title: 'Velocidad' },
  { key: 'ad', label: 'AD', title: 'Daño de ataque' },
  { key: 'ap', label: 'AP', title: 'Poder de habilidad' },
];

export type NpcStats = Partial<Record<NpcStatKey, number>>;

/** Habilidad libre: como las de campeón (nombre, descripción, coste, daño, efectos) pero sin slot fijo. */
export type NpcAbility = {
  id: string;
  name: string;
  /** Etiqueta corta opcional: Pasiva, Ataque, Q, Fase 2… */
  label?: string;
  description?: string;
  cost?: string;
  damage?: AbilityDamage;
  effect?: AbilityEffect[];
};

/** Encuadre de la foto: punto focal en % (0-100) y zoom (1 = sin zoom). */
export type NpcImageFrame = { x: number; y: number; zoom: number };

export const NPC_ZOOM_MIN = 1;
export const NPC_ZOOM_MAX = 4;
export const NPC_DEFAULT_FRAME: NpcImageFrame = { x: 50, y: 50, zoom: 1 };

export const isDefaultFrame = (frame: NpcImageFrame | null | undefined): boolean =>
  !frame || (frame.x === 50 && frame.y === 50 && frame.zoom === 1);

/**
 * Estilo del <img> de la foto con su encuadre. El contenedor tiene que tener overflow: hidden.
 * object-position alinea el punto focal de la imagen con el mismo punto del marco y el zoom escala
 * desde ahí, así se ve igual en la tarjeta (círculo) y en la ficha (cuadrado) a cualquier tamaño.
 */
export function npcImageStyle(frame: NpcImageFrame | null | undefined): CSSProperties | undefined {
  if (isDefaultFrame(frame) || !frame) return undefined;
  const position = `${frame.x}% ${frame.y}%`;
  return {
    objectFit: 'cover',
    objectPosition: position,
    transformOrigin: position,
    transform: frame.zoom !== 1 ? `scale(${frame.zoom})` : undefined,
  };
}

function normalizeFrame(value: unknown, keepDefault = false): NpcImageFrame | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { x, y, zoom } = value as Record<string, unknown>;
  const num = (raw: unknown, fallback: number, min: number, max: number) =>
    typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
  const frame = { x: num(x, 50, 0, 100), y: num(y, 50, 0, 100), zoom: num(zoom, 1, NPC_ZOOM_MIN, NPC_ZOOM_MAX) };
  return !keepDefault && isDefaultFrame(frame) ? null : frame;
}

/** Encuadre de la tarjeta (círculo): el propio si está desvinculado, si no el de la ficha. */
export const npcCircleFrame = (npc: Pick<Npc, 'imageFrame' | 'imageFrameCircle'>): NpcImageFrame | null =>
  npc.imageFrameCircle ?? npc.imageFrame;

export type Npc = {
  id: string;
  name: string;
  kind: NpcKind;
  /** Tipo libre: Bestia, Mercader, No muerto… */
  type: string;
  region: string;
  level: number;
  image: string;
  /** Encuadre de la foto; null = centrada. */
  imageFrame: NpcImageFrame | null;
  /** Encuadre propio de la tarjeta (círculo); null = vinculado a imageFrame. */
  imageFrameCircle: NpcImageFrame | null;
  background: string | null;
  description: string;
  stats: NpcStats;
  abilities: NpcAbility[];
  visible: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type NpcInput = Omit<Npc, 'id' | 'createdAt' | 'updatedAt'>;
export type NpcPatch = Partial<NpcInput>;

export const NPC_NAME_MAX = 80;
export const NPC_TAG_MAX = 40;
export const NPC_DESCRIPTION_MAX = 4000;
export const NPC_LEVEL_MIN = 0;
export const NPC_LEVEL_MAX = 30;
export const NPC_ABILITIES_MAX = 30;

export const emptyNpc = (kind: NpcKind = 'npc'): NpcInput => ({
  name: '',
  kind,
  type: '',
  region: '',
  level: 1,
  image: '',
  imageFrame: null,
  imageFrameCircle: null,
  background: null,
  description: '',
  stats: {},
  abilities: [],
  visible: false,
});

export const newAbilityId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';
const ADMIN_ONLY = 'Solo el admin puede gestionar los NPCs';

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

function normalize(raw: Npc): Npc {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    id: String(raw.id),
    name: text(raw.name),
    kind: raw.kind === 'monstruo' ? 'monstruo' : 'npc',
    type: text(raw.type),
    region: text(raw.region),
    level: typeof raw.level === 'number' ? raw.level : 1,
    image: text(raw.image),
    imageFrame: normalizeFrame(raw.imageFrame),
    imageFrameCircle: normalizeFrame(raw.imageFrameCircle, true),
    background: typeof raw.background === 'string' && raw.background ? raw.background : null,
    description: text(raw.description),
    stats: raw.stats && typeof raw.stats === 'object' ? raw.stats : {},
    abilities: Array.isArray(raw.abilities) ? raw.abilities.filter(a => a && typeof a.name === 'string') : [],
    visible: raw.visible === true,
    createdAt: text(raw.createdAt),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

function asNpc(body: unknown): Npc {
  if (!body || typeof body !== 'object') throw new Error('La API no devolvió el NPC');
  return normalize(body as Npc);
}

const roleHeaders = (): Record<string, string> => (readAppRole() === 'admin' ? { 'X-App-Role': 'admin' } : {});

function assertAdmin(): void {
  if (readAppRole() !== 'admin') throw new Error(ADMIN_ONLY);
}

const ADMIN_JSON = { 'Content-Type': 'application/json', 'X-App-Role': 'admin' };

/** Lista completa (admin) o solo los visibles (players). */
export async function loadNpcs(): Promise<Npc[]> {
  const body = await call('/api/npcs', { headers: roleHeaders() }, 'al cargar los NPCs');
  if (!Array.isArray(body)) throw new Error('La API no devolvió los NPCs');
  return (body as Npc[]).map(normalize);
}

export async function createNpc(input: NpcInput): Promise<Npc> {
  assertAdmin();
  return asNpc(await call('/api/npcs', {
    method: 'POST',
    headers: ADMIN_JSON,
    body: JSON.stringify(input),
  }, 'al crear el NPC'));
}

export async function updateNpc(id: string, patch: NpcPatch): Promise<Npc> {
  assertAdmin();
  return asNpc(await call(`/api/npcs?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: ADMIN_JSON,
    body: JSON.stringify(patch),
  }, 'al guardar el NPC'));
}

export async function deleteNpc(id: string): Promise<void> {
  assertAdmin();
  await call(`/api/npcs?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-App-Role': 'admin' },
  }, 'al borrar el NPC');
}

export const sortNpcs = (list: Npc[]): Npc[] =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
