import { normalizeName } from '../lib/text';
import type { AbilityRanks, RankedSlot } from './abilityRanks';
import type { AbilityKind } from './champions';
import type { DndSkillProficiencies } from './dndSkills';
import type { PlayerMechanic } from '../features/players/mechanic';
export type { PlayerMechanic } from '../features/players/mechanic';

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

/**
 * Desbloqueos de la ficha (players.unlocks en Mongo). Solo los cambia el admin.
 * - quest / aumentos: pestañas de la ficha (con candado hasta desbloquearlas).
 * - questTop: «Quest de top» completada → desbloquea los niveles 19 y 20 de la tabla de rol.
 */
export type PlayerUnlocks = {
  quest?: boolean;
  aumentos?: boolean;
  questTop?: boolean;
  /** Quest de top asignada a este jugador (se puede quitar). */
  questTopAssigned?: boolean;
  /** Visualización de quests para players. false = ocultas aunque la pestaña esté desbloqueada (por defecto visibles). */
  questVisible?: boolean;
  /** Visualización de aumentos para players (por defecto visibles). */
  aumentosVisible?: boolean;
};

export type PlayerUnlockKey = keyof PlayerUnlocks;

/** Quest añadida desde la ficha (players.quests). La «Quest de top» va aparte en unlocks.questTop. */
export type PlayerQuest = {
  id: string;
  name: string;
  description?: string;
  reward?: string;
  done: boolean;
  /** Oculta para los players (el admin la sigue viendo). */
  hidden?: boolean;
};

/** Aumento añadido desde la ficha (players.aumentos). */
export type PlayerAumento = {
  id: string;
  name: string;
  description?: string;
  /** Oculto para los players (el admin lo sigue viendo). */
  hidden?: boolean;
  /** Aumento del catálogo (augments) del que se copió, si salió de ahí. */
  catalogId?: string;
  /** Aumento con niveles: efecto de nivel 1, 2 y 3 del aumento (no del player). */
  levels?: string[];
  /** Nivel actual del aumento (1-3); solo con levels. Empieza en 1. */
  level?: number;
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
  /** Color del icono de inspiración (hex #RRGGBB). Solo admin. */
  accentColor?: string | null;
  /** Descansos cortos usados desde el último largo (máx. 2). */
  shortRestsUsed?: number;
  /** Ficha D&D: rol de stats, características y extra. */
  sheet?: PlayerSheet;
  /** Rangos de Q/W/E (0–5) y R (0–3). La pasiva y los AA van por nivel y no se guardan. */
  abilityRanks?: AbilityRanks;
  /** Puntos de habilidad libres = nivel del grupo − puntos gastados (lo calcula la API). */
  unassignedPoints?: number;
  /** Pestañas desbloqueadas y quest de top completada. */
  unlocks?: PlayerUnlocks;
  /** Quests añadidas por el admin (pestaña Quest). */
  quests?: PlayerQuest[];
  /** Aumentos añadidos por el admin (pestaña Aumentos). */
  aumentos?: PlayerAumento[];
  /** URL de la imagen de fondo de su ficha (solo la de este player). */
  background?: string | null;
  /** Mecánica propia (Ruina / Humanidad / Fama). Opcional. */
  mechanic?: PlayerMechanic | null;
  /** Contadores de stacks (item:<nombre> | ability:<nombre> | effect:<efecto base> = cargas permanentes). */
  stacks?: Record<string, number>;
  /** Cooldowns restantes en turnos (item:<nombre> | ability:<nombre>). */
  cooldowns?: Record<string, number>;
  /** Duración restante del efecto de un ítem (item:<nombre>). */
  activeEffects?: Record<string, number>;
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

/** Ficha abierta en Players (se recuerda al recargar). */
export const OPEN_PLAYER_KEY = 'players.openPlayer';
export const OPEN_PLAYER_EVENT = 'players:open';

/** Deja abierta la ficha de `name` en Players (si Players ya está montado, la abre al momento). */
export function openPlayerSheet(name: string): void {
  try { localStorage.setItem(OPEN_PLAYER_KEY, name); } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<string>(OPEN_PLAYER_EVENT, { detail: name }));
}

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
  Pick<Player, 'build' | 'equipamiento' | 'stats' | 'hp' | 'actualHp' | 'escudo' | 'vidaTemporal' | 'mana' | 'actualMana' | 'inspiration' | 'accentColor' | 'shortRestsUsed'>
> & {
  abilities?: Partial<Record<PlayerAbilitySlot, string | null>>;
  /** null borra la ficha. */
  sheet?: PlayerSheet | null;
  /** Solo los huecos que cambian; la API valida puntos y desbloqueos de la R. */
  abilityRanks?: Partial<Record<RankedSlot, number>>;
  /** Solo las claves que cambian; la API las fusiona con las guardadas. */
  unlocks?: PlayerUnlocks;
  /** Lista completa: sustituye la guardada. */
  quests?: PlayerQuest[];
  /** Lista completa: sustituye la guardada. */
  aumentos?: PlayerAumento[];
  /** Fondo de la ficha; null lo quita. */
  background?: string | null;
  /** Mecánica de personaje; null la quita. */
  mechanic?: PlayerMechanic | null;
  /** Merge de contadores de stacks. */
  stacks?: Record<string, number>;
  /** Merge de cooldowns restantes. */
  cooldowns?: Record<string, number>;
  /** Merge de efectos activos restantes. */
  activeEffects?: Record<string, number>;
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
