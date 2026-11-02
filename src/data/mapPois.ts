/** Puntos de interés propios del mapa (Mongo: mapPois). «party» = ubicación de la party, solo una. */
export type MapPoiKind = 'party' | 'poi';

export type MapPoi = {
  id: string;
  kind: MapPoiKind;
  name: string;
  note?: string;
  /** Pixel en el mapa de 8192x8192 (origen arriba-izquierda), igual que los puntos oficiales. */
  x: number;
  y: number;
  createdAt: string;
  updatedAt?: string;
};

export type MapPoiDraft = { kind: MapPoiKind; name: string; note: string; x: number; y: number };

export const MAP_POI_NAME_MAX = 60;
export const MAP_POI_NOTE_MAX = 500;

export const MAP_POI_KIND_LABEL: Record<MapPoiKind, string> = {
  party: 'Ubicación de la party',
  poi: 'Punto de interés',
};

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

function normalize(raw: unknown): MapPoi | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.id !== 'string' || typeof source.x !== 'number' || typeof source.y !== 'number') return null;
  const poi: MapPoi = {
    id: source.id,
    kind: source.kind === 'party' ? 'party' : 'poi',
    name: typeof source.name === 'string' ? source.name : '',
    x: source.x,
    y: source.y,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : '',
  };
  if (typeof source.note === 'string' && source.note) poi.note = source.note;
  if (typeof source.updatedAt === 'string') poi.updatedAt = source.updatedAt;
  return poi;
}

function asPoi(body: unknown): MapPoi {
  const poi = normalize(body);
  if (!poi) throw new Error('La API no devolvió el punto');
  return poi;
}

export async function loadMapPois(): Promise<MapPoi[]> {
  const body = await call('/api/map-pois', undefined, 'al cargar los puntos del mapa');
  if (!Array.isArray(body)) throw new Error('La API no devolvió los puntos del mapa');
  return body.map(normalize).filter((poi): poi is MapPoi => poi !== null);
}

/** Si es la party y ya había una, la API la mueve aquí (replaced: true) en vez de crear otra. */
export async function createMapPoi(draft: MapPoiDraft): Promise<{ poi: MapPoi; replaced: boolean }> {
  const body = await call('/api/map-pois', {
    method: 'POST',
    headers: ADMIN_JSON,
    body: JSON.stringify({ kind: draft.kind, name: draft.name.trim(), note: draft.note.trim(), x: draft.x, y: draft.y }),
  }, 'al guardar el punto');
  const replaced = !!body && typeof body === 'object' && (body as { replaced?: unknown }).replaced === true;
  return { poi: asPoi(body), replaced };
}

export async function updateMapPoi(id: string, patch: { name?: string; note?: string | null; x?: number; y?: number }): Promise<MapPoi> {
  const body = await call(`/api/map-pois?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: ADMIN_JSON,
    body: JSON.stringify(patch),
  }, 'al guardar el punto');
  return asPoi(body);
}

export async function deleteMapPoi(id: string): Promise<void> {
  await call(`/api/map-pois?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-App-Role': 'admin' },
  }, 'al borrar el punto');
}
