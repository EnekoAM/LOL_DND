import { normalizeName } from '../lib/text';
import type { AbilityRanks, RankedSlot } from './abilityRanks';
import type { AbilityKind } from './champions';
import type { DndSkillProficiencies } from './dndSkills';

export const EQUIPMENT_SLOTS = 7;

export type PlayerAbilitySlot = 'P' | 'H1' | 'H2' | 'H3' | 'R';

/** H1, H2 y H3 son los huecos Q, W y E. Los tres admiten cualquier habilidad básica. */
export const PLAYER_ABILITY_SLOTS: {
  slot: PlayerAbilitySlot;
  key: 'P' | 'Q' | 'W' | 'E' | 'R';
  label: string;
  detail: string;
  kind: AbilityKind;
}[] = [
  { slot: 'P', key: 'P', label: 'Pasiva', detail: 'Pasiva', kind: 'pasiva' },
  { slot: 'H1', key: 'Q', label: 'Q', detail: 'Básica', kind: 'basica' },
  { slot: 'H2', key: 'W', label: 'W', detail: 'Básica', kind: 'basica' },
  { slot: 'H3', key: 'E', label: 'E', detail: 'Básica', kind: 'basica' },
  { slot: 'R', key: 'R', label: 'Definitiva', detail: 'Definitiva', kind: 'definitiva' },
];

export type AbilityScoreKey =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

/**
 * Ficha D&D guardada en players.sheet (Mongo).
 * `extra` usa las claves de columna de Cálculos (hp, mana, ad…) y solo guarda las distintas de 0.
 */
export type PlayerSheet = {
  /** Id del rol (colección roles). */
  roleId: string;
  /** Puntuaciones FUE…CAR; el modificador se calcula. */
  scores?: Record<AbilityScoreKey, number>;
  extra?: Partial<Record<string, number | string>>;
  /** Competencias en habilidades D&D (Acrobacias…): solo las marcadas, `{}` si ninguna. */
  skills?: DndSkillProficiencies;
};

export type BasicAttackEntry = { type: string; scaling: number[] };
/** Un tipo (formato antiguo) o varios (p. ej. AD + AP). */
export type BasicAttack = BasicAttackEntry | BasicAttackEntry[];

/** Normaliza basicAttack a lista y descarta entradas mal formadas. */
export function basicAttackEntries(value: BasicAttack | null | undefined): BasicAttackEntry[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (entry): entry is BasicAttackEntry =>
      !!entry &&
      typeof entry.type === 'string' &&
      Array.isArray(entry.scaling) &&
      entry.scaling.every(n => typeof n === 'number' && Number.isFinite(n)),
  );
}

export type Player = {
  name: string;
  rol?: string;
  /** Ataque básico: un tipo (formato antiguo) o varios (p. ej. AD + AP). */
  basicAttack?: BasicAttack;
  /** Nombres de habilidades definidas en habilidades.json. */
  abilities: Record<PlayerAbilitySlot, string | null>;
  equipamiento: string[];
  build: string[];
  /** Total de Cálculos (nivel + stats). */
  stats?: Record<string, number | string>;
  /** Nombre de archivo en images/pfp (p. ej. "samael.png"), ruta o URL. */
  image?: string;
  /** Máximo de PG de combate (editable). */
  hp?: number;
  /** PG actuales. */
  actualHp?: number;
  /** Escudo (persistido; no se muestra en la vista compacta). */
  escudo?: number;
  /** Vida temporal (persistida; solo en el editor). */
  vidaTemporal?: number;
  /** Máximo de maná (editable). */
  mana?: number;
  /** Maná actual. */
  actualMana?: number;
  /** Inspiración D&D 5e: activa o no (se gasta al usarla). */
  inspiration?: boolean;
  /** Descansos cortos usados desde el último largo (máx. 2). */
  shortRestsUsed?: number;
  /** Ficha D&D: rol de stats, características y extra. */
  sheet?: PlayerSheet;
  /** Rangos de Q/W/E (0–5) y R (0–3). La pasiva y los AA van por nivel y no se guardan. */
  abilityRanks?: AbilityRanks;
  /** Puntos de habilidad libres = nivel del grupo − puntos gastados (lo calcula la API). */
  unassignedPoints?: number;
};

/** URL pública del retrato. Vacío si no hay imagen. */
export function playerPortraitUrl(image: string | undefined | null): string | null {
  const value = image?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/images/pfp/${value.replace(/^\/+/, '')}`;
}

export let PLAYERS: Player[] = [];
export const PLAYERS_HYDRATED_EVENT = 'players:hydrated';

export function hydratePlayers(players: Player[]): void {
  PLAYERS = players;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLAYERS_HYDRATED_EVENT));
}

export function findPlayer(name: string): Player | undefined {
  const key = normalizeName(name);
  return PLAYERS.find(player => normalizeName(player.name) === key);
}

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

export type PlayerListPatch = Partial<
  Pick<Player, 'build' | 'equipamiento' | 'stats' | 'hp' | 'actualHp' | 'escudo' | 'vidaTemporal' | 'mana' | 'actualMana' | 'inspiration' | 'shortRestsUsed'>
> & {
  abilities?: Partial<Record<PlayerAbilitySlot, string | null>>;
  /** null borra la ficha. */
  sheet?: PlayerSheet | null;
  /** Solo los huecos que cambian; la API valida puntos y desbloqueos de la R. */
  abilityRanks?: Partial<Record<RankedSlot, number>>;
};

/** Sustituye la build o el equipamiento y deja la copia en memoria alineada con lo guardado. */
export async function savePlayerPatch(name: string, patch: PlayerListPatch): Promise<Player> {
  let response: Response;
  try {
    // Query (?name=) en vez de /api/players/:name: en Vercel la ruta con segmento
    // puede acabar en la reescritura SPA (index.html → 405) si falla vercel.json.
    response = await fetch(`/api/players?name=${encodeURIComponent(name)}`, {
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
