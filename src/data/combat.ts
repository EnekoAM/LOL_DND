/** Estado del combate activo (Mongo: combat/active). */

export const COMBAT_EFFECT_PRESETS = [
  'Aturdido',
  'Envenenado',
  'Ralentizado',
  'Quemado',
  'Silenciado',
  'Enraizado',
  'Cegado',
  'Invisible',
  'Escudo',
  'Sangrado',
  'Heridas graves',
  'MR reducido',
  'AC reducido',
] as const;

export type CombatParticipantKind = 'player' | 'npc' | 'champion' | 'custom';

export type CombatEffect = {
  id: string;
  name: string;
  duration: number;
  /** Valor numérico opcional (p. ej. reducción de AC/MR). */
  value?: number;
};

export type CombatParticipant = {
  id: string;
  kind: CombatParticipantKind;
  name: string;
  baseName?: string;
  copyIndex?: number;
  sourceId?: string;
  initiative: number;
  initiativeBonus?: number;
  /** Opcional / legacy; la UI de Combate ya no usa PG. */
  hp?: number;
  maxHp?: number;
  defeated: boolean;
  image?: string;
  effects: CombatEffect[];
};

export type CombatState = {
  active: boolean;
  round: number;
  turnIndex: number;
  participants: CombatParticipant[];
  updatedAt?: string;
};

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';
const ADMIN_JSON = { 'Content-Type': 'application/json', 'X-App-Role': 'admin' };

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
    return (body as { error: string }).error;
  }
  return fallback;
}

function normalize(raw: unknown): CombatState {
  if (!raw || typeof raw !== 'object') {
    return { active: false, round: 1, turnIndex: 0, participants: [] };
  }
  const source = raw as Record<string, unknown>;
  return {
    active: source.active === true,
    round: typeof source.round === 'number' && source.round >= 1 ? Math.trunc(source.round) : 1,
    turnIndex: typeof source.turnIndex === 'number' && source.turnIndex >= 0 ? Math.trunc(source.turnIndex) : 0,
    participants: Array.isArray(source.participants) ? (source.participants as CombatParticipant[]) : [],
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
  };
}

export async function loadCombat(): Promise<CombatState> {
  let response: Response;
  try {
    response = await fetch('/api/combat');
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al cargar el combate`));
  return normalize(body);
}

export async function saveCombat(state: CombatState): Promise<CombatState> {
  let response: Response;
  try {
    response = await fetch('/api/combat', {
      method: 'PUT',
      headers: ADMIN_JSON,
      body: JSON.stringify({
        active: state.active,
        round: state.round,
        turnIndex: state.turnIndex,
        participants: state.participants,
      }),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar el combate`));
  return normalize(body);
}

/** Termina el combate en servidor: vacía Preparación y limpia CD/efectos de los players. */
export async function endCombatRemote(): Promise<CombatState> {
  let response: Response;
  try {
    response = await fetch('/api/combat', {
      method: 'POST',
      headers: ADMIN_JSON,
      body: JSON.stringify({ end: true }),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al terminar el combate`));
  return normalize(body);
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sortByInitiative(list: CombatParticipant[]): CombatParticipant[] {
  return [...list].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return a.name.localeCompare(b.name, 'es');
  });
}

export function rollInitiative(bonus = 0): number {
  return Math.floor(Math.random() * 20) + 1 + bonus;
}

/** Al empezar el turno de un participante: baja duración de sus efectos y quita los que llegan a 0. */
export function tickEffectsFor(participant: CombatParticipant): CombatParticipant {
  const effects = participant.effects
    .map(effect => ({ ...effect, duration: effect.duration - 1 }))
    .filter(effect => effect.duration > 0);
  return { ...participant, effects };
}
