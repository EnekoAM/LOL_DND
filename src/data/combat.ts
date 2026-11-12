import { tickActiveEffects, tickCooldowns } from './stacks';
import { readAppIdentity, readAppRole } from './appRole';

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
  /** Acumulaciones del estado (p. ej. Rotura de armadura ×2). */
  stacks?: number;
  /** Origen del efecto: item:<nombre> o ability:<nombre>. */
  source?: string;
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
  /** Recurso actual del campeón en este combate (máximo = stat de la ficha). */
  currentResource?: number;
  /** CD restantes de habilidades usadas desde el panel (solo campeón). */
  cooldowns?: Record<string, number>;
  /** Efectos propios restantes de habilidades usadas desde el panel (solo campeón). */
  activeEffects?: Record<string, number>;
  /** Fase actual (0 = base) de habilidades con variantes. Claves ability:<nombre>. Se vacía al terminar. */
  abilityPhases?: Record<string, number>;
  /**
   * Copia propia de la ficha (campeón / NPC) tomada al añadirlo. Cada participante usa la suya:
   * dos Aatrox no comparten nada y el documento base no se toca. Los players no llevan copia.
   */
  sheet?: CombatSheet;
  /** Vida temporal y escudo (campeones / NPCs). */
  tempHp?: number;
  shield?: number;
  /** Máximo del recurso fijado a mano; si no, el de sus stats / Recurso. */
  resourceMax?: number;
  /**
   * Ataques / habilidades que le quedan este turno. Ausente = todos (los de su ficha: Attacks / Abilities).
   * Se borra al empezar su turno.
   */
  actionsLeft?: { attacks?: number; abilities?: number; items?: number };
  /** Ataques / habilidades extra concedidos este turno (ya sumados en actionsLeft). Se borra al empezar su turno. */
  actionsExtra?: { attacks?: number; abilities?: number; items?: number };
  /** Bonus temporales de stats (manuales o de pasivas de ítems). */
  bonuses?: CombatBonus[];
  /** Cargas de Vigor (0-100). Solo se ven y suben si lleva un ítem con Vigor (energized). */
  vigor?: number;
  /** Movimiento gastado este turno (casillas, como Velocidad). Se borra al empezar su turno. */
  movementUsed?: number;
};

/** Bonus temporal: amount × stacks se suma al total; turns baja al empezar su turno (ausente = hasta quitarlo). */
export type CombatBonus = {
  id: string;
  /** Clave de stat de Cálculos (StatKey). */
  stat: string;
  amount: number;
  stacks?: number;
  maxStacks?: number;
  turns?: number;
  /** Marcador 'charges' (cargas de combate, source charges:<efecto>): amount = cargas, maxStacks = máx.; recarga en recharge turnos, cada rechargeEvery. */
  recharge?: number;
  rechargeEvery?: number;
  /** "manual" o "item:<nombre>". */
  source?: string;
  label?: string;
};

export type CombatSheet = {
  kind: 'champion' | 'npc';
  capturedAt: string;
  /** Champion entero (kind champion) o CombatNpcSheet (kind npc). */
  data: Record<string, unknown>;
  /** Rango de cada habilidad (Q/W/E/R…) de esta copia. */
  abilityRanks?: Record<string, number>;
};

export type CombatState = {
  active: boolean;
  round: number;
  turnIndex: number;
  participants: CombatParticipant[];
  /** Vigor por casilla de movimiento (ajustable en el combate; por defecto VIGOR_PER_MOVE_DEFAULT). */
  vigorPerMove?: number;
  updatedAt?: string;
};

export const VIGOR_MAX = 100;
/** Vigor por ataque básico. */
export const VIGOR_PER_AA = 7;
/** Vigor por casilla de movimiento si el combate no fija otro (en LoL: 1 carga cada 24 unidades). */
export const VIGOR_PER_MOVE_DEFAULT = 1;

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
    ...(typeof source.vigorPerMove === 'number' && Number.isFinite(source.vigorPerMove) ? { vigorPerMove: source.vigorPerMove } : {}),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
  };
}

export async function loadCombat(): Promise<CombatState> {
  let response: Response;
  try {
    response = await fetch('/api/combat', { headers: readAppRole() === 'admin' ? { 'X-App-Role': 'admin' } : {} });
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
        ...(typeof state.vigorPerMove === 'number' ? { vigorPerMove: state.vigorPerMove } : {}),
      }),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar el combate`));
  const saved = normalize(body);
  // Reset a Preparación vacía ⇒ el server limpió CD/efectos: refrescar memoria local.
  if (!saved.active && saved.participants.length === 0) await refreshPlayersAfterCombatEnd();
  return saved;
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
  // La pestaña que llama ignora su propio live (X-Client-Id): hay que rehidratar players aquí.
  await refreshPlayersAfterCombatEnd();
  return normalize(body);
}

async function refreshPlayersAfterCombatEnd(): Promise<void> {
  try {
    const { hydratePlayers } = await import('./players');
    const { bumpLive } = await import('./live');
    const res = await fetch('/api/players');
    if (!res.ok) return;
    const list: unknown = await res.json().catch(() => null);
    if (!Array.isArray(list)) return;
    hydratePlayers(list as import('./players').Player[]);
    // Misma pestaña: el live se ignora por X-Client-Id; forzamos repintado.
    bumpLive(['players']);
  } catch {
    /* el combate ya terminó; el live de otras pestañas igual refresca */
  }
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

export const COMBAT_MAX_EFFECTS = 12;

export type SourcedEffectInput = {
  source: string;
  name: string;
  duration: number;
  hasStacks?: boolean;
  maxStacks?: number;
  /** Valor del estado (p. ej. 20 = ralentización 20 %). Entero 1-99. */
  value?: number;
  /**
   * Deshacer: estado anterior de ese efecto (source) por objetivo; null = no lo tenía (se quita).
   * Con restore no se aplica nada nuevo.
   */
  restore?: Record<string, CombatEffect | null>;
};

/** Aplica un efecto de ítem/habilidad al objetivo. Si ya está, refresca duración y suma 1 stack. */
export function applySourcedEffect(target: CombatParticipant, input: SourcedEffectInput): CombatParticipant {
  if (input.restore) {
    if (!(target.id in input.restore)) return target;
    const previous = input.restore[target.id];
    const others = target.effects.filter(effect => effect.source !== input.source);
    return { ...target, effects: previous ? [...others, previous] : others };
  }
  const name = input.name.trim().slice(0, 80) || input.source;
  const value = typeof input.value === 'number' && Number.isInteger(input.value) && input.value >= 1 && input.value <= 99 ? input.value : undefined;
  const duration = Math.max(1, Math.trunc(input.duration));
  const existing = target.effects.find(effect => effect.source === input.source);
  if (existing) {
    const nextStacks = (existing.stacks ?? 1) + 1;
    const stacks = typeof input.maxStacks === 'number' ? Math.min(nextStacks, input.maxStacks) : Math.min(nextStacks, 999);
    return {
      ...target,
      effects: target.effects.map(effect => (
        effect.id === existing.id ? { ...effect, name, duration, stacks, ...(value ? { value } : {}) } : effect
      )),
    };
  }
  if (target.effects.length >= COMBAT_MAX_EFFECTS) return target;
  const effect: CombatEffect = { id: newId(), name, duration, source: input.source, ...(value ? { value } : {}) };
  if (input.hasStacks) effect.stacks = 1;
  return { ...target, effects: [...target.effects, effect] };
}

/** Ajusta las stacks de un estado (mín. 1). */
export function setEffectStacks(participant: CombatParticipant, effectId: string, stacks: number, maxStacks?: number): CombatParticipant {
  const next = Math.max(1, Math.trunc(stacks));
  const capped = typeof maxStacks === 'number' ? Math.min(next, maxStacks) : Math.min(next, 999);
  return {
    ...participant,
    effects: participant.effects.map(effect => (effect.id === effectId ? { ...effect, stacks: capped } : effect)),
  };
}
/** Baja CD y efectos propios guardados en el participante (campeones en combate). */
/** Cargas de combate al empezar el turno del portador: cuenta atrás; a 0, +1 carga (hasta el máx.) y vuelve a contar si falta. */
export function tickCharges(bonus: CombatBonus): CombatBonus {
  const max = bonus.maxStacks ?? 0;
  if (typeof bonus.recharge !== 'number' || bonus.amount >= max) return bonus;
  const left = bonus.recharge - 1;
  if (left > 0) return { ...bonus, recharge: left };
  const amount = Math.min(max, bonus.amount + 1);
  const { recharge: _done, ...rest } = bonus;
  return amount < max && bonus.rechargeEvery ? { ...rest, amount, recharge: bonus.rechargeEvery } : { ...rest, amount };
}

export function tickCombatTrackers(participant: CombatParticipant): CombatParticipant {
  // Empieza su turno: vuelve a tener todos sus ataques y habilidades.
  if (participant.actionsLeft || participant.actionsExtra) {
    const { actionsLeft: _reset, actionsExtra: _extra, ...rest } = participant;
    participant = rest;
  }
  // Y vuelve a tener todo su movimiento.
  if (participant.movementUsed) {
    const { movementUsed: _moved, ...rest } = participant;
    participant = rest;
  }
  if (participant.bonuses?.length) {
    // Bonus con duración: un turno menos; a 0 se quitan.
    const bonuses = participant.bonuses
      .map(bonus => (bonus.stat === 'charges' ? tickCharges(bonus) : bonus))
      .map(bonus => (typeof bonus.turns === 'number' ? { ...bonus, turns: bonus.turns - 1 } : bonus))
      .filter(bonus => typeof bonus.turns !== 'number' || bonus.turns > 0);
    const { bonuses: _old, ...rest } = participant;
    participant = bonuses.length ? { ...rest, bonuses } : rest;
  }
  if (!participant.cooldowns && !participant.activeEffects) return participant;
  return {
    ...participant,
    cooldowns: participant.cooldowns ? tickCooldowns(participant.cooldowns) : participant.cooldowns,
    activeEffects: participant.activeEffects ? tickActiveEffects(participant.activeEffects) : participant.activeEffects,
  };
}

/**
 * Vida de un participante en combate. El admin puede la de todos; un User solo la de su player
 * (el servidor lo comprueba con X-App-Role / X-App-Player). Players: se guarda en su ficha.
 */
export async function saveCombatHp(
  participantId: string,
  current: number,
  max?: number,
  extra?: { tempHp?: number; shield?: number },
): Promise<{ combat: CombatState; player?: import('./players').Player }> {
  return saveCombatValue('hp', participantId, current, max, extra);
}

/** Recurso actual (maná, energía…) en combate; mismos permisos que la vida. Players: mana/actualMana de su ficha. */
export async function saveCombatResource(participantId: string, current: number, max?: number): Promise<{ combat: CombatState; player?: import('./players').Player }> {
  return saveCombatValue('resource', participantId, current, max);
}

/** Bonus temporales de un participante (sustituye la lista). Admin: cualquiera; User: su player. */
export async function saveCombatBonuses(participantId: string, bonuses: CombatBonus[]): Promise<CombatState> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-App-Role': readAppRole() ?? 'user' };
  const identity = readAppIdentity();
  if (identity?.kind === 'player') headers['X-App-Player'] = encodeURIComponent(identity.name);
  let response: Response;
  try {
    response = await fetch('/api/combat', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ op: 'bonuses', participantId, bonuses }),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar los bonus`));
  return normalize(((body ?? {}) as { combat?: unknown }).combat);
}

/**
 * Acciones que le quedan este turno (left) y cuántas de ellas son extra. Admin: cualquiera; User: su player.
 */
export async function saveCombatActions(
  participantId: string,
  kind: 'attacks' | 'abilities' | 'items',
  left: number,
  extra: number,
): Promise<CombatState> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-App-Role': readAppRole() ?? 'user' };
  const identity = readAppIdentity();
  if (identity?.kind === 'player') headers['X-App-Player'] = encodeURIComponent(identity.name);
  let response: Response;
  try {
    response = await fetch('/api/combat', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ op: 'actions', participantId, kind, left, extra }),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar las acciones`));
  return normalize(((body ?? {}) as { combat?: unknown }).combat);
}

async function saveCombatValue(
  op: 'hp' | 'resource',
  participantId: string,
  current: number,
  max?: number,
  extra?: { tempHp?: number; shield?: number },
): Promise<{ combat: CombatState; player?: import('./players').Player }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-App-Role': readAppRole() ?? 'user' };
  const identity = readAppIdentity();
  if (identity?.kind === 'player') headers['X-App-Player'] = encodeURIComponent(identity.name);
  let response: Response;
  try {
    response = await fetch('/api/combat', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ op, participantId, current, ...(max === undefined ? {} : { max }), ...extra }),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar ${op === 'hp' ? 'la vida' : 'el recurso'}`));
  const result = (body ?? {}) as { combat?: unknown; player?: import('./players').Player };
  if (result.player) {
    const { PLAYERS } = await import('./players');
    const index = PLAYERS.findIndex(p => p.name === result.player!.name);
    if (index >= 0) PLAYERS[index] = result.player;
  }
  return { combat: normalize(result.combat), player: result.player };
}
