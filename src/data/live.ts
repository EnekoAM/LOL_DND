import { useSyncExternalStore } from 'react';
import { hydrateChampions, type Champion } from './champions';
import { hydrateItems, type Item } from './items';
import { hydrateLoot, type LootTables } from './loot';
import { hydrateParty, type Party } from './party';
import { hydratePlayers, type Player } from './players';
import { hydrateRoles, type RoleTable } from './roles';

/**
 * Sincronización en vivo entre pestañas (ver server/livePublish.ts).
 * El servidor solo avisa de qué recurso cambió; aquí se vuelve a pedir por REST,
 * se rehidrata el dato en memoria y se sube una revisión para que React repinte.
 * Lo local de cada pestaña (filtros, búsqueda, pestaña abierta…) no se toca.
 *
 * Transporte: si /api/live-token dice que hay Ably (ABLY_API_KEY en el servidor),
 * se usa Ably (también en Vercel). Si no, el WebSocket local de `npm run dev:api` (/ws).
 */
export type LiveResource = 'party' | 'players' | 'items' | 'loot' | 'roles' | 'champions' | 'history' | 'tickets';

const ALL_RESOURCES: LiveResource[] = ['party', 'players', 'items', 'loot', 'roles', 'champions', 'history', 'tickets'];

/** Id de esta pestaña. Viaja en X-Client-Id para no recargar lo que acabamos de guardar nosotros. */
export const CLIENT_ID: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const revisions: Record<LiveResource, number> = {
  party: 0, players: 0, items: 0, loot: 0, roles: 0, champions: 0, history: 0, tickets: 0,
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
    case 'tickets': return; // Sugerencias también.
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

/** Acepta el aviso como texto JSON (WebSocket) o ya como objeto (Ably). */
function handleMessage(raw: unknown): void {
  let event: unknown = raw;
  if (typeof raw === 'string') {
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
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

// ---------------------------------------------------------------------------
// Ably
// ---------------------------------------------------------------------------

type LiveTokenResponse =
  | { enabled: false }
  | { enabled: true; channel: string; tokenRequest: unknown };

const LIVE_TOKEN_PATH = '/api/live-token';

async function fetchLiveToken(): Promise<LiveTokenResponse | null> {
  try {
    const response = await fetch(LIVE_TOKEN_PATH, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as LiveTokenResponse;
    return data && typeof data === 'object' && 'enabled' in data ? data : null;
  } catch {
    return null;
  }
}

/** Se conecta a Ably con tokens cortos que firma el servidor. Devuelve false si no hay Ably. */
async function startAbly(): Promise<boolean> {
  const first = await fetchLiveToken();
  if (!first || !first.enabled) return false;

  let Ably: typeof import('ably');
  try {
    // Import dinámico: el SDK solo se descarga si de verdad hay Ably.
    Ably = await import('ably');
  } catch {
    return false;
  }

  let initial: unknown = first.tokenRequest;
  const realtime = new Ably.Realtime({
    authCallback: (_params, callback) => {
      // El primer token ya lo tenemos; los siguientes (renovación) se piden al servidor.
      if (initial) {
        const tokenRequest = initial;
        initial = undefined;
        callback(null, tokenRequest as Parameters<typeof callback>[1]);
        return;
      }
      void fetchLiveToken().then(next => {
        if (next && next.enabled) callback(null, next.tokenRequest as Parameters<typeof callback>[1]);
        else callback('Ably no disponible', null);
      });
    },
  });

  let everConnected = false;
  realtime.connection.on('connected', () => {
    // Tras una caída nos pudimos perder avisos: se recarga todo una vez.
    if (everConnected) schedule(ALL_RESOURCES);
    everConnected = true;
  });

  const channel = realtime.channels.get(first.channel);
  void channel.subscribe('changed', message => handleMessage(message.data));
  return true;
}

// ---------------------------------------------------------------------------
// WebSocket local (npm run dev:api)
// ---------------------------------------------------------------------------

/** Intentos antes de rendirse si el WebSocket nunca llegó a conectar. */
const MAX_INITIAL_ATTEMPTS = 3;

/** Hosts sin servidor de WebSocket (Vercel serverless): ni se intenta. */
function hasNoLiveServer(): boolean {
  return window.location.hostname.endsWith('.vercel.app');
}

/** Abre el WebSocket (mismo host que la web; Vite lo pasa a :3001) y reconecta solo. */
function startWebSocket(): void {
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
      // Sin servidor de WS: tras unos intentos sin haber conectado nunca, se deja
      // (la app sigue por REST).
      if (!everConnected && retry >= MAX_INITIAL_ATTEMPTS - 1) return;
      // 1s, 2s, 4s… hasta 30s.
      const delay = Math.min(30_000, 1000 * 2 ** retry);
      retry += 1;
      setTimeout(connect, delay);
    };
  };

  connect();
}

let started = false;

/** Arranca la sync en vivo: Ably si el servidor lo ofrece; si no, WebSocket local. */
export function startLiveSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  tagApiRequests();

  void startAbly().then(usingAbly => {
    if (usingAbly) return;
    if (hasNoLiveServer() || typeof WebSocket === 'undefined') return;
    startWebSocket();
  });
}
