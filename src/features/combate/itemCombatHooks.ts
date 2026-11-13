import { logCombat } from './combatConsole';
import type { CombatBonus, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { participantChampion } from '../../data/combatSheet';
import { PLAYERS } from '../../data/players';
import type { NamedEffectData } from '../../data/namedEffectDescriptions';
import { equippedItems } from './combatBonuses';
import { abilityBreakSource, rankValue } from '../../data/abilityMechanics';
import { activeNamedEffects, fireEffectRules, participantContext, type EffectCallbacks, type EffectTriggerName } from './effectRules';
import { participantAbilities } from './abilityRules';
import { participantHp, type TargetDamage } from './combatHp';
import type { Item } from '../../data/items';
import { newBonusId } from './combatBonuses';

/** Ítems equipados del participante (player, campeón o ficha). */
export function participantItems(participant: CombatParticipant): Item[] {
  if (participant.kind === 'player') {
    const player = PLAYERS.find(entry => entry.name === (participant.sourceId ?? participant.name));
    return equippedItems(player?.equipamiento);
  }
  const champion = participantChampion(participant);
  if (champion?.equipamiento?.length) return equippedItems(champion.equipamiento);
  const sheet = (participant as CombatParticipant & { sheet?: { equipamiento?: string[] } }).sheet;
  return equippedItems(sheet?.equipamiento);
}

const fold = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const IMMOBILIZE_KEYS = [
  'aturdimiento', 'lanzado al aire', 'lanzado por los aires', 'levantado', 'enraizamiento',
  'encantado', 'encanto', 'miedo', 'provocacion', 'supresion',
  'stun', 'root', 'charm', 'fear', 'taunt', 'suppression', 'airborne', 'knock up', 'knockup',
  'inmovilizacion', 'inmovilizado', 'inmovil',
];

/** El objetivo está inmovilizado (CC que impide moverse) o marcado por Mandato. */
export function isImmobilized(participant: CombatParticipant): boolean {
  for (const effect of participant.effects ?? []) {
    if ((effect.duration ?? 0) <= 0) continue;
    const name = fold(effect.name ?? '');
    if (name.includes('mandato')) return true;
    if (IMMOBILIZE_KEYS.some(key => name === key || name.includes(key))) return true;
  }
  return false;
}

/** % de reducción de curación si el objetivo tiene Heridas graves (el valor del efecto, o 40 % si no hay). */
export function grievousCutPct(participant: CombatParticipant): number {
  for (const effect of participant.effects ?? []) {
    if (fold(effect.name ?? '').includes('heridas graves')) {
      const value = typeof effect.value === 'number' && Number.isFinite(effect.value) ? effect.value : 40;
      return Math.max(0, Math.min(100, value));
    }
  }
  for (const bonus of participant.bonuses ?? []) {
    if (fold(bonus.label ?? '').includes('heridas graves')) {
      const value = typeof bonus.amount === 'number' && bonus.amount > 0 && bonus.amount <= 100 ? bonus.amount : 40;
      return Math.max(0, Math.min(100, value));
    }
  }
  return 0;
}

/** Suma la reducción de daño de las reglas de los ítems (plating: 10% de AA, etc.). */
export function incomingDamageReductionPct(participant: CombatParticipant, data: NamedEffectData, vs: 'aa' | 'all'): number {
  let total = 0;
  for (const effect of activeNamedEffects(participantItems(participant), data)) {
    for (const rule of effect.config.rules) {
      if (rule.kind !== 'damage-reduction') continue;
      const against = rule.vs ?? 'all';
      if (against !== 'all' && against !== vs) continue;
      const amount = typeof rule.flat === 'number' ? rule.flat : 0;
      if (amount) total += amount;
    }
  }
  return Math.max(0, Math.min(100, total));
}

/** % de daño extra (Mandato) si el objetivo está inmovilizado o marcado. */
export function itemDamageAmpPct(target: CombatParticipant, data: NamedEffectData, attacker?: CombatParticipant): number {
  if (!isImmobilized(target)) return 0;
  let amp = 0;
  if (attacker) {
    for (const effect of activeNamedEffects(participantItems(attacker), data)) {
      for (const rule of effect.config.rules) {
        if (rule.damageAmpPct) amp = Math.max(amp, rule.damageAmpPct);
      }
    }
  }
  if (!amp) {
    for (const effect of target.effects ?? []) {
      if ((effect.duration ?? 0) > 0 && fold(effect.name ?? '').includes('mandato')) {
        const value = typeof effect.value === 'number' && Number.isFinite(effect.value) ? effect.value : 7;
        amp = Math.max(amp, value);
      }
    }
  }
  return amp;
}

/** El atacante tiene Llamasombría (crít. de daño mágico/verdadero a esta potencia bajo el umbral de vida). */
export function cinderbloomCrit(
  attacker: CombatParticipant | undefined,
  target: CombatParticipant,
  data: NamedEffectData,
  damageType: 'physical' | 'magic' | 'true' | undefined,
  critical: boolean,
  critMult: number,
): { apply: boolean; potency: number; factor: number; threshold: number } {
  const none = { apply: false, potency: 0, factor: 1, threshold: 40 };
  if (!critical || !attacker || (damageType !== 'magic' && damageType !== 'true')) return none;
  let potency = 0;
  let threshold = 40;
  for (const effect of activeNamedEffects(participantItems(attacker), data)) {
    for (const rule of effect.config.rules) {
      if (rule.critPotencyPct) {
        potency = Math.max(potency, rule.critPotencyPct);
        if (rule.targetHpBelowPct != null) threshold = rule.targetHpBelowPct;
      }
    }
  }
  if (!potency) return none;
  const hp = participantHp(target);
  const pct = hp && hp.max ? (hp.current / hp.max) * 100 : 100;
  const marked = (target.effects ?? []).some(effect => (effect.duration ?? 0) > 0 && fold(effect.name ?? '').includes('llamasombria'));
  if (pct > threshold && !marked) return { ...none, potency, threshold };
  return { apply: true, potency, factor: 1 + (Math.max(1, critMult) - 1) * (potency / 100), threshold };
}

export function hasCinderbloom(participant: CombatParticipant, data: NamedEffectData): boolean {
  return activeNamedEffects(participantItems(participant), data).some(effect => effect.config.rules.some(rule => !!rule.critPotencyPct));
}

export type ReactiveHooks = {
  level: number;
  effectData: NamedEffectData;
  callbacks: EffectCallbacks;
  participants: CombatParticipant[];
};

/** Dispara reglas reactivas (al recibir daño, vida baja, cada turno, al recibir un AA) del portador. */
export async function fireReactiveItemEffects(
  trigger: Extract<EffectTriggerName, 'each-turn' | 'hp-below' | 'on-damage-taken' | 'on-attacked' | 'on-ultimate-use'>,
  bearer: CombatParticipant,
  hooks: ReactiveHooks,
  targetIds: string[] = [],
  incomingDamage = 0,
): Promise<CombatBonus[] | undefined> {
  const items = participantItems(bearer);
  const effects = activeNamedEffects(items, hooks.effectData).filter(effect => effect.config.rules.some(rule => rule.trigger === trigger));
  if (!effects.length) return undefined;
  const base = participantContext(bearer, hooks.level);
  if (!base) return undefined;
  const result = await fireEffectRules({
    trigger,
    effects,
    ctx: base.ctx,
    bonuses: bearer.bonuses,
    targetIds,
    participants: hooks.participants,
    level: hooks.level,
    callbacks: hooks.callbacks,
    bearer: { id: bearer.id, name: bearer.name },
    incomingDamage,
  });
  if (result.log.length || result.notes.length || result.manual.length) {
    logCombat({
      title: trigger === 'each-turn' ? `Pasivas de turno · ${bearer.name}` : trigger === 'on-ultimate-use' ? `R · ${bearer.name}` : `Ítems · ${bearer.name}`,
      actor: bearer.name,
      lines: [...result.log, ...result.manual.map(text => `${text} (a mano)`)],
    });
  }
  return result.changed ? result.bonuses : undefined;
}

/** Tras aplicar daño: reacciona el herido (pérdida de vida / umbral / AA recibido). */
export async function afterDamageTaken(
  target: CombatParticipant,
  damage: TargetDamage,
  amount: number,
  hooks: ReactiveHooks,
  opts?: { fromAutoAttack?: boolean },
): Promise<CombatBonus[] | undefined> {
  void damage;
  let bonuses = await fireReactiveItemEffects('on-damage-taken', target, hooks, [], amount);
  const current = { ...target, bonuses: bonuses ?? target.bonuses };
  if (opts?.fromAutoAttack) {
    const moreAa = await fireReactiveItemEffects('on-attacked', current, hooks, [], amount);
    if (moreAa) {
      bonuses = moreAa;
      current.bonuses = moreAa;
    }
  }
  const more = await fireReactiveItemEffects('hp-below', current, hooks, [], amount);
  if (more) bonuses = more;
  return bonuses;
}

/** Cura el % del maná gastado (Vara de las edades). */
export async function healFromManaSpent(bearer: CombatParticipant, spent: number, hooks: ReactiveHooks): Promise<void> {
  if (!(spent > 0)) return;
  let raw = 0;
  for (const effect of activeNamedEffects(participantItems(bearer), hooks.effectData)) {
    for (const rule of effect.config.rules) {
      if (rule.fromManaSpentPct) raw += spent * rule.fromManaSpentPct / 100;
    }
  }
  const amount = Math.floor(raw);
  if (!(amount > 0)) return;
  const undo = hooks.callbacks.onSelfPool ? await hooks.callbacks.onSelfPool('heal', amount) : null;
  logCombat({
    title: `Eternidad · ${bearer.name}`,
    actor: bearer.name,
    lines: [`Cura el ${fmtPct(raw * 100 / spent)}% de ${spent} maná gastado → ${amount} PV${undo ? '' : ' (a mano / vida al máximo)'}`],
  });
}

const fmtPct = (value: number): string => String(Math.round(value * 10) / 10);

export const ITEM_SPELL_SHIELD_PREFIX = 'item-spellshield:';

function setCdMarker(bonuses: CombatBonus[], source: string, turns: number, label: string): CombatBonus[] {
  const rest = bonuses.filter(bonus => bonus.source !== source);
  return [...rest, { id: newBonusId(), stat: 'cooldown', amount: 1, turns: Math.max(1, Math.min(99, Math.round(turns))), source, label }];
}

/**
 * Si el objetivo tiene un escudo de hechizos (ítem o habilidad), lo rompe y bloquea esta habilidad contra él.
 * El CD de Barrera frondosa usa el CD guardado en la ficha del ítem (30).
 */
export async function consumeSpellShields(options: {
  targetIds: string[];
  participants: CombatParticipant[];
  effectData: NamedEffectData;
  level: number;
  applyEffect: (ids: string[], input: SourcedEffectInput) => void | Promise<void>;
  saveBonuses: (targetId: string, bonuses: CombatBonus[]) => Promise<void>;
}): Promise<{ blockedIds: string[]; lines: string[] }> {
  const blockedIds: string[] = [];
  const lines: string[] = [];
  for (const id of options.targetIds) {
    const target = options.participants.find(entry => entry.id === id);
    if (!target) continue;
    const itemShield = (target.effects ?? []).find(effect => (effect.source ?? '').startsWith(ITEM_SPELL_SHIELD_PREFIX) && (effect.duration ?? 0) > 0);
    if (itemShield) {
      const base = (itemShield.source ?? '').slice(ITEM_SPELL_SHIELD_PREFIX.length);
      await options.applyEffect([id], { source: itemShield.source ?? '', name: itemShield.name, duration: 1, restore: { [id]: null } });
      const itemEffect = activeNamedEffects(participantItems(target), options.effectData).find(effect => effect.base === base || effect.id === base);
      const turns = itemEffect?.itemCooldown ?? itemEffect?.config.cooldown ?? 30;
      const next = setCdMarker(target.bonuses ?? [], `cd:${base}`, turns, `${itemEffect?.name ?? 'Escudo de hechizos'} (roto)`);
      await options.saveBonuses(id, next);
      blockedIds.push(id);
      lines.push(`${target.name}: «${itemShield.name}» bloquea la habilidad · CD ${turns} t.`);
      continue;
    }
    const owned = participantAbilities(target, options.level).find(row => {
      const shield = row.ability.mechanics?.spellShield;
      if (!shield) return false;
      return (target.effects ?? []).some(effect => effect.source === `ability:${row.name}` && (effect.duration ?? 0) > 0);
    });
    if (!owned?.ability.mechanics?.spellShield) continue;
    const shield = owned.ability.mechanics.spellShield;
    const effect = (target.effects ?? []).find(entry => entry.source === `ability:${owned.name}` && (entry.duration ?? 0) > 0);
    if (!effect) continue;
    await options.applyEffect([id], { source: `ability:${owned.name}`, name: effect.name, duration: 1, restore: { [id]: null } });
    const breakSource = abilityBreakSource(owned.name);
    const extra: CombatBonus[] = [];
    for (const stat of owned.ability.mechanics.learnedStats ?? []) {
      const base = rankValue(stat.values, owned.rank) ?? 0;
      const amount = Math.round(base * (shield.learnedMultiplier - 1) * 1000) / 1000;
      if (!amount) continue;
      extra.push({
        id: newBonusId(),
        stat: stat.stat as CombatBonus['stat'],
        amount,
        turns: shield.breakTurns,
        source: `${breakSource}:${stat.stat}`.slice(0, 80),
        label: `${owned.name} (escudo roto)`.slice(0, 80),
      });
    }
    if (extra.length) {
      const kept = (target.bonuses ?? []).filter(bonus => !(bonus.source ?? '').startsWith(breakSource));
      await options.saveBonuses(id, [...kept, ...extra].slice(-30));
    }
    blockedIds.push(id);
    lines.push(`${target.name}: «${shield.status}» (${owned.seal} «${owned.name}») bloquea la habilidad y se rompe`);
  }
  return { blockedIds, lines };
}

export function expiredPendingByPrefix(before: CombatBonus[] | undefined, after: CombatBonus[] | undefined, prefix: string): CombatBonus[] {
  return (before ?? []).filter(old => old.stat === 'buff' && (old.source ?? '').startsWith(prefix) && !(after ?? []).some(bonus => bonus.source === old.source));
}

/** Daño de ítem retrasado (Redención): al empezar el turno del lanzador, golpea a los marcados. */
export async function firePendingItemDamage(
  casterId: string,
  expired: CombatBonus[],
  damageFn: (targetId: string, amount: number) => Promise<unknown>,
): Promise<void> {
  const lines: string[] = [];
  for (const marker of expired) {
    const source = marker.source ?? '';
    const targetId = source.split(':').pop();
    if (!targetId) continue;
    await damageFn(targetId, marker.amount);
    lines.push(`${marker.label ?? targetId}: ${marker.amount} de daño (retraso cumplido)`);
  }
  if (lines.length) logCombat({ title: 'Daño retrasado de ítem', actor: '', lines });
}

/** El escudo del Medallón baja a la mitad de lo concedido al pasar los turnos. */
export async function firePendingHalfShields(
  participantId: string,
  expired: CombatBonus[],
  reduceShield: (id: string, amount: number) => Promise<boolean>,
  saveBonuses: (id: string, bonuses: CombatBonus[]) => Promise<void>,
  currentBonuses: () => CombatBonus[],
): Promise<void> {
  const lines: string[] = [];
  for (const marker of expired) {
    const ok = await reduceShield(participantId, marker.amount);
    lines.push(`Escudo −${marker.amount}${ok ? '' : ' (no quedaba tanto)'}`);
    await saveBonuses(participantId, currentBonuses().filter(bonus => bonus.source !== marker.source));
  }
  if (lines.length) logCombat({ title: 'Medallón: el escudo baja a la mitad', actor: '', lines });
}
