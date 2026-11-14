import type { CombatBonus, CombatEffect, CombatParticipant } from './combat';

/**
 * Rasgos de combate genéricos (NPCs, campeones y jugadores).
 * Van en ability.mechanics.combatTraits y los usa el mismo motor de combate.
 */
export type CombatTraits = {
  /** Quita al objetivo del combate hasta que muera el captor. */
  capture?: { name?: string };
  /** Al empezar el combate: estado a N enemigos (el admin elige si hace falta). */
  combatStart?: { statusName: string; turns: number; pick?: 'enemy'; count?: number };
  /** Al entrar en combate: estado a aliados, a uno mismo o a enemigos (sin elegir). */
  combatEntry?: { statusName: string; turns?: number; appliesTo: 'allies' | 'self' | 'enemies' };
  /** Reducción de daño plana por golpe. auraAllies: los aliados también son Duros. */
  tough?: {
    flat: number;
    name?: string;
    auraAllies?: boolean;
    onAllySurvive?: { atkSpe?: number; ac?: number; mr?: number };
  };
  /** Aura con distancias a mano: interruptor «en el aura» por unidad afectada. */
  aura?: { range: number; label?: string; abSpe?: number; minAbSpe?: number; manaCost?: number; manaCostPct?: number };
  /** MR alta con la vida llena que baja en línea hasta min al acercarse a 0 PG. */
  mrScalesWithHp?: { max: number; min: number };
  /** El AA suma este % de la vida máxima del atacante. */
  formidable?: { hpPct: number };
  /** % del daño de habilidades que recibe (0 = inmune; el AA y los objetos sí entran). */
  abilityDamageTaken?: { pct: number };
  /** Si un aliado recibe daño mágico: % máx. (× vida actual / máx.) de redirigirlo al portador. */
  absorbAllyMagic?: { chancePct?: number; name?: string };
  /** Al usarla: el daño que reciba el aliado marcado se redirige al portador. */
  guardAlly?: { name?: string; turns: number };
  /** Cuando un aliado entra en un combate ya empezado. */
  onAllyJoin?: { statusName?: string; turns?: number; pick?: 'enemy'; challenge?: boolean };
  /** Interruptor: bonus al impacto si hay un aliado adyacente (a mano). */
  packTactics?: { label?: string; hitBonus: number };
  /** Inmune a CC / Desafío de enemigos con menos vida actual. */
  unstoppableVsLowerHp?: { name?: string };
  /** Vista verdadera / olfato: no se le escapa lo invisible a este alcance (distancia a mano). */
  trueSight?: { range: number; label?: string };
  /** Aviso al morir (el botín u otras consecuencias pueden seguir a mano). */
  deathNotice?: { text: string };
  /** Botón / uso: aplica Desafío o Provocación al objetivo elegido. */
  challenge?: { statusName?: string; turns?: number };
  /** Cada AA deja una marca; al llegar al máximo se consume. */
  aaMark?: {
    name: string;
    max: number;
    consume?: boolean;
    damage?: number;
    damageType?: 'physical' | 'magic' | 'true';
    status?: string;
    statusTurns?: number;
  };
  /** Cuando un enemigo usa su R. */
  onEnemyUltimate?: {
    oncePerCombat?: boolean;
    atkSpe?: number;
    ac?: number;
    /** Bonus de MR (admite pasos de 0,25). */
    mr?: number;
    taunt?: boolean;
    tauntName?: string;
    tauntTurns?: number;
    grantCharges?: number;
    grantChargeTo?: string;
  };
};

export const CAPTURE_PREFIX = 'capture:';
export const TAUNT_PREFIX = 'taunt:';
export const ONCE_ENEMY_ULT_PREFIX = 'once:enemy-ult:';
export const AURA_PREFIX = 'aura:';
export const AA_MARK_PREFIX = 'aamark:';
export const FLAT_DR_STAT = 'flatDr';
export const SURVIVE_BUFF_PREFIX = 'survive:';
export const START_PREFIX = 'start:';
export const ENTRY_PREFIX = 'entry:';
export const TOUGH_PREFIX = 'tough:';
export const GUARD_PREFIX = 'guard:';
export const PACK_PREFIX = 'pack:';
export const HIT_STAT = 'hit';

const fold = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Número de rasgo con decimales de 0,25, para textos: +0,25 / +0,5 / +1. */
export function formatTraitNum(n: number): string {
  const cleaned = Math.round(n * 100) / 100;
  const body = Number.isInteger(cleaned) ? String(cleaned) : String(cleaned).replace('.', ',');
  return `${cleaned > 0 ? '+' : ''}${body}`;
}


const NAME_SETS = {
  taunt: ['desafio', 'provocacion', 'taunt', 'challenged'],
  silence: ['silenciado', 'silencio', 'suprimido', 'supresion', 'silence', 'suppression'],
  fear: ['asustado', 'miedo', 'temor', 'fear'],
  tough: ['duro', 'dura', 'duros', 'duras'],
  capture: ['detenido', 'detenida', 'capturado', 'capturada'],
  phantasmal: ['fantasmal'],
};

const nameMatches = (name: string, keys: string[]): boolean => {
  const folded = fold(name);
  return keys.some(key => folded === key || folded.includes(key));
};

export const isTauntName = (name: string): boolean => nameMatches(name, NAME_SETS.taunt);
export const isSilenceName = (name: string): boolean => nameMatches(name, NAME_SETS.silence);
export const isFearName = (name: string): boolean => nameMatches(name, NAME_SETS.fear);
export const isToughName = (name: string): boolean => nameMatches(name, NAME_SETS.tough);
export const isCaptureName = (name: string): boolean => nameMatches(name, NAME_SETS.capture);
export const isPhantasmalName = (name: string): boolean => nameMatches(name, NAME_SETS.phantasmal);

const liveEffect = (effect: CombatEffect | undefined): boolean => !!effect && (effect.duration ?? 0) > 0;

export const combatSide = (entry: Pick<CombatParticipant, 'kind'>): 'players' | 'dm' =>
  entry.kind === 'player' ? 'players' : 'dm';

export const isEnemyOf = (a: Pick<CombatParticipant, 'id' | 'kind'>, b: Pick<CombatParticipant, 'id' | 'kind'>): boolean =>
  a.id !== b.id && combatSide(a) !== combatSide(b);

export const isAllyOf = (a: Pick<CombatParticipant, 'id' | 'kind'>, b: Pick<CombatParticipant, 'id' | 'kind'>): boolean =>
  a.id !== b.id && combatSide(a) === combatSide(b);

export const captureSource = (captorId: string): string => `${CAPTURE_PREFIX}${captorId}`;
export const tauntSource = (challengerId: string): string => `${TAUNT_PREFIX}${challengerId}`;
export const onceEnemyUltSource = (abilityName: string): string => `${ONCE_ENEMY_ULT_PREFIX}${abilityName}`.slice(0, 80);
export const auraSource = (bearerId: string, abilityName: string): string => `${AURA_PREFIX}${bearerId}:${abilityName}`.slice(0, 80);
export const aaMarkSource = (attackerId: string, markName: string): string => `${AA_MARK_PREFIX}${attackerId}:${markName}`.slice(0, 80);
export const surviveBuffSource = (auraBearerId: string): string => `${SURVIVE_BUFF_PREFIX}${auraBearerId}`.slice(0, 80);
export const toughBonusSource = (abilityName: string): string => `flatdr:${abilityName}`.slice(0, 80);
export const combatStartSource = (bearerId: string, abilityName: string): string => `${START_PREFIX}${bearerId}:${abilityName}`.slice(0, 80);
export const combatEntrySource = (bearerId: string, abilityName: string): string => `${ENTRY_PREFIX}${bearerId}:${abilityName}`.slice(0, 80);
export const toughAuraSource = (bearerId: string, abilityName: string): string => `${TOUGH_PREFIX}${bearerId}:${abilityName}`.slice(0, 80);

export function captureEffect(captorId: string, name = 'Detenido'): Omit<CombatEffect, 'id'> {
  return { name, duration: 99, source: captureSource(captorId) };
}

export function isCaptured(participant: Pick<CombatParticipant, 'effects' | 'defeated'>): boolean {
  if (participant.defeated) return false;
  return (participant.effects ?? []).some(effect => liveEffect(effect) && (
    (effect.source ?? '').startsWith(CAPTURE_PREFIX) || isCaptureName(effect.name)
  ));
}

export function captorIdOf(participant: Pick<CombatParticipant, 'effects'>): string | undefined {
  const effect = (participant.effects ?? []).find(entry => liveEffect(entry) && (entry.source ?? '').startsWith(CAPTURE_PREFIX));
  if (!effect?.source) return undefined;
  const id = effect.source.slice(CAPTURE_PREFIX.length).trim();
  return id || undefined;
}

export function captivesOf(captorId: string, participants: Pick<CombatParticipant, 'id' | 'effects' | 'defeated'>[]): typeof participants {
  const source = captureSource(captorId);
  return participants.filter(entry => !entry.defeated && (entry.effects ?? []).some(effect => liveEffect(effect) && effect.source === source));
}

/** Quita los efectos de captura de quienes este captor tenía detenidos. */
export function releaseCaptives<T extends { id: string; effects?: CombatEffect[] }>(captorId: string, participants: T[]): { participants: T[]; releasedIds: string[] } {
  const source = captureSource(captorId);
  const releasedIds: string[] = [];
  const next = participants.map(entry => {
    const effects = entry.effects ?? [];
    if (!effects.some(effect => effect.source === source)) return entry;
    releasedIds.push(entry.id);
    return { ...entry, effects: effects.filter(effect => effect.source !== source) };
  });
  return { participants: next, releasedIds };
}

export function isSilenced(participant: Pick<CombatParticipant, 'effects'>): boolean {
  return (participant.effects ?? []).some(effect => liveEffect(effect) && isSilenceName(effect.name));
}

export function isFeared(participant: Pick<CombatParticipant, 'effects'>): boolean {
  return (participant.effects ?? []).some(effect => liveEffect(effect) && isFearName(effect.name));
}

/** No puede actuar: derrotado, capturado o asustado. */
export function cannotAct(participant: Pick<CombatParticipant, 'effects' | 'defeated'>): string | undefined {
  if (participant.defeated) return 'Está derrotado';
  if (isCaptured(participant)) return 'Está detenido (fuera del combate)';
  if (isFeared(participant)) return 'Está asustado';
  return undefined;
}

export function cannotUseAbilities(participant: Pick<CombatParticipant, 'effects' | 'defeated'>): string | undefined {
  const blocked = cannotAct(participant);
  if (blocked) return blocked;
  if (isSilenced(participant)) return 'Está silenciado / suprimido';
  return undefined;
}

export function tauntEffect(challengerId: string, name = 'Desafío', turns = 99): Omit<CombatEffect, 'id'> {
  return { name, duration: Math.max(1, turns), source: tauntSource(challengerId) };
}

export function forcedTargetId(actor: Pick<CombatParticipant, 'effects'>, participants: Pick<CombatParticipant, 'id' | 'defeated'>[]): string | undefined {
  const effect = (actor.effects ?? []).find(entry => liveEffect(entry) && (
    (entry.source ?? '').startsWith(TAUNT_PREFIX) || isTauntName(entry.name)
  ));
  if (!effect) return undefined;
  if ((effect.source ?? '').startsWith(TAUNT_PREFIX)) {
    const id = effect.source!.slice(TAUNT_PREFIX.length).trim();
    const target = participants.find(entry => entry.id === id && !entry.defeated);
    return target?.id;
  }
  return undefined;
}

export type AbilityLike = { name: string; mechanics?: { combatTraits?: CombatTraits } | null };

export function ownedCombatTraits(abilities: AbilityLike[] | undefined): { name: string; traits: CombatTraits }[] {
  const out: { name: string; traits: CombatTraits }[] = [];
  for (const ability of abilities ?? []) {
    const traits = ability.mechanics?.combatTraits;
    if (traits) out.push({ name: ability.name, traits });
  }
  return out;
}

export function incomingFlatDamageReduction(
  target: Pick<CombatParticipant, 'id' | 'kind' | 'bonuses' | 'effects'>,
  participants: Array<Pick<CombatParticipant, 'id' | 'kind' | 'defeated'> & { abilities?: AbilityLike[] }>,
): { amount: number; labels: string[] } {
  let amount = 0;
  const labels: string[] = [];
  const seen = new Set<string>();
  const add = (value: number, label: string, key: string) => {
    if (!(value > 0) || seen.has(key)) return;
    seen.add(key);
    amount += value;
    labels.push(label);
  };
  for (const bonus of target.bonuses ?? []) {
    if (bonus.stat !== FLAT_DR_STAT) continue;
    const value = Math.round((bonus.amount ?? 0) * (bonus.stacks ?? 1));
    add(value, bonus.label ?? 'Duro', bonus.source ?? `bonus:${bonus.id}`);
  }
  for (const effect of target.effects ?? []) {
    if (!liveEffect(effect) || !isToughName(effect.name)) continue;
    const value = typeof effect.value === 'number' && Number.isFinite(effect.value) ? effect.value : 1;
    add(value, effect.name, effect.source ?? `effect:${effect.name}`);
  }
  for (const ally of participants) {
    if (ally.defeated) continue;
    const self = ally.id === target.id;
    const nearbyAlly = isAllyOf(ally, target);
    if (!self && !nearbyAlly) continue;
    for (const { name, traits } of ownedCombatTraits(ally.abilities)) {
      const tough = traits.tough;
      if (!tough || !(tough.flat > 0)) continue;
      if (!self && !tough.auraAllies) continue;
      add(tough.flat, tough.name ?? name, `tough:${ally.id}:${name}`);
    }
  }
  return { amount: Math.max(0, amount), labels };
}

/** Aplica la reducción plana por golpe (después de los %). Nunca baja de 0. */
export function applyFlatDamageReduction(amount: number, flat: number): number {
  if (!(amount > 0) || !(flat > 0)) return Math.max(0, amount);
  return Math.max(0, amount - flat);
}

export function hasOnceMarker(bonuses: CombatBonus[] | undefined, source: string): boolean {
  return (bonuses ?? []).some(bonus => bonus.source === source);
}

export function onceMarker(source: string, label: string, id: string): CombatBonus {
  return { id, stat: 'cooldown', amount: 1, turns: 99, source, label: `${label} (1/combate)` };
}

export function statBonus(opts: { id: string; stat: string; amount: number; source: string; label: string; turns?: number }): CombatBonus {
  return {
    id: opts.id,
    stat: opts.stat,
    amount: opts.amount,
    source: opts.source,
    label: opts.label,
    ...(opts.turns != null ? { turns: opts.turns } : {}),
  };
}

export type EnemyUltimateChange = {
  bonuses: CombatBonus[];
  newEffects: Omit<CombatEffect, 'id'>[];
  grantedCharges: { abilityName: string; amount: number }[];
  log: string[];
};

/**
 * Cuando un enemigo usa su R: aplica los rasgos onEnemyUltimate del reactor.
 * Puro y comprobable. oncePerCombat deja un marcador que no caduca en el combate.
 * El Desafío lo aplica el reactor sobre el que usó la R (casterId).
 */
export function applyEnemyUltimateTraits(options: {
  reactorId: string;
  reactorName: string;
  bonuses: CombatBonus[] | undefined;
  abilities: AbilityLike[];
  casterId: string;
  newId: () => string;
}): EnemyUltimateChange {
  let bonuses = [...(options.bonuses ?? [])];
  const newEffects: Omit<CombatEffect, 'id'>[] = [];
  const grantedCharges: { abilityName: string; amount: number }[] = [];
  const log: string[] = [];
  for (const { name, traits } of ownedCombatTraits(options.abilities)) {
    const cfg = traits.onEnemyUltimate;
    if (!cfg) continue;
    const onceSource = onceEnemyUltSource(name);
    if (cfg.oncePerCombat && hasOnceMarker(bonuses, onceSource)) {
      log.push(`${options.reactorName}: «${name}» ya usado en este combate`);
      continue;
    }
    const bits: string[] = [];
    if (cfg.atkSpe) {
      bonuses = upsertBonus(bonuses, statBonus({
        id: options.newId(),
        stat: 'atkSpe',
        amount: cfg.atkSpe,
        source: `enemy-ult:${name}:atkSpe`.slice(0, 80),
        label: `${name} (+ataques)`,
      }));
      bits.push(`${cfg.atkSpe > 0 ? '+' : ''}${cfg.atkSpe} ataques`);
    }
    if (cfg.ac) {
      bonuses = upsertBonus(bonuses, statBonus({
        id: options.newId(),
        stat: 'ac',
        amount: cfg.ac,
        source: `enemy-ult:${name}:ac`.slice(0, 80),
        label: `${name} (+CA)`,
      }));
      bits.push(`${cfg.ac > 0 ? '+' : ''}${cfg.ac} CA`);
    }
    if (cfg.mr) {
      const amount = Math.round(cfg.mr * 4) / 4;
      bonuses = upsertBonus(bonuses, statBonus({
        id: options.newId(),
        stat: 'mr',
        amount,
        source: `enemy-ult:${name}:mr`.slice(0, 80),
        label: `${name} (+MR)`,
      }));
      bits.push(`${formatTraitNum(amount)} MR`);
    }
    if (cfg.taunt) {
      const tauntName = cfg.tauntName?.trim() || 'Desafío';
      newEffects.push(tauntEffect(options.reactorId, tauntName, cfg.tauntTurns ?? 99));
      bits.push(`${tauntName} al que usó la R`);
    }
    if (cfg.grantCharges && cfg.grantCharges > 0) {
      const targetName = cfg.grantChargeTo?.trim() || name;
      grantedCharges.push({ abilityName: targetName, amount: cfg.grantCharges });
      bits.push(`+${cfg.grantCharges} carga${cfg.grantCharges === 1 ? '' : 's'} de «${targetName}»`);
    }
    if (cfg.oncePerCombat) {
      bonuses = upsertBonus(bonuses, onceMarker(onceSource, name, options.newId()));
    }
    if (bits.length) log.push(`${options.reactorName}: «${name}» al usar un enemigo su R → ${bits.join(', ')}`);
  }
  return { bonuses, newEffects, grantedCharges, log };
}

export function upsertBonus(bonuses: CombatBonus[], entry: CombatBonus): CombatBonus[] {
  const rest = bonuses.filter(bonus => bonus.source !== entry.source);
  return [...rest, entry];
}

export type AaMarkResult = {
  bonuses: CombatBonus[];
  stacks: number;
  consumed: boolean;
  bonusDamage: number;
  damageType?: 'physical' | 'magic' | 'true';
  status?: Omit<CombatEffect, 'id'>;
  log: string[];
};

/** Cada AA añade una marca en el objetivo. Al llegar al máximo, si consume, aplica daño y/o estado. */
export function applyAaMark(options: {
  targetBonuses: CombatBonus[] | undefined;
  attackerId: string;
  attackerName: string;
  abilityName: string;
  mark: NonNullable<CombatTraits['aaMark']>;
  newId: () => string;
}): AaMarkResult {
  const source = aaMarkSource(options.attackerId, options.mark.name);
  const current = (options.targetBonuses ?? []).find(bonus => bonus.source === source);
  const before = current?.amount ?? 0;
  const after = before + 1;
  const max = Math.max(1, options.mark.max);
  const atMax = after >= max;
  const consume = atMax && options.mark.consume !== false;
  const stacks = consume ? 0 : Math.min(max, after);
  let bonuses = (options.targetBonuses ?? []).filter(bonus => bonus.source !== source);
  const log: string[] = [];
  if (stacks > 0) {
    bonuses = [...bonuses, {
      id: current?.id ?? options.newId(),
      stat: 'stacks',
      amount: stacks,
      maxStacks: max,
      source,
      label: options.mark.name,
    }];
  }
  log.push(`${options.attackerName}: «${options.abilityName}» marca ${options.mark.name} ${Math.min(after, max)}/${max}`);
  const bonusDamage = consume && options.mark.damage ? options.mark.damage : 0;
  const status = consume && options.mark.status
    ? { name: options.mark.status, duration: Math.max(1, options.mark.statusTurns ?? 1), source: `${source}:proc` }
    : undefined;
  if (consume) {
    const bits = [`consume ${options.mark.name}`];
    if (bonusDamage) bits.push(`+${bonusDamage} de daño`);
    if (status) bits.push(`${status.name} ${status.duration} t.`);
    log.push(`${options.attackerName}: ${bits.join(' · ')}`);
  }
  return { bonuses, stacks, consumed: consume, bonusDamage, damageType: options.mark.damageType, status, log };
}

export function isInAura(target: Pick<CombatParticipant, 'bonuses'>, bearerId: string, abilityName: string): boolean {
  return (target.bonuses ?? []).some(bonus => bonus.source === auraSource(bearerId, abilityName));
}

export function auraToggleBonus(options: {
  bearerId: string;
  abilityName: string;
  aura: NonNullable<CombatTraits['aura']>;
  newId: string;
}): CombatBonus {
  return {
    id: options.newId,
    stat: options.aura.abSpe != null ? 'abSpe' : 'buff',
    amount: options.aura.abSpe ?? 1,
    source: auraSource(options.bearerId, options.abilityName),
    label: options.aura.label ?? options.abilityName,
  };
}

/** Ajusta las habilidades por turno tras el aura (mínimo configurable, por defecto 1 si había al menos 1). */
export function clampAbilitiesPerTurn(abilities: number | undefined, minAbSpe?: number): number | undefined {
  if (abilities == null) return undefined;
  const min = minAbSpe == null ? 1 : minAbSpe;
  return Math.max(min, abilities);
}

export function actionLimitsFromNpcStats(
  stats: { atkSpe?: number | string; abSpe?: number | string } | undefined,
  extra: Array<{ atkSpe?: number | string; abSpe?: number | string }> = [],
  auraMinAbSpe?: number,
): { attacks?: number; abilities?: number } {
  const num = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return 0;
  };
  let attacks = num(stats?.atkSpe);
  let abilities = num(stats?.abSpe);
  for (const line of extra) {
    attacks += num(line.atkSpe);
    abilities += num(line.abSpe);
  }
  const out: { attacks?: number; abilities?: number } = {};
  if (attacks > 0) out.attacks = Math.floor(attacks);
  if (abilities > 0) {
    const rounded = Math.floor(abilities);
    out.abilities = auraMinAbSpe != null ? clampAbilitiesPerTurn(rounded, auraMinAbSpe) : rounded;
  } else if (auraMinAbSpe != null && abilities !== 0) {
    out.abilities = clampAbilitiesPerTurn(Math.floor(abilities), auraMinAbSpe);
  }
  return out;
}

export function minAuraAbSpeFor(target: Pick<CombatParticipant, 'bonuses'>, abilities: AbilityLike[], bearerId?: string): number | undefined {
  let min: number | undefined;
  for (const bonus of target.bonuses ?? []) {
    if (!(bonus.source ?? '').startsWith(AURA_PREFIX)) continue;
    if (bearerId && !(bonus.source ?? '').startsWith(`${AURA_PREFIX}${bearerId}:`)) {
      // still counts; any aura on this unit
    }
    for (const ability of abilities) {
      const aura = ability.mechanics?.combatTraits?.aura;
      if (!aura) continue;
      if (bonus.source === auraSource((bonus.source ?? '').slice(AURA_PREFIX.length).split(':')[0] ?? '', ability.name) || (bonus.label && bonus.label === (aura.label ?? ability.name))) {
        const value = aura.minAbSpe ?? 1;
        min = min == null ? value : Math.min(min, value);
      }
    }
  }
  // Simpler: if any aura: bonus is present, use the minimum minAbSpe among matching auras, default 1.
  if (min == null && (target.bonuses ?? []).some(bonus => (bonus.source ?? '').startsWith(AURA_PREFIX))) min = 1;
  return min;
}

export function surviveHitBonuses(options: {
  targetId: string;
  targetName: string;
  participants: Array<Pick<CombatParticipant, 'id' | 'name' | 'kind' | 'defeated'> & { abilities?: AbilityLike[] }>;
  existing: CombatBonus[] | undefined;
  newId: () => string;
}): { bonuses: CombatBonus[]; log: string[] } | null {
  const target = options.participants.find(entry => entry.id === options.targetId);
  if (!target) return null;
  let bonuses = [...(options.existing ?? [])];
  const log: string[] = [];
  let changed = false;
  for (const bearer of options.participants) {
    if (bearer.defeated) continue;
    if (bearer.id !== target.id && !isAllyOf(bearer, target) && bearer.id !== target.id) continue;
    for (const { name, traits } of ownedCombatTraits(bearer.abilities)) {
      const buff = traits.tough?.onAllySurvive;
      if (!buff) continue;
      if (bearer.id !== target.id && !traits.tough?.auraAllies) continue;
      const source = surviveBuffSource(bearer.id);
      if (buff.atkSpe) {
        bonuses = upsertBonus(bonuses, statBonus({
          id: options.newId(),
          stat: 'atkSpe',
          amount: buff.atkSpe,
          source: `${source}:atkSpe`.slice(0, 80),
          label: `${name} (sobrevive)`,
        }));
      }
      if (buff.ac) {
        bonuses = upsertBonus(bonuses, statBonus({
          id: options.newId(),
          stat: 'ac',
          amount: buff.ac,
          source: `${source}:ac`.slice(0, 80),
          label: `${name} (sobrevive)`,
        }));
      }
      if (buff.mr) {
        const amount = Math.round(buff.mr * 4) / 4;
        bonuses = upsertBonus(bonuses, statBonus({
          id: options.newId(),
          stat: 'mr',
          amount,
          source: `${source}:mr`.slice(0, 80),
          label: `${name} (sobrevive)`,
        }));
      }
      changed = true;
      const bits: string[] = [];
      if (buff.atkSpe) bits.push(`${formatTraitNum(buff.atkSpe)} ataques`);
      if (buff.ac) bits.push(`${formatTraitNum(buff.ac)} CA`);
      if (buff.mr) bits.push(`${formatTraitNum(Math.round(buff.mr * 4) / 4)} MR`);
      log.push(`${options.targetName} sobrevive un golpe: ${name} de ${bearer.name} → ${bits.join(' / ') || 'sin bonus'}`);
    }
  }
  return changed ? { bonuses, log } : null;
}

export function combatEntryEffects(options: {
  bearerId: string;
  bearerName: string;
  traitsName: string;
  entry: NonNullable<CombatTraits['combatEntry']>;
  participants: Array<Pick<CombatParticipant, 'id' | 'name' | 'kind' | 'defeated'>>;
}): { targetIds: string[]; effect: Omit<CombatEffect, 'id'>; log: string } {
  const applies = options.entry.appliesTo;
  const targets = options.participants.filter(entry => {
    if (entry.defeated) return false;
    if (applies === 'self') return entry.id === options.bearerId;
    if (applies === 'allies') return entry.id === options.bearerId || isAllyOf(entry, { id: options.bearerId, kind: options.participants.find(p => p.id === options.bearerId)?.kind ?? 'npc' });
    return isEnemyOf(entry, { id: options.bearerId, kind: options.participants.find(p => p.id === options.bearerId)?.kind ?? 'npc' });
  });
  const effect = {
    name: options.entry.statusName,
    duration: Math.max(1, options.entry.turns ?? 99),
    source: combatEntrySource(options.bearerId, options.traitsName),
  };
  const who = targets.map(entry => entry.name).join(', ') || 'nadie';
  return {
    targetIds: targets.map(entry => entry.id),
    effect,
    log: `${options.bearerName}: «${options.traitsName}» al entrar → ${options.entry.statusName} a ${who}`,
  };
}

export function toughAuraEffect(name: string, flat: number, bearerId: string, abilityName: string): Omit<CombatEffect, 'id'> {
  return { name, duration: 99, value: flat, source: toughAuraSource(bearerId, abilityName) };
}

export const guardSource = (bearerId: string): string => `${GUARD_PREFIX}${bearerId}`;
export const packTacticsSource = (bearerId: string, abilityName: string): string => `${PACK_PREFIX}${bearerId}:${abilityName}`.slice(0, 80);

/** MR lineal entre max (vida llena) y min (0 PG), en pasos de 0,25. */
export function mrScalesWithHpValue(cfg: { max: number; min: number }, current: number, maxHp: number): number {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, current / maxHp)) : 0;
  const exact = cfg.min + (cfg.max - cfg.min) * ratio;
  return Math.round(exact * 4) / 4;
}

export function mrScalesWithHpOf(abilities: AbilityLike[] | undefined): { max: number; min: number } | undefined {
  for (const { traits } of ownedCombatTraits(abilities)) {
    if (traits.mrScalesWithHp) return traits.mrScalesWithHp;
  }
  return undefined;
}

/** Aplica el MR que escala con la vida sobre una stat ya bonificada. */
export function applyScaledMr(baseMr: number, abilities: AbilityLike[] | undefined, current: number, maxHp: number): number {
  const cfg = mrScalesWithHpOf(abilities);
  const scaled = cfg ? mrScalesWithHpValue(cfg, current, maxHp) : baseMr;
  return Math.round(scaled * 1000) / 1000;
}

/** Daño extra del AA: hpPct % de la vida máxima del atacante (redondeo al entero más cercano). */
export function formidableAaBonus(abilities: AbilityLike[] | undefined, maxHp: number): { amount: number; hpPct: number } | null {
  for (const { traits } of ownedCombatTraits(abilities)) {
    const pct = traits.formidable?.hpPct;
    if (pct && maxHp > 0) {
      const amount = Math.round((pct / 100) * maxHp);
      if (amount > 0) return { amount, hpPct: pct };
    }
  }
  return null;
}

/** Coste de maná extra de las auras que tienen marcado al lanzador (plano y/o % del coste base). */
export function extraManaFromAuras(
  caster: Pick<CombatParticipant, 'id' | 'bonuses'>,
  participants: Array<Pick<CombatParticipant, 'id' | 'defeated'> & { abilities?: AbilityLike[] }>,
  baseCost = 0,
): number {
  let extra = 0;
  for (const bearer of participants) {
    if (bearer.defeated) continue;
    for (const { name, traits } of ownedCombatTraits(bearer.abilities)) {
      const aura = traits.aura;
      if (!aura) continue;
      if (!isInAura(caster, bearer.id, name)) continue;
      if (aura.manaCost) extra += aura.manaCost;
      if (aura.manaCostPct && baseCost > 0) {
        extra += Math.ceil((baseCost * aura.manaCostPct) / 100 - 1e-9);
      }
    }
  }
  return extra;
}

/** % del daño de habilidades que recibe (0 = inmune). Ausente = 100. */
export function abilityDamageTakenPct(abilities: AbilityLike[] | undefined): number {
  for (const { traits } of ownedCombatTraits(abilities)) {
    if (traits.abilityDamageTaken) return Math.max(0, Math.min(100, traits.abilityDamageTaken.pct));
  }
  return 100;
}

export function applyAbilityDamageTaken(amount: number, pct: number): number {
  if (!(amount > 0) || pct >= 100) return amount;
  if (pct <= 0) return 0;
  return Math.max(0, Math.floor(amount * pct / 100));
}

export function guardedById(participant: Pick<CombatParticipant, 'effects'>): string | undefined {
  const effect = (participant.effects ?? []).find(entry => liveEffect(entry) && (entry.source ?? '').startsWith(GUARD_PREFIX));
  if (!effect?.source) return undefined;
  const id = effect.source.slice(GUARD_PREFIX.length).trim();
  return id || undefined;
}

export function guardEffect(bearerId: string, name = 'Custodia', turns = 1): Omit<CombatEffect, 'id'> {
  return { name, duration: Math.max(1, turns), source: guardSource(bearerId) };
}

/**
 * Si el objetivo está bajo Custodia y el guardián sigue en pie, el daño va al guardián.
 * alreadyRedirected evita bucles.
 */
export function redirectDamageTargetId(
  target: Pick<CombatParticipant, 'id' | 'effects' | 'defeated'>,
  participants: Array<Pick<CombatParticipant, 'id' | 'defeated'>>,
  alreadyRedirected = false,
): string {
  if (alreadyRedirected || target.defeated) return target.id;
  const guardId = guardedById(target);
  if (!guardId || guardId === target.id) return target.id;
  const guard = participants.find(entry => entry.id === guardId);
  if (!guard || guard.defeated) return target.id;
  return guard.id;
}

export type AbsorbParticipant = Pick<CombatParticipant, 'id' | 'kind' | 'name' | 'defeated'> & {
  abilities?: AbilityLike[];
  hp?: { current: number; max?: number };
};

export type AbsorbAllyMagicRoll = {
  absorberId: string;
  absorberName: string;
  abilityName: string;
  traitName: string;
  chance: number;
  roll: number;
  success: boolean;
};

/** Probabilidad actual: chancePct (por defecto 50) × vida actual / vida máx., 0–100, redondeada. */
export function absorbAllyMagicChance(cfg: { chancePct?: number } | undefined, current: number, maxHp: number): number {
  if (!cfg || !(maxHp > 0) || current <= 0) return 0;
  const maxChance = cfg.chancePct ?? 50;
  if (!(maxChance > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round(maxChance * Math.min(1, current / maxHp))));
}

/**
 * Tiradas de Absorción arcana ante daño mágico a un aliado.
 * Orden de la lista de participantes; al primer éxito se para (sin doble redirección).
 */
export function rollAbsorbAllyMagic(options: {
  target: Pick<CombatParticipant, 'id' | 'kind' | 'defeated'>;
  damageType?: 'physical' | 'magic' | 'true';
  alreadyRedirected?: boolean;
  participants: AbsorbParticipant[];
  random?: () => number;
}): AbsorbAllyMagicRoll[] {
  const { target, damageType, alreadyRedirected, participants, random = Math.random } = options;
  if (alreadyRedirected || target.defeated || damageType !== 'magic') return [];
  const rolls: AbsorbAllyMagicRoll[] = [];
  for (const entry of participants) {
    if (entry.defeated || !isAllyOf(entry, target)) continue;
    const current = entry.hp?.current ?? 0;
    const maxHp = entry.hp?.max ?? 0;
    if (current <= 0) continue;
    for (const { name, traits } of ownedCombatTraits(entry.abilities)) {
      if (!traits.absorbAllyMagic) continue;
      const chance = absorbAllyMagicChance(traits.absorbAllyMagic, current, maxHp);
      if (chance <= 0) continue;
      const roll = Math.min(100, Math.max(1, Math.floor(random() * 100) + 1));
      const success = roll <= chance;
      rolls.push({
        absorberId: entry.id,
        absorberName: entry.name,
        abilityName: name,
        traitName: traits.absorbAllyMagic.name?.trim() || 'Absorción arcana',
        chance,
        roll,
        success,
      });
      if (success) return rolls;
    }
  }
  return rolls;
}

export function isControlEffectName(name: string): boolean {
  return isTauntName(name) || isSilenceName(name) || isFearName(name) || isCaptureName(name)
    || ['aturdimiento', 'aturdido', 'enraizamiento', 'enraizado', 'ralentizacion', 'ralentizado', 'derribo', 'derribado', 'encantado', 'ceguera', 'empuje', 'empujado', 'stun', 'root', 'slow', 'knockup', 'airborne', 'charm', 'blind'].some(key => fold(name) === key || fold(name).includes(key));
}

export function unstoppableVsLowerHpOf(abilities: AbilityLike[] | undefined): boolean {
  return ownedCombatTraits(abilities).some(entry => !!entry.traits.unstoppableVsLowerHp);
}

/** Bloquea CC / Desafío si el que lo aplica tiene menos vida actual que el objetivo. */
export function blocksControlFrom(
  target: Pick<CombatParticipant, 'id'> & { abilities?: AbilityLike[]; hp?: { current: number } },
  applier: Pick<CombatParticipant, 'id'> & { hp?: { current: number } } | undefined,
): boolean {
  if (!applier || applier.id === target.id) return false;
  if (!unstoppableVsLowerHpOf(target.abilities)) return false;
  const targetHp = target.hp?.current;
  const applierHp = applier.hp?.current;
  if (targetHp == null || applierHp == null) return false;
  return applierHp < targetHp;
}

export function packTacticsHitBonus(bonuses: CombatBonus[] | undefined): number {
  return (bonuses ?? []).filter(bonus => bonus.stat === HIT_STAT).reduce((sum, bonus) => sum + (bonus.amount ?? 0) * (bonus.stacks ?? 1), 0);
}

export function packTacticsToggleBonus(options: { bearerId: string; abilityName: string; hitBonus: number; label?: string; newId: string }): CombatBonus {
  return {
    id: options.newId,
    stat: HIT_STAT,
    amount: options.hitBonus,
    source: packTacticsSource(options.bearerId, options.abilityName),
    label: options.label ?? 'Táctica de manada',
  };
}

export function isPackTacticsOn(bonuses: CombatBonus[] | undefined, bearerId: string, abilityName: string): boolean {
  const source = packTacticsSource(bearerId, abilityName);
  return (bonuses ?? []).some(bonus => bonus.source === source);
}

export function sourceBearerId(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const prefixes = [TAUNT_PREFIX, CAPTURE_PREFIX, GUARD_PREFIX, START_PREFIX, ENTRY_PREFIX, PACK_PREFIX, ONCE_ENEMY_ULT_PREFIX];
  for (const prefix of prefixes) {
    if (source.startsWith(prefix)) {
      const rest = source.slice(prefix.length);
      const id = rest.split(':')[0]?.trim();
      return id || undefined;
    }
  }
  return undefined;
}


export function describeCombatTraits(traits: CombatTraits | undefined): string[] {
  if (!traits) return [];
  const out: string[] = [];
  if (traits.capture) out.push(`Captura («${traits.capture.name ?? 'Detener'}»): el objetivo sale del combate hasta que muera el captor.`);
  if (traits.combatStart) out.push(`Al empezar el combate: ${traits.combatStart.statusName} ${traits.combatStart.turns} t. a ${traits.combatStart.count ?? 1} enemigo(s)${traits.combatStart.pick === 'enemy' ? ' (elegir)' : ''}.`);
  if (traits.combatEntry) out.push(`Al entrar en combate: ${traits.combatEntry.statusName} a ${traits.combatEntry.appliesTo === 'allies' ? 'aliados' : traits.combatEntry.appliesTo === 'enemies' ? 'enemigos' : 'uno mismo'}${traits.combatEntry.turns ? ` ${traits.combatEntry.turns} t.` : ''}.`);
  if (traits.tough) {
    const bits = [`Duro: −${traits.tough.flat} de daño por golpe`];
    if (traits.tough.auraAllies) bits.push('los aliados también son Duros');
    if (traits.tough.onAllySurvive) {
      const survive = traits.tough.onAllySurvive;
      const gain: string[] = [];
      if (survive.atkSpe) gain.push(`${formatTraitNum(survive.atkSpe)} ataques`);
      if (survive.ac) gain.push(`${formatTraitNum(survive.ac)} CA`);
      if (survive.mr) gain.push(`${formatTraitNum(survive.mr)} MR`);
      bits.push(`un aliado que sobrevive un golpe gana ${gain.join(' / ') || 'un bonus'} el resto del combate`);
    }
    out.push(`${bits.join('; ')}.`);
  }
  if (traits.aura) {
    const bits = [`radio ${traits.aura.range}`, `interruptor «${traits.aura.label ?? 'En el aura'}»`];
    if (traits.aura.abSpe) bits.push(`${traits.aura.abSpe} habilidades/turno (mín. ${traits.aura.minAbSpe ?? 1})`);
    if (traits.aura.manaCost) bits.push(`las habilidades cuestan +${traits.aura.manaCost} de maná`);
    if (traits.aura.manaCostPct) bits.push(`las habilidades cuestan un ${String(traits.aura.manaCostPct).replace('.', ',')} % más de maná`);
    out.push(`Aura (${bits.join(', ')}).`);
  }
  if (traits.absorbAllyMagic) {
    const pct = traits.absorbAllyMagic.chancePct ?? 50;
    const name = traits.absorbAllyMagic.name?.trim() || 'Absorción arcana';
    out.push(`${name}: si un aliado recibe daño mágico, un ${String(pct).replace('.', ',')} % × (vida actual / vida máx.) de redirigirlo a este (RM actual del portador; automático).`);
  }
  if (traits.deathNotice) out.push(`Al morir: aviso «${traits.deathNotice.text}».`);
  if (traits.challenge) out.push(`Desafío/Provocación: aplica ${traits.challenge.statusName ?? 'Desafío'}${traits.challenge.turns ? ` ${traits.challenge.turns} t.` : ''} y obliga a atacar al retador.`);
  if (traits.aaMark) {
    const mark = traits.aaMark;
    const consume = mark.consume === false ? 'al llegar al máximo no se consume' : `al llegar a ${mark.max} se consume`;
    const bits = [`cada AA aplica ${mark.name} (${consume})`];
    if (mark.damage) bits.push(`+${mark.damage} de daño`);
    if (mark.status) bits.push(`${mark.status} ${mark.statusTurns ?? 1} t.`);
    out.push(`Marcas de AA: ${bits.join(' · ')}.`);
  }
  if (traits.onEnemyUltimate) {
    const cfg = traits.onEnemyUltimate;
    const bits: string[] = [];
    if (cfg.atkSpe) bits.push(`${cfg.atkSpe > 0 ? '+' : ''}${cfg.atkSpe} ataques`);
    if (cfg.ac) bits.push(`${cfg.ac > 0 ? '+' : ''}${cfg.ac} CA`);
    if (cfg.mr) bits.push(`${formatTraitNum(cfg.mr)} MR`);
    if (cfg.taunt) bits.push(`${cfg.tauntName ?? 'Desafío'} al que usó la R`);
    if (cfg.grantCharges) bits.push(`+${cfg.grantCharges} carga(s) de «${cfg.grantChargeTo ?? 'esta habilidad'}»`);
    out.push(`Cuando un enemigo usa su R${cfg.oncePerCombat ? ' (1 vez por combate)' : ''}: ${bits.join(', ') || 'se dispara'}.`);
  }
  if (traits.mrScalesWithHp) out.push(`MR de petricita: ${formatTraitNum(traits.mrScalesWithHp.max).replace('+','')} llena, baja hasta ${formatTraitNum(traits.mrScalesWithHp.min).replace('+','')} según la vida actual.`);
  if (traits.formidable) out.push(`Formidable: el AA suma un ${String(traits.formidable.hpPct).replace('.', ',')}% de la vida máxima.`);
  if (traits.abilityDamageTaken) out.push(traits.abilityDamageTaken.pct <= 0 ? 'Inmune al daño de habilidades (el AA y los objetos sí entran).' : `Recibe un ${traits.abilityDamageTaken.pct}% del daño de habilidades (el AA y los objetos sí entran).`);
  if (traits.guardAlly) out.push(`Custodia: el daño que reciba el aliado marcado este turno se redirige al portador (${traits.guardAlly.name ?? 'Custodia'} ${traits.guardAlly.turns} t.).`);
  if (traits.onAllyJoin) out.push(`Cuando un aliado entra en combate: ${traits.onAllyJoin.challenge ? (traits.onAllyJoin.statusName ?? 'Desafío') : (traits.onAllyJoin.statusName ?? 'efecto')}${traits.onAllyJoin.pick === 'enemy' ? ' a un enemigo (elegir)' : ''}${traits.onAllyJoin.turns ? ` ${traits.onAllyJoin.turns} t.` : ''}.`);
  if (traits.packTactics) out.push(`Táctica de manada (interruptor «${traits.packTactics.label ?? 'Aliado adyacente'}»): ${formatTraitNum(traits.packTactics.hitBonus)} al impacto.`);
  if (traits.unstoppableVsLowerHp) out.push(`${traits.unstoppableVsLowerHp.name ?? 'Inexpugnable'}: inmune a controles y Desafío de enemigos con menos vida actual.`);
  if (traits.trueSight) out.push(`${traits.trueSight.label ?? 'Vista verdadera'} (alcance ${traits.trueSight.range}, distancia a mano): no se le escapa lo invisible ni lo oculto.`);
  return out;
}

/** Permite AD/AP de NPC como número o dados ("3d4", "4d4+2"). */
export const NPC_DICE_STAT = /^(?:[+-]?\d+d\d+|[+-]?\d+)(?:[+-]\d+d\d+|[+-]\d+)*$/i;

export function parseNpcStatValue(raw: unknown, field: string): number | string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const text = raw.trim().replace(/\s+/g, '');
    if (!text) return undefined;
    if (NPC_DICE_STAT.test(text)) {
      if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
      return text;
    }
    throw new Error(`${field} tiene que ser un número o dados (p. ej. 3d4 o 4d4+2)`);
  }
  throw new Error(`${field} tiene que ser un número o dados (p. ej. 3d4 o 4d4+2)`);
}
