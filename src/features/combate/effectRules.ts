import type { CombatBonus, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { participantChampion, participantNpc } from '../../data/combatSheet';
import type { EffectBonusConfig, EffectRule, ScalingStat } from '../../data/effectBonus';
import type { Item } from '../../data/items';
import { namedEffectBonus, type NamedEffectData } from '../../data/namedEffectDescriptions';
import { baseNamedEffectId, namedEffectName } from '../../data/namedEffects';
import { PLAYERS } from '../../data/players';
import { championDamageContext } from '../calculos/championDamage';
import { playerBonusLine, playerTotalLine } from '../calculos/playerTotals';
import { emptyStatLine, formatStat, type StatKey, type StatLine } from '../calculos/statLine';
import { rollDamageStat } from '../players/abilityDamage';
import { bonusLines, equippedItems, isStatKey, newBonusId, statTitle } from './combatBonuses';
import { participantHp, type TargetDamageFn } from './combatHp';

/**
 * Motor del configurador de bonus de los efectos con nombre (pasivas/activas de ítems) en combate.
 * - Un solo efecto por efecto base (exclusividad): manda el primer ítem equipado que lo tenga.
 * - CD por participante y efecto base: marcador en sus bonus (stat 'cooldown', source cd:<base>, turns).
 * - «Tras habilidad»: marcador 'armed' (source armed:<base>, turns = duración); lo gasta el siguiente AA.
 * - Debuffs al objetivo (appliesTo target): bonus negativos en la lista del objetivo (source fx:<base>:<n>).
 * Los marcadores no suman a ninguna stat; caducan con el tick normal de bonus al empezar su turno.
 */

export type ActiveNamedEffect = { id: string; base: string; name: string; item: string; config: EffectBonusConfig };

/** Efectos con config de los ítems equipados: uno por efecto base (el primer ítem que lo tenga). */
export function activeNamedEffects(items: Item[], data: NamedEffectData): ActiveNamedEffect[] {
  const seen = new Set<string>();
  const out: ActiveNamedEffect[] = [];
  for (const item of items) {
    for (const id of item.namedEffects ?? []) {
      const base = baseNamedEffectId(id);
      if (seen.has(base)) continue;
      seen.add(base);
      const config = namedEffectBonus(data, id);
      if (config && config.rules.length) out.push({ id, base, name: namedEffectName(id), item: item.nombre, config });
    }
  }
  return out;
}

type Stats = Record<string, unknown> & { bonus?: Record<string, unknown> };
export type EffectContext = { stats: Stats; level: number };
type TargetInfo = { current: number; max: number; armor: number; mr: number };

/** Media de una stat (los dados cuentan su media); con roll, tira los dados. */
function statNumber(value: unknown, roll = false): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || !value.trim()) return 0;
  try {
    const result = rollDamageStat(value);
    if (roll) return result.total;
    return result.flat + result.groups.reduce((sum, group) => sum + group.sign * group.count * (group.sides + 1) / 2, 0);
  } catch {
    return 0;
  }
}

const SCALING_KEY: Partial<Record<ScalingStat, string>> = { armor: 'ac', bonusArmor: 'ac', mr: 'mr', bonusMr: 'mr', hp: 'hp', bonusHp: 'hp', mana: 'mana', bonusMana: 'mana', ad: 'ad', bonusAd: 'ad', ap: 'ap', critChance: 'critChance', manaRegen: 'manaRegen' };

function scalingValue(stat: ScalingStat, ctx: EffectContext, target: TargetInfo | undefined, roll: boolean): number {
  const total = (key: string) => statNumber(ctx.stats[key], roll);
  const bonus = (key: string) => statNumber(ctx.stats.bonus?.[key]);
  switch (stat) {
    case 'baseAd': return Math.max(0, total('ad') - bonus('ad'));
    case 'bonusAd': case 'bonusHp': case 'bonusMana': case 'bonusArmor': case 'bonusMr': return bonus(SCALING_KEY[stat]!);
    case 'level': return ctx.level;
    case 'targetMaxHp': return target?.max ?? 0;
    case 'targetCurrentHp': return target?.current ?? 0;
    case 'targetMissingHp': return target ? Math.max(0, target.max - target.current) : 0;
    case 'targetArmor': return target?.armor ?? 0;
    case 'targetMr': return target?.mr ?? 0;
    default: return total(SCALING_KEY[stat] ?? stat);
  }
}

/** Valor de la fórmula de una regla (plano o por nivel + ratios). */
export function ruleAmount(rule: EffectRule, ctx: EffectContext, target?: TargetInfo, roll = false): number {
  const flat = rule.perLevel?.length ? rule.perLevel[Math.min(rule.perLevel.length, Math.max(1, ctx.level)) - 1] ?? 0 : rule.flat ?? 0;
  const value = (rule.ratios ?? []).reduce((sum, ratio) => sum + (ratio.pct / 100) * scalingValue(ratio.stat, ctx, target, roll), flat);
  return Math.round(value * 100) / 100;
}

const ruleStat = (rule: EffectRule): StatKey | null => {
  const key = rule.kind === 'attack-speed' ? 'atkSpePct' : rule.kind === 'move-speed' ? 'spe' : rule.kind === 'stat' ? rule.stat : undefined;
  return key && isStatKey(key) ? key : null;
};
const STAT_KINDS = new Set(['stat', 'attack-speed', 'move-speed']);

/** Contexto de stats de un participante (players: ficha; campeones: su copia), sin la regla always-on. */
export function participantContext(participant: CombatParticipant, level: number, extra: StatLine[] = bonusLines(participant)): { ctx: EffectContext; items: Item[] } | null {
  if (participant.kind === 'player') {
    const player = PLAYERS.find(p => p.name === participant.sourceId);
    if (!player) return null;
    return {
      ctx: { stats: { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) } as Stats, level },
      items: equippedItems(player.equipamiento),
    };
  }
  const champion = participantChampion(participant);
  if (champion) {
    const context = championDamageContext(champion, extra);
    return { ctx: { stats: context.stats as unknown as Stats, level: context.level }, items: equippedItems(champion.equipamiento) };
  }
  const npc = participantNpc(participant);
  if (npc) return { ctx: { stats: { ...(npc.stats ?? {}) } as Stats, level: typeof npc.level === 'number' ? npc.level : 1 }, items: [] };
  return null;
}

/** Líneas de stats de las reglas «Siempre» (al portador): se suman a los bonus del combate. */
export function alwaysOnLines(effects: ActiveNamedEffect[], ctx: EffectContext): StatLine[] {
  const lines: StatLine[] = [];
  for (const effect of effects) {
    for (const rule of effect.config.rules) {
      if (rule.trigger !== 'always' || rule.appliesTo === 'target' || !STAT_KINDS.has(rule.kind)) continue;
      const stat = ruleStat(rule);
      if (!stat) continue;
      const amount = ruleAmount(rule, ctx);
      if (!amount) continue;
      const line = emptyStatLine();
      line[stat] = amount;
      lines.push(line);
    }
  }
  return lines;
}

/** Bonus del combate + reglas «Siempre» de sus efectos con nombre (lo que suma al total de la ficha). */
export function combatExtraLines(participant: CombatParticipant, level: number, data: NamedEffectData): StatLine[] {
  const extra = bonusLines(participant);
  const base = participantContext(participant, level, extra);
  if (!base) return extra;
  return [...extra, ...alwaysOnLines(activeNamedEffects(base.items, data), base.ctx)];
}

const marker = (bonuses: CombatBonus[], source: string) => bonuses.find(bonus => bonus.source === source);
export const cooldownLeft = (bonuses: CombatBonus[] | undefined, base: string): number => marker(bonuses ?? [], `cd:${base}`)?.turns ?? 0;

function setMarker(bonuses: CombatBonus[], stat: 'armed' | 'cooldown', source: string, turns: number, label: string): CombatBonus[] {
  const rest = bonuses.filter(bonus => bonus.source !== source);
  return [...rest, { id: newBonusId(), stat, amount: 1, turns: Math.max(1, Math.min(99, Math.round(turns))), source, label }];
}

function upsertStacking(bonuses: CombatBonus[], source: string, stat: StatKey, amount: number, rule: EffectRule, turns: number | undefined, label: string): CombatBonus[] {
  const index = bonuses.findIndex(bonus => bonus.source === source);
  const entry: CombatBonus = {
    id: index >= 0 ? bonuses[index].id : newBonusId(),
    stat,
    amount,
    ...(rule.maxStacks ? { stacks: index >= 0 ? Math.min(rule.maxStacks, (bonuses[index].stacks ?? 1) + 1) : 1, maxStacks: rule.maxStacks } : {}),
    ...(turns ? { turns } : {}),
    source,
    label,
  };
  if (index >= 0) return bonuses.map((bonus, i) => (i === index ? entry : bonus));
  return [...bonuses, entry].slice(-30);
}

/** CD / marcador «armado» de los efectos «Tras habilidad»: al usar una habilidad se arma el siguiente AA. */
export function armAfterAbility(effects: ActiveNamedEffect[], bonuses: CombatBonus[]): { bonuses: CombatBonus[]; names: string[] } {
  let next = bonuses;
  const names: string[] = [];
  for (const effect of effects) {
    const { config } = effect;
    if (!config.rules.some(rule => rule.trigger === 'after-ability')) continue;
    if (cooldownLeft(next, effect.base) > 0) continue;
    next = setMarker(next, 'armed', `armed:${effect.base}`, config.duration ?? 1, effect.name);
    if (config.cooldown && config.cdStart !== 'on-end') next = setMarker(next, 'cooldown', `cd:${effect.base}`, config.cooldown, effect.name);
    names.push(effect.name);
  }
  return { bonuses: next, names };
}

export type EffectCallbacks = {
  onTargetDamage?: TargetDamageFn;
  /** Cambia los bonus de otro participante (debuffs); devuelve su Deshacer. */
  onTargetBonuses?: (targetId: string, update: (current: CombatBonus[]) => CombatBonus[]) => Promise<(() => Promise<void>) | null>;
  onApplySourcedEffect?: (targetIds: string[], input: SourcedEffectInput) => void | Promise<void>;
  /** Cura / escudo / maná al portador; devuelve su Deshacer. */
  onSelfPool?: (kind: 'heal' | 'shield' | 'mana', amount: number) => Promise<(() => Promise<void>) | null>;
};

export type EffectTriggerName = 'on-hit' | 'on-ability-hit' | 'on-use' | 'on-takedown';

export type EffectFireResult = {
  /** Bonus del portador tras las reglas (para seguir con las pasivas de ítems). */
  bonuses: CombatBonus[];
  changed: boolean;
  notes: string[];
  undos: (() => Promise<void>)[];
  /** Objetivos que han llegado a 0 con el daño de las reglas. */
  kills: string[];
  /** Reglas que hay que aplicar a mano (no automatizadas). */
  manual: string[];
};

const DAMAGE_WORD = { physical: 'físico', magic: 'mágico', true: 'verdadero' } as const;

/**
 * Salta las reglas de un disparador para los efectos dados (on-hit también gasta los «armados»).
 * targetIds: objetivos golpeados. participants: el combate (para vida / armadura de los objetivos).
 */
export async function fireEffectRules(options: {
  trigger: EffectTriggerName;
  effects: ActiveNamedEffect[];
  ctx: EffectContext;
  bonuses: CombatBonus[] | undefined;
  targetIds: string[];
  participants: CombatParticipant[];
  level: number;
  callbacks: EffectCallbacks;
}): Promise<EffectFireResult> {
  const { trigger, effects, ctx, targetIds, participants, level, callbacks } = options;
  let bonuses = [...(options.bonuses ?? [])];
  const result: EffectFireResult = { bonuses, changed: false, notes: [], undos: [], kills: [], manual: [] };

  const targetInfo = (id: string, exclude: string): TargetInfo | undefined => {
    const target = participants.find(p => p.id === id);
    if (!target) return undefined;
    const hp = participantHp(target);
    const extra = bonusLines({ ...target, bonuses: (target.bonuses ?? []).filter(bonus => bonus.source !== exclude) });
    const context = participantContext(target, level, extra);
    const armor = statNumber(context?.ctx.stats.ac);
    const mr = statNumber(context?.ctx.stats.mr);
    return { current: hp?.current ?? 0, max: hp?.max ?? hp?.current ?? 0, armor, mr };
  };

  const applyRules = async (effect: ActiveNamedEffect, rules: { rule: EffectRule; index: number }[]): Promise<number> => {
    let extraHits = 0;
    const duration = effect.config.duration;
    for (const { rule, index } of rules) {
      const source = `fx:${effect.base}:${index}`;
      const label = effect.name;
      if (STAT_KINDS.has(rule.kind)) {
        const stat = ruleStat(rule);
        if (!stat) continue;
        const turns = rule.duration ?? duration ?? 1;
        if (rule.appliesTo === 'target') {
          if (!callbacks.onTargetBonuses || targetIds.length === 0) { result.manual.push(`${label}: debuff a mano`); continue; }
          for (const id of targetIds) {
            const info = targetInfo(id, source);
            const amount = ruleAmount(rule, ctx, info);
            if (!amount) continue;
            const undo = await callbacks.onTargetBonuses(id, current => upsertStacking(current, source, stat, amount, rule, turns, label));
            if (undo) result.undos.push(undo);
          }
          result.notes.push(`${label}: ${formatStat(ruleAmount(rule, ctx, targetInfo(targetIds[0], source)))} ${statTitle(stat)}${rule.maxStacks ? ' (stack)' : ''} al objetivo`);
        } else {
          const amount = ruleAmount(rule, ctx);
          if (!amount) continue;
          bonuses = upsertStacking(bonuses, source, stat, amount, rule, turns, label);
          result.changed = true;
          result.notes.push(`${label}: ${amount > 0 ? '+' : ''}${formatStat(amount)} ${statTitle(stat)}`);
        }
        continue;
      }
      switch (rule.kind) {
        case 'damage': {
          if (!callbacks.onTargetDamage || targetIds.length === 0) break;
          const parts: string[] = [];
          for (const id of targetIds) {
            let dealt = 0;
            try {
              const damage = await callbacks.onTargetDamage(id, currentHp => {
                const info = targetInfo(id, '');
                dealt = Math.max(0, Math.ceil(ruleAmount(rule, ctx, info ? { ...info, current: currentHp } : undefined, true)));
                return dealt;
              });
              if (damage) {
                result.undos.push(damage.undo);
                if (damage.before > 0 && damage.after <= 0) result.kills.push(id);
                parts.push(`${formatStat(dealt)} → ${damage.name}`);
              }
            } catch (caught) {
              result.notes.push(`error: ${caught instanceof Error ? caught.message : 'daño'}`);
            }
          }
          if (parts.length) result.notes.push(`${label}: +${parts.join(', ')} ${DAMAGE_WORD[rule.damageType ?? 'physical']}`);
          break;
        }
        case 'heal': case 'shield': case 'mana': {
          const amount = Math.floor(ruleAmount(rule, ctx));
          if (amount <= 0) break;
          if (!callbacks.onSelfPool) { result.manual.push(`${label}: ${rule.kind} ${amount} a mano`); break; }
          const undo = await callbacks.onSelfPool(rule.kind, amount);
          if (undo) {
            result.undos.push(undo);
            result.notes.push(`${label}: ${rule.kind === 'heal' ? 'cura' : rule.kind === 'shield' ? 'escudo' : 'maná'} +${amount}`);
          }
          break;
        }
        case 'slow': case 'status': {
          if (!callbacks.onApplySourcedEffect || targetIds.length === 0) break;
          const name = rule.kind === 'slow' ? `Ralentizado ${formatStat(rule.slowPct ?? 0)}%` : rule.statusName || label;
          await callbacks.onApplySourcedEffect(targetIds, {
            source: `item:${effect.item}`.slice(0, 80),
            name: `${name} (${label})`.slice(0, 80),
            duration: rule.duration ?? duration ?? 1,
          });
          result.notes.push(`${label}: ${name}`);
          break;
        }
        case 'extra-on-hit':
          extraHits += rule.count ?? 1;
          break;
      }
    }
    return extraHits;
  };

  let extraHits = 0;
  for (const effect of effects) {
    const { config } = effect;
    const rules = config.rules.map((rule, index) => ({ rule, index }));
    // Siguiente AA potenciado: gasta el marcador (sin mirar el CD, que ya se miró al armarlo).
    if (trigger === 'on-hit' && marker(bonuses, `armed:${effect.base}`)) {
      bonuses = bonuses.filter(bonus => bonus.source !== `armed:${effect.base}`);
      result.changed = true;
      if (config.cooldown && config.cdStart === 'on-end') bonuses = setMarker(bonuses, 'cooldown', `cd:${effect.base}`, config.cooldown, effect.name);
      extraHits += await applyRules(effect, rules.filter(({ rule }) => rule.trigger === 'after-ability'));
    }
    const own = rules.filter(({ rule }) => rule.trigger === trigger);
    if (own.length === 0) continue;
    const hasAfterAbility = rules.some(({ rule }) => rule.trigger === 'after-ability');
    // El CD de un efecto con «Tras habilidad» es el del AA potenciado; el resto lo comparte.
    if (config.cooldown && !hasAfterAbility) {
      if (cooldownLeft(bonuses, effect.base) > 0) {
        result.notes.push(`${effect.name} en CD (${cooldownLeft(bonuses, effect.base)} t.)`);
        continue;
      }
      const turns = config.cdStart === 'on-end' ? (config.duration ?? 0) + config.cooldown : config.cooldown;
      bonuses = setMarker(bonuses, 'cooldown', `cd:${effect.base}`, turns, effect.name);
      result.changed = true;
    }
    extraHits += await applyRules(effect, own);
  }
  // Doble efecto al impactar (Amanecer y anochecer): repite las reglas «Al impactar».
  for (let i = 0; i < Math.min(extraHits, 3); i += 1) {
    for (const effect of effects) {
      const own = effect.config.rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.trigger === 'on-hit' && rule.kind !== 'extra-on-hit');
      if (own.length) await applyRules(effect, own);
    }
  }
  if (extraHits) result.notes.push(`efectos al impactar ×${1 + Math.min(extraHits, 3)}`);
  result.bonuses = bonuses;
  return result;
}

/** Texto de los marcadores en la lista de bonus. */
export function markerText(bonus: CombatBonus): string | null {
  if (bonus.stat === 'armed') return `${bonus.label ?? 'Efecto'} armado${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'cooldown') return `CD ${bonus.label ?? 'efecto'}${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  return null;
}
