/**
 * Notas privadas de un player sobre un campeón o NPC (/api/player-notes).
 * Solo las ve y edita el propio player: el servidor las guarda por la cabecera X-App-Player
 * y nunca salen en las fichas públicas. El admin no tiene notas.
 */
export type PlayerNoteKind = 'champion' | 'npc';

export type PlayerNote = { text: string; updatedAt: string | null };

export const PLAYER_NOTE_MAX = 4000;

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

const path = (kind: PlayerNoteKind, id: string) =>
  `/api/player-notes?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;

// encodeURIComponent: las cabeceras no admiten cualquier carácter (tildes, emojis…).
const playerHeaders = (player: string): Record<string, string> => ({ 'X-App-Player': encodeURIComponent(player) });

function normalize(body: unknown): PlayerNote {
  const source = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  return {
    text: typeof source.text === 'string' ? source.text : '',
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
  };
}

async function call(url: string, init: RequestInit, fallback: string): Promise<PlayerNote> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} ${fallback}`));
  return normalize(body);
}

export function loadPlayerNote(player: string, kind: PlayerNoteKind, id: string): Promise<PlayerNote> {
  return call(path(kind, id), { headers: playerHeaders(player), cache: 'no-store' }, 'al cargar la nota');
}

/** Texto vacío = se borra la nota. */
export function savePlayerNote(player: string, kind: PlayerNoteKind, id: string, text: string): Promise<PlayerNote> {
  return call(path(kind, id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...playerHeaders(player) },
    body: JSON.stringify({ text }),
  }, 'al guardar la nota');
}
