import { useSyncExternalStore } from 'react';
import { hydrateChampions, type Champion } from './champions';
import { hydrateItems, type Item } from './items';
import { hydrateLoot, type LootTables } from './loot';
import { hydrateParty, type Party } from './party';
import { hydratePlayers, type Player } from './players';
import { hydrateRoles, type RoleTable } from './roles';

/**
 * Sincronización en vivo entre pestañas (ver server/live.ts).
 * El servidor solo avisa de qué recurso cambió; aquí se vuelve a pedir por REST,
 * se rehidrata el dato en memoria y se sube una revisión para que React repinte.
 * Lo local de cada pestaña (filtros, búsqueda, pestaña abierta…) no se toca.
 */
export type LiveResource = 'party' | 'players' | 'items' | 'loot' | 'roles' | 'champions' | 'history';

const ALL_RESOURCES: LiveResource[] = ['party', 'players', 'items', 'loot', 'roles', 'champions', 'history'];

/** Id de esta pestaña. Viaja en X-Client-Id para no recargar lo que acabamos de guardar nosotros. */
export const CLIENT_ID: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const revisions: Record<LiveResource, number> = {
  party: 0, players: 0, items: 0, loot: 0, roles: 0, champions: 0, history: 0,
};
let totalRevision = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function bump(resources: LiveResource[]): void {
  for (const resource of resources) revisions[resource] += 1;
  totalRevision += 1;
  for (const listener of listeners) listener();
}

/**
 * Número que cambia cada vez que llega de otra pestaña un cambio de esos recursos
 * (o de cualquiera, sin argumentos). Úsalo como dependencia de useMemo/useEffect.
 */
export function useLiveRevision(...resources: LiveResource[]): number {
  const key = resources.join(',');
  return useSyncExternalStore(subscribe, () =>
    key ? key.split(',').reduce((sum, resource) => sum + revisions[resource as LiveResource], 0) : totalRevision,
  );
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Error ${response.status} en ${path}`);
  return (await response.json()) as T;
}

async function reload(resource: LiveResource): Promise<void> {
  switch (resource) {
    case 'party': hydrateParty(await getJson<Party>('/api/party')); return;
    case 'players': hydratePlayers(await getJson<Player[]>('/api/players')); return;
    case 'items': hydrateItems(await getJson<Item[]>('/api/items')); return;
    case 'loot': hydrateLoot(await getJson<LootTables>('/api/loot')); return;
    case 'roles': hydrateRoles(await getJson<RoleTable[]>('/api/roles')); return;
    case 'champions': hydrateChampions(await getJson<Champion[]>('/api/champions')); return;
    case 'history': return; // Historial lo vuelve a pedir él mismo al ver la revisión.
  }
}

/** Si llegan varios avisos seguidos (p. ej. al cambiar el nivel) se agrupan en una sola recarga. */
const pending = new Set<LiveResource>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function schedule(resources: LiveResource[]): void {
  for (const resource of resources) pending.add(resource);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    const batch = [...pending];
    pending.clear();
    void Promise.all(batch.map(resource => reload(resource).then(() => resource, () => null))).then(done => {
      const ok = done.filter((resource): resource is LiveResource => resource !== null);
      if (ok.length > 0) bump(ok);
    });
  }, 80);
}

function isResource(value: unknown): value is LiveResource {
  return typeof value === 'string' && (ALL_RESOURCES as string[]).includes(value);
}

function handleMessage(raw: unknown): void {
  if (typeof raw !== 'string') return;
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }
  if (!event || typeof event !== 'object') return;
  const { type, resources, clientId } = event as Record<string, unknown>;
  if (type !== 'changed' || !Array.isArray(resources)) return;
  if (clientId === CLIENT_ID) return;
  const list = resources.filter(isResource);
  if (list.length > 0) schedule(list);
}

/** Marca las peticiones a /api de esta pestaña con su id. */
function tagApiRequests(): void {
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith(window.location.origin) ? url.slice(window.location.origin.length) : url;
    if (!path.startsWith('/api/')) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('X-Client-Id', CLIENT_ID);
    return original(input, { ...init, headers });
  };
}

let started = false;

/** Intentos antes de rendirse si el WebSocket nunca llegó a conectar. */
const MAX_INITIAL_ATTEMPTS = 3;

/** Hosts sin servidor de WebSocket (Vercel serverless): ni se intenta. */
function hasNoLiveServer(): boolean {
  return window.location.hostname.endsWith('.vercel.app');
}

/** Abre el WebSocket (mismo host que la web; Vite lo pasa a :3001) y reconecta solo. */
export function startLiveSync(): void {
  if (started || typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
  started = true;
  tagApiRequests();
  if (hasNoLiveServer()) return;

  let retry = 0;
  let everConnected = false;

  const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socket.onopen = () => {
      retry = 0;
      // Tras una caída nos pudimos perder avisos: se recarga todo una vez.
      if (everConnected) schedule(ALL_RESOURCES);
      everConnected = true;
    };
    socket.onmessage = message => handleMessage(message.data);
    socket.onclose = () => {
      // Sin servidor de WS (p. ej. en Vercel serverless) no se insiste: tras unos
      // intentos sin haber conectado nunca, se deja (la app sigue por REST).
      if (!everConnected && retry >= MAX_INITIAL_ATTEMPTS - 1) return;
      // 1s, 2s, 4s… hasta 30s.
      const delay = Math.min(30_000, 1000 * 2 ** retry);
      retry += 1;
      setTimeout(connect, delay);
    };
  };

  connect();
}
