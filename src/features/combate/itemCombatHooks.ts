import { logCombat } from './combatConsole';
import type { CombatBonus, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { participantChampion } from '../../data/combatSheet';
import { PLAYERS } from '../../data/players';
import type { NamedEffectData } from '../../data/namedEffectDescriptions';
import { equippedItems } from './combatBonuses';
import { abilityBreakSource, rankValue } from '../../data/abilityMechanics';
import { activeNamedEffects, fireEffectRules, participantContext, VULNERABLE_PREFIX, poolAmount, rangedFactor, rangedNote, ruleAmount, type EffectCallbacks, type EffectTriggerName } from './effectRules';
import type { ResultChip } from './combatResult';
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

/** Inmovilizaciones del LoL (aturdir, enraizar, lanzar / empujar, suprimir, dormir, encantar, asustar, provocar, estasis); no ralentizar / silenciar / cegar. */
const IMMOBILIZE_EXTRA = ['aturdid', 'enraizad', 'suprimid', 'dormid', 'sueno', 'sleep', 'asustad', 'aterrad', 'huida', 'flee', 'provocad', 'encantad', 'derribad', 'lanzad', 'empujad', 'empuje', 'suspendid', 'suspension', 'estasis', 'stasis', 'berserk', 'snare', 'knockback'];
export function isImmobilizingEffectName(name: string): boolean {
  const folded = fold(name);
  if (folded.includes('ralent') || folded.includes('slow')) return false;
  return IMMOBILIZE_KEYS.some(key => folded.includes(key)) || IMMOBILIZE_EXTRA.some(key => folded.includes(key));
}

/** % de Vulnerable del objetivo (estados de reglas «Vulnerable» activos; distintos efectos se suman, el mismo se renueva). */
export function vulnerablePct(participant: CombatParticipant): number {
  let total = 0;
  for (const effect of participant.effects ?? []) {
    if ((effect.duration ?? 0) <= 0 || !(effect.source ?? '').startsWith(VULNERABLE_PREFIX)) continue;
    if (typeof effect.value === 'number' && Number.isFinite(effect.value) && effect.value > 0) total += effect.value;
  }
  return Math.min(500, total);
}

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

/**
 * Reglas «Amplifica el daño» del atacante que valen para este golpe (Llamasombría): tipo de daño marcado y vida del
 * objetivo ANTES del golpe por debajo del umbral. Una por efecto con nombre (pasiva única). pct = % extra.
 */
export function damageAmpRules(
  attacker: CombatParticipant,
  target: CombatParticipant,
  data: NamedEffectData,
  damageType: 'physical' | 'magic' | 'true',
  level: number,
): { name: string; pct: number; why: string }[] {
  const context = participantContext(attacker, level);
  const effects = [...activeNamedEffects(participantItems(attacker), data), ...(context?.abilityEffects ?? [])];
  const hp = participantHp(target);
  const hpPct = hp && typeof hp.max === 'number' && hp.max > 0 ? (hp.current / hp.max) * 100 : 100;
  const out: { name: string; pct: number; why: string }[] = [];
  const seen = new Set<string>();
  for (const effect of effects) {
    if (seen.has(effect.base)) continue;
    for (const rule of effect.config.rules) {
      if (rule.kind !== 'damage-amp') continue;
      if (rule.damageTypes?.length && !rule.damageTypes.includes(damageType)) continue;
      if (rule.targetHpBelowPct != null && !(hpPct < rule.targetHpBelowPct)) continue;
      const pct = context ? ruleAmount(rule, context.ctx) : (rule.flat ?? 0);
      if (!(pct > 0)) continue;
      seen.add(effect.base);
      out.push({ name: effect.name, pct, why: rule.targetHpBelowPct != null ? `vida ${Math.round(hpPct)}% < ${rule.targetHpBelowPct}%` : 'siempre' });
      break;
    }
  }
  return out;
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
  trigger: Extract<EffectTriggerName, 'each-turn' | 'hp-below' | 'on-damage-taken' | 'on-attacked' | 'on-ultimate-use' | 'on-enemy-ultimate-use' | 'combat-start' | 'combat-entry' | 'when-ready' | 'on-survived-hit' | 'on-death'>,
  bearer: CombatParticipant,
  hooks: ReactiveHooks,
  targetIds: string[] = [],
  incomingDamage = 0,
): Promise<CombatBonus[] | undefined> {
  const items = participantItems(bearer);
  const baseCtx = participantContext(bearer, hooks.level);
  const itemEffects = activeNamedEffects(items, hooks.effectData);
  const effects = [...itemEffects, ...(baseCtx?.abilityEffects ?? [])].filter(effect => effect.config.rules.some(rule => rule.trigger === trigger));
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

/** Disparador "Al infligir daño ..." según el tipo de daño hecho. */
const DEAL_TRIGGER = { physical: 'on-deal-physical', magic: 'on-deal-magic', true: 'on-deal-true' } as const;
const DEAL_LABEL = { physical: 'físico', magic: 'mágico', true: 'verdadero' } as const;

/**
 * Tras hacer daño con tipo conocido: reacciona el ATACANTE (reglas "Al infligir daño físico / mágico / verdadero"
 * de sus ítems y habilidades). El "% daño" de la regla usa el daño infligido. Devuelve bonus nuevos y el deshacer.
 */
export async function fireDealtDamageEffects(
  attacker: CombatParticipant,
  damageType: 'physical' | 'magic' | 'true',
  targetId: string,
  dealt: number,
  hooks: ReactiveHooks,
  /** stackOnly: da\u00f1o de reglas de \u00edtems (fromRule): solo \u00abAl infligir da\u00f1o o aplicar control\u00bb. */
  opts?: { stackOnly?: boolean },
): Promise<{ bonuses?: CombatBonus[]; undo?: () => Promise<void> }> {
  const typed = DEAL_TRIGGER[damageType];
  if (!typed || !(dealt > 0)) return {};
  const base = participantContext(attacker, hooks.level);
  if (!base) return {};
  const all = [...activeNamedEffects(participantItems(attacker), hooks.effectData), ...base.abilityEffects];
  let bonuses = attacker.bonuses;
  let changed = false;
  const undos: (() => Promise<void>)[] = [];
  // Una vez por instancia de daño: primero «Al infligir daño <tipo>» y luego «Al infligir daño» (cualquier tipo).
  const dealTriggers: ('on-deal-physical' | 'on-deal-magic' | 'on-deal-true' | 'on-deal-any' | 'on-deal-or-cc')[] = opts?.stackOnly ? ['on-deal-or-cc'] : [typed, 'on-deal-any', 'on-deal-or-cc'];
  for (const trigger of dealTriggers) {
    const effects = all.filter(effect => effect.config.rules.some(rule => rule.trigger === trigger));
    if (!effects.length) continue;
    const result = await fireEffectRules({
      trigger,
      effects,
      ctx: { ...base.ctx, dealt },
      bonuses,
      targetIds: [targetId],
      participants: hooks.participants,
      level: hooks.level,
      callbacks: hooks.callbacks,
      bearer: { id: attacker.id, name: attacker.name },
      incomingDamage: dealt,
    });
    if (result.changed) { bonuses = result.bonuses; changed = true; }
    undos.push(...result.undos);
    const lines = result.log.map(line => line.replace(/ recibido\b/g, ' infligido'));
    if (lines.length) logCombat({ title: trigger === 'on-deal-or-cc' ? `Al infligir da\u00f1o o aplicar control \u2014 ${attacker.name}` : `Al infligir daño${trigger === 'on-deal-any' ? '' : ` ${DEAL_LABEL[damageType]}`} — ${attacker.name}`, actor: attacker.name, lines });
  }
  return {
    ...(changed && bonuses ? { bonuses } : {}),
    ...(undos.length ? { undo: async () => { for (const undo of undos.reverse()) await undo(); } } : {}),
  };
}

/**
 * Tras aplicar un control (estado de CC) a enemigos: reglas «Al aplicar control» del portador (\u00edtems y habilidades).
 * targetIds = los controlados. immobilizing: el control inmoviliza (para «Solo inmovilizaciones»).
 */
export async function fireCcEffects(
  bearer: CombatParticipant,
  targetIds: string[],
  immobilizing: boolean,
  ccName: string,
  hooks: ReactiveHooks,
): Promise<{ bonuses?: CombatBonus[]; undo?: () => Promise<void> }> {
  if (!targetIds.length) return {};
  const base = participantContext(bearer, hooks.level);
  if (!base) return {};
  const all = [...activeNamedEffects(participantItems(bearer), hooks.effectData), ...base.abilityEffects];
  const ccSlow = !immobilizing && (fold(ccName).includes('ralent') || fold(ccName).includes('slow'));
  const effects = all.filter(effect => effect.config.rules.some(rule => rule.trigger === 'on-cc' && (immobilizing || !rule.ccImmobilizeOnly || (!!rule.ccSlowIfMelee && ccSlow && base.ctx.melee === true))));
  // \u00abAl infligir da\u00f1o o aplicar control\u00bb (Eclipse): aplicar un control tambi\u00e9n cuenta.
  const stackEffects = all.filter(effect => effect.config.rules.some(rule => rule.trigger === 'on-deal-or-cc'));
  if (!effects.length && !stackEffects.length) return {};
  let bonuses = bearer.bonuses;
  let changed = false;
  const undos: (() => Promise<void>)[] = [];
  if (effects.length) {
    const result = await fireEffectRules({
      trigger: 'on-cc',
      effects,
      ctx: base.ctx,
      bonuses,
      targetIds,
      participants: hooks.participants,
      level: hooks.level,
      callbacks: hooks.callbacks,
      bearer: { id: bearer.id, name: bearer.name },
      ccImmobilizing: immobilizing,
      ccSlow,
    });
    if (result.changed) { bonuses = result.bonuses; changed = true; }
    undos.push(...result.undos);
    if (result.log.length) logCombat({ title: `Al aplicar control (${ccName}) \u2014 ${bearer.name}`, actor: bearer.name, lines: result.log });
  }
  if (stackEffects.length) {
    const result = await fireEffectRules({
      trigger: 'on-deal-or-cc',
      effects: stackEffects,
      ctx: base.ctx,
      bonuses,
      targetIds,
      participants: hooks.participants,
      level: hooks.level,
      callbacks: hooks.callbacks,
      bearer: { id: bearer.id, name: bearer.name },
    });
    if (result.changed) { bonuses = result.bonuses; changed = true; }
    undos.push(...result.undos);
    if (result.log.length) logCombat({ title: `Al infligir da\u00f1o o aplicar control (${ccName}) \u2014 ${bearer.name}`, actor: bearer.name, lines: result.log });
  }
  return {
    ...(changed && bonuses ? { bonuses } : {}),
    ...(undos.length ? { undo: async () => { for (const undo of [...undos].reverse()) await undo(); } } : {}),
  };
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

/**
 * Eternidad (Catalizador de eones / Vara de las edades): al usar una habilidad, cura al portador el % del coste gastado
 * (cualquier recurso de la barra: maná, energía...; no el coste en vida). Redondeo como el resto de curas (al más cercano,
 * con poder de curación y escudos); la vida no pasa del máximo. Devuelve la línea / chip / deshacer para el resultado de la habilidad.
 */
export async function healFromManaSpent(
  bearer: CombatParticipant,
  spent: number,
  hooks: ReactiveHooks,
  resourceLabel = 'maná',
): Promise<{ amount: number; line: string; chip: ResultChip; undo?: () => Promise<void> } | null> {
  if (!(spent > 0)) return null;
  const ctx = participantContext(bearer, hooks.level)?.ctx;
  let raw = 0;
  let pct = 0;
  let item = '';
  let note = '';
  for (const effect of activeNamedEffects(participantItems(bearer), hooks.effectData)) {
    for (const rule of effect.config.rules) {
      // Regla "Al usar una habilidad" (o la antigua "Al usar") de curacion con % del coste.
      if (!rule.fromManaSpentPct || rule.kind !== 'heal') continue;
      raw += spent * rule.fromManaSpentPct / 100 * rangedFactor(rule, ctx);
      note = note || rangedNote(rule, ctx);
      pct += rule.fromManaSpentPct;
      item = item || effect.item;
    }
  }
  if (!(raw > 0)) return null;
  const final = ctx ? poolAmount(raw, ctx) : { amount: Math.round(raw), text: fmtPct(raw) };
  if (!(final.amount > 0)) return null;
  const undo = hooks.callbacks.onSelfPool ? await hooks.callbacks.onSelfPool('heal', final.amount) : null;
  const line = `Eternidad (${item}): +${final.amount} vida (${fmtPct(pct)}% de coste ${spent} ${resourceLabel}${note} = ${final.text})${undo ? '' : ' (a mano / vida al m\u00e1ximo)'}`;
  return { amount: final.amount, line, chip: { kind: 'heal', text: `Eternidad +${final.amount} PV`, title: line }, ...(undo ? { undo } : {}) };
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
    // Orden: primero el escudo de una habilidad (p. ej. W de Nocturne); el de un objeto (Anulacion) se conserva.
    // Entre escudos de objeto, el de menos turnos. Cada escudo lleva su origen en source: solo entra en CD el efecto cuyo escudo se rompe.
    const abilityUp = participantAbilities(target, options.level).some(row => row.ability.mechanics?.spellShield
      && (target.effects ?? []).some(effect => effect.source === `ability:${row.name}` && (effect.duration ?? 0) > 0));
    const itemShield = abilityUp ? undefined : (target.effects ?? [])
      .filter(effect => (effect.source ?? '').startsWith(ITEM_SPELL_SHIELD_PREFIX) && (effect.duration ?? 0) > 0)
      .sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0))[0];
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
  reduceShield: (id: string, amount: number, kind?: 'physical' | 'magic') => Promise<boolean>,
  saveBonuses: (id: string, bonuses: CombatBonus[]) => Promise<void>,
  currentBonuses: () => CombatBonus[],
): Promise<void> {
  const lines: string[] = [];
  for (const marker of expired) {
    const typed = (marker.source ?? '').endsWith('|magic') ? 'magic' : (marker.source ?? '').endsWith('|physical') ? 'physical' : undefined;
    const ok = await reduceShield(participantId, marker.amount, typed);
    lines.push(`Escudo −${marker.amount}${ok ? '' : ' (no quedaba tanto)'}`);
    await saveBonuses(participantId, currentBonuses().filter(bonus => bonus.source !== marker.source));
  }
  if (lines.length) logCombat({ title: 'Medallón: el escudo baja a la mitad', actor: '', lines });
}

/** Marca en el objetivo: le ha da\u00f1ado este participante (source hitby:<id>, 2 turnos) \u2192 asistencia si muere. */
export const HIT_BY_PREFIX = 'hitby:';

/**
 * Asistencia: reglas \u00abAl matar / asistir\u00bb de quien da\u00f1\u00f3 al derrotado (marca hitby:) sin darle el golpe final.
 * victimId: el derrotado (para \u00abSolo derribos de campeones\u00bb).
 */
export async function fireTakedownEffects(
  bearer: CombatParticipant,
  victimId: string,
  hooks: ReactiveHooks,
): Promise<{ bonuses?: CombatBonus[]; undo?: () => Promise<void> }> {
  const base = participantContext(bearer, hooks.level);
  if (!base) return {};
  const all = [...activeNamedEffects(participantItems(bearer), hooks.effectData), ...base.abilityEffects];
  const effects = all.filter(effect => effect.config.rules.some(rule => rule.trigger === 'on-takedown'));
  if (!effects.length) return {};
  const result = await fireEffectRules({
    trigger: 'on-takedown',
    effects,
    ctx: base.ctx,
    bonuses: bearer.bonuses,
    targetIds: [],
    participants: hooks.participants,
    level: hooks.level,
    callbacks: hooks.callbacks,
    bearer: { id: bearer.id, name: bearer.name },
    takedownOf: victimId,
  });
  const victim = hooks.participants.find(entry => entry.id === victimId)?.name ?? victimId;
  const lines = [...result.log, ...result.manual.map(text => `a mano: ${text}`)];
  if (lines.length) logCombat({ title: `Asistencia (${victim}) \u2014 ${bearer.name}`, actor: bearer.name, lines });
  const undos = result.undos;
  return {
    ...(result.changed ? { bonuses: result.bonuses } : {}),
    ...(undos.length ? { undo: async () => { for (const undo of [...undos].reverse()) await undo(); } } : {}),
  };
}
