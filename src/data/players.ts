import { normalizeName } from '../lib/text';

export const EQUIPMENT_SLOTS = 7;

export type PlayerAbilitySlot = 'P' | 'H1' | 'H2' | 'H3' | 'R';

export type Player = {
  name: string;
  basicAttack?: { type: string; scaling: number[] };
  /** Nombres de habilidades definidas en habilidades.json. */
  abilities: Record<PlayerAbilitySlot, string | null>;
  equipamiento: string[];
  build: string[];
};

export let PLAYERS: Player[] = [];

export function hydratePlayers(players: Player[]): void {
  PLAYERS = players;
}

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

export type PlayerListPatch = Partial<Pick<Player, 'build' | 'equipamiento'>>;

/** Sustituye la build o el equipamiento y deja la copia en memoria alineada con lo guardado. */
export async function savePlayerPatch(name: string, patch: PlayerListPatch): Promise<Player> {
  let response: Response;
  try {
    response = await fetch(`/api/players/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar`));

  const saved = body as Player;
  const key = normalizeName(name);
  const index = PLAYERS.findIndex(player => normalizeName(player.name) === key);
  if (index >= 0) PLAYERS[index] = saved;
  return saved;
}
