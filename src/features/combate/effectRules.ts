import type { CombatBonus, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { participantChampion, participantNpc } from '../../data/combatSheet';
import { isMeleeRange, rangeConditionShort, rangeTypeLabel, ruleAppliesTo, ruleMatchesRange, scalingLabel, type EffectBonusConfig, type EffectRule, type ScalingStat } from '../../data/effectBonus';
import { damageChipKind, fmt, signed, statShort, type ResultChip } from './combatResult';
import { effectiveResistLine } from './combatMitigation';
import type { Item } from '../../data/items';
import { namedEffectBonus, type NamedEffectData } from '../../data/namedEffectDescriptions';
import { baseNamedEffectId, namedEffectName } from '../../data/namedEffects';
import { PLAYERS } from '../../data/players';
import { effectStackKey, isPermanentStackRule } from '../../data/permanentStacks';
import { readStack } from '../../data/stacks';
import { championDamageContext } from '../calculos/championDamage';
import { playerBonusLine, playerTotalLine } from '../calculos/playerTotals';
import { emptyStatLine, formatStat, type StatKey, type StatLine } from '../calculos/statLine';
import { rollDamageStat } from '../players/abilityDamage';
import { bonusLines, chargesText, equippedItems, isStatKey, newBonusId, statTitle } from './combatBonuses';
import { participantHp, type TargetDamageFn } from './combatHp';

/**
 * Motor del configurador de bonus de los efectos con nombre (pasivas/activas de ítems) en combate.
 * - Un solo efecto por efecto base (exclusividad): manda el primer ítem equipado que lo tenga.
 * - CD por participante y efecto base: marcador en sus bonus (stat 'cooldown', source cd:<base>, turns).
 * - «Enfriamiento por objetivo»: el CD va en la lista del OBJETIVO (source cd:<base>@<id portador>); sin él, está marcado.
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
/**
 * missingHp: vida faltante del portador (máx. − actual) en combate; fuera de combate no hay.
 * melee: cuerpo a cuerpo (rango de ataque total 1); si no, a distancia (condición «Solo si» de las reglas).
 */
export type EffectContext = { stats: Stats; level: number; missingHp?: number; melee?: boolean };
type TargetInfo = { current: number; max: number; armor: number; mr: number; spe?: number; level?: number };

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
    case 'missingHp': return Math.max(0, ctx.missingHp ?? 0);
    case 'targetMaxHp': return target?.max ?? 0;
    case 'targetCurrentHp': return target?.current ?? 0;
    case 'targetMissingHp': return target ? Math.max(0, target.max - target.current) : 0;
    case 'targetArmor': return target?.armor ?? 0;
    case 'targetMr': return target?.mr ?? 0;
    case 'targetSpe': return target?.spe ?? 0;
    default: return total(SCALING_KEY[stat] ?? stat);
  }
}

const NO_DICE = new Set<string>(['baseAd', 'bonusAd', 'bonusHp', 'bonusMana', 'bonusArmor', 'bonusMr', 'level', 'missingHp', 'targetMaxHp', 'targetCurrentHp', 'targetMissingHp', 'targetArmor', 'targetMr', 'targetSpe']);

/** Valor de la fórmula + su desarrollo: «60% AD total (35) = 21 + 10 → 31». */
export type RuleBreakdown = { value: number; text: string; /** Sin redondear (curas / escudos: se redondean al aplicar). */ raw: number };

export function ruleBreakdown(rule: EffectRule, ctx: EffectContext, target?: TargetInfo, roll = false): RuleBreakdown {
  const parts: string[] = [];
  let value = 0;
  if (rule.perLevel?.length) {
    // «Por nivel del objetivo» (Medallón, Redención…): el nivel de cada objetivo; si no se sabe, el del portador.
    const fromTarget = rule.levelFrom === 'target' && typeof target?.level === 'number';
    const level = fromTarget ? target!.level! : ctx.level;
    value = rule.perLevel[Math.min(rule.perLevel.length, Math.max(1, level)) - 1] ?? 0;
    parts.push(`${fmt(value)} (nivel ${level}${fromTarget ? ' del objetivo' : ''})`);
  } else if (rule.flat) {
    value = rule.flat;
    parts.push(fmt(rule.flat));
  }
  for (const ratio of rule.ratios ?? []) {
    const base = scalingValue(ratio.stat, ctx, target, roll);
    const add = (ratio.pct / 100) * base;
    value += add;
    const raw = ctx.stats[SCALING_KEY[ratio.stat] ?? ratio.stat];
    const diced = roll && !NO_DICE.has(ratio.stat) && typeof raw === 'string' && /d/i.test(raw) ? ` 🎲 ${raw}` : '';
    parts.push(`${fmt(ratio.pct)}% ${scalingLabel(ratio.stat)} (${fmt(base)}${diced}) = ${fmt(add)}`);
  }
  const total = Math.round(value * 100) / 100;
  const text = parts.length === 0 ? '0' : parts.length === 1 ? parts[0] : `${parts.join(' + ')} → total ${fmt(total)}`;
  return { value: total, text, raw: value };
}

/** Valor de la fórmula de una regla (plano o por nivel + ratios). */
export function ruleAmount(rule: EffectRule, ctx: EffectContext, target?: TargetInfo, roll = false): number {
  return ruleBreakdown(rule, ctx, target, roll).value;
}

const ruleStat = (rule: EffectRule): StatKey | null => {
  const key = rule.kind === 'attack-speed' ? 'atkSpePct' : rule.kind === 'move-speed' ? 'spe' : rule.kind === 'stat' ? rule.stat : undefined;
  return key && isStatKey(key) ? key : null;
};
const STAT_KINDS = new Set(['stat', 'attack-speed', 'move-speed']);

/** Contexto de stats de un participante (players: ficha; campeones: su copia), sin la regla always-on. */
export function participantContext(participant: CombatParticipant, level: number, extra: StatLine[] = bonusLines(participant)): { ctx: EffectContext; items: Item[] } | null {
  const context = baseParticipantContext(participant, level, extra);
  if (!context) return null;
  context.ctx.melee = isMeleeRange(statNumber(context.ctx.stats.range));
  // «Vida faltante» del portador: con su vida del combate en este momento.
  const hp = participantHp(participant);
  if (hp && typeof hp.max === 'number') context.ctx.missingHp = Math.max(0, hp.max - hp.current);
  return context;
}

/** Rango de ataque total de unas stats y si cuenta como cuerpo a cuerpo (rango 1) o a distancia (cualquier otro, 0 incluido). */
export function rangeInfo(stats: Record<string, unknown>): { range: number; melee: boolean } {
  const range = statNumber(stats.range);
  return { range, melee: isMeleeRange(range) };
}

/** ¿Cuerpo a cuerpo? Rango de ataque total (base + ítems + bonus del combate) === 1. */
export function isMelee(participant: CombatParticipant, level: number, extra?: StatLine[]): boolean {
  return participantContext(participant, level, extra)?.ctx.melee === true;
}

/** ¿La regla se aplica a este portador? (condición «Solo cuerpo a cuerpo» / «Solo a distancia»). */
const rangeOk = (rule: EffectRule, ctx: EffectContext): boolean => ruleMatchesRange(rule, ctx.melee === true);

function baseParticipantContext(participant: CombatParticipant, level: number, extra: StatLine[]): { ctx: EffectContext; items: Item[] } | null {
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
      if (rule.trigger !== 'always' || rule.appliesTo === 'target' || rule.permanent || !STAT_KINDS.has(rule.kind) || !rangeOk(rule, ctx)) continue;
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

/**
 * Cargas permanentes (contador en la ficha: players.stacks effect:<base>): valor de la regla × cargas (hasta su máx.).
 * Solo de los efectos de ítems equipados (sin el ítem, el contador se guarda pero no suma).
 */
export function permanentStackLines(effects: ActiveNamedEffect[], ctx: EffectContext, stacks: Record<string, number> | undefined): StatLine[] {
  const lines: StatLine[] = [];
  for (const effect of effects) {
    const count = readStack(stacks, effectStackKey(effect.id));
    if (!count) continue;
    for (const rule of effect.config.rules) {
      if (!isPermanentStackRule(rule) || !rangeOk(rule, ctx)) continue;
      const stat = ruleStat(rule);
      if (!stat) continue;
      const amount = ruleAmount(rule, ctx) * Math.min(count, rule.maxStacks ?? count);
      if (!amount) continue;
      const line = emptyStatLine();
      line[stat] = Math.round(amount * 1000) / 1000;
      lines.push(line);
    }
  }
  return lines;
}

/** Cargas permanentes guardadas en la ficha del player (campeones / NPCs: no tienen; van en el combate). */
export const playerPermanentStacks = (participant: CombatParticipant): Record<string, number> | undefined =>
  participant.kind === 'player' ? PLAYERS.find(p => p.name === participant.sourceId)?.stacks : undefined;

/** Bonus del combate + reglas «Siempre» + cargas permanentes de sus efectos con nombre (lo que suma al total de la ficha). */
export function combatExtraLines(participant: CombatParticipant, level: number, data: NamedEffectData): StatLine[] {
  const extra = bonusLines(participant);
  const base = participantContext(participant, level, extra);
  if (!base) return extra;
  const effects = activeNamedEffects(base.items, data);
  return [...extra, ...alwaysOnLines(effects, base.ctx), ...permanentStackLines(effects, base.ctx, playerPermanentStacks(participant))];
}

const marker = (bonuses: CombatBonus[], source: string) => bonuses.find(bonus => bonus.source === source);
export const cooldownLeft = (bonuses: CombatBonus[] | undefined, base: string): number => marker(bonuses ?? [], `cd:${base}`)?.turns ?? 0;

/** Source del CD por objetivo de un portador (va en los bonus del objetivo). */
export const perTargetCdSource = (base: string, bearerId: string): string => `cd:${base}@${bearerId}`.slice(0, 80);

/**
 * Marcas que tiene este participante de los efectos «Enfriamiento por objetivo» de los demás:
 * sin CD de ese portador = marcado (el CD ya sale como bonus suyo «CD … (de …)»).
 */
export function targetMarks(target: CombatParticipant, participants: CombatParticipant[], data: NamedEffectData): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const bearer of participants) {
    if (bearer.id === target.id || bearer.defeated) continue;
    const context = participantContext(bearer, 1, []);
    if (!context) continue;
    for (const effect of activeNamedEffects(context.items, data)) {
      if (!effect.config.perTargetCooldown || !effect.config.cooldown) continue;
      if (marker(target.bonuses ?? [], perTargetCdSource(effect.base, bearer.id))) continue;
      out.push({ key: `${bearer.id}:${effect.base}`, text: `Marca de ${effect.name} (de ${bearer.name})` });
    }
  }
  return out;
}

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
export function armAfterAbility(
  effects: ActiveNamedEffect[],
  bonuses: CombatBonus[],
  ctx?: EffectContext,
  /** after-ability: al usar una habilidad; after-use: al usar el objeto (Hidra titánica). */
  trigger: 'after-ability' | 'after-use' = 'after-ability',
): { bonuses: CombatBonus[]; names: string[] } {
  let next = bonuses;
  const names: string[] = [];
  for (const effect of effects) {
    const { config } = effect;
    // Con ctx: solo si alguna regla «Tras habilidad» vale para el portador (cuerpo a cuerpo / a distancia).
    if (!config.rules.some(rule => rule.trigger === trigger && (!ctx || rangeOk(rule, ctx)))) continue;
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
  /** «Objetivo + cercanos»: elegir el objetivo principal y los enemigos de alrededor (principal ya marcado). */
  pickArea?: (primaryId: string, effectName: string) => Promise<string[]>;
  /** Cura / escudo / maná al portador; devuelve su Deshacer. */
  onSelfPool?: (kind: 'heal' | 'shield' | 'mana', amount: number) => Promise<(() => Promise<void>) | null>;
  /** Cura / escudo a otro participante (reglas «Aliados»); devuelve su Deshacer. */
  onTargetPool?: (targetId: string, kind: 'heal' | 'shield', amount: number) => Promise<(() => Promise<void>) | null>;
  /** Reglas «Aliados»: elegir a quién (el portador puede ir incluido). */
  pickAllies?: (effectName: string) => Promise<string[]>;
  /**
   * Cargas permanentes: +1 carga del efecto (id con variante) en la ficha del portador (players.stacks effect:<id>, hasta max).
   * Devuelve antes / después y su Deshacer; null si el portador no tiene ficha (campeón / NPC).
   */
  onPermanentStack?: (base: string, max: number | undefined) => Promise<{ before: number; after: number; undo: () => Promise<void> } | null>;
};

/**
 * Plan de la activa de un ítem según sus reglas: authoritative = tiene reglas «Al usar» / «Tras usar» (mandan ellas y no
 * se tira el daño leído del texto del ítem); needsEnemies = alguna regla «Al usar» va a enemigos (hay que elegirlos);
 * maxTargets = el menor «máx. objetivos» de sus efectos.
 */
export function itemRulePlan(item: Item, data: NamedEffectData): { authoritative: boolean; needsEnemies: boolean; maxTargets?: number } {
  const effects = activeNamedEffects([item], data);
  const rules = effects.flatMap(effect => effect.config.rules);
  const authoritative = rules.some(rule => rule.trigger === 'on-use' || rule.trigger === 'after-use');
  const needsEnemies = rules.some(rule => rule.trigger === 'on-use' && ['target', 'area', 'nearby'].includes(ruleAppliesTo(rule)));
  const limits = effects.map(effect => effect.config.maxTargets).filter((n): n is number => typeof n === 'number' && n > 0);
  return { authoritative, needsEnemies, ...(limits.length ? { maxTargets: Math.min(...limits) } : {}) };
}

/** ¿Es una regla «Tras habilidad» / «Tras usar» (arma el siguiente AA)? */
const isArmTrigger = (trigger: string): boolean => trigger === 'after-ability' || trigger === 'after-use';

export type EffectTriggerName = 'on-attack' | 'on-hit' | 'on-ability-hit' | 'on-use' | 'on-takedown' | 'energized-max';

/** Efectos con reglas «Vigor al máximo». */
export const vigorEffects = (effects: ActiveNamedEffect[]): ActiveNamedEffect[] =>
  effects.filter(effect => effect.config.rules.some(rule => rule.trigger === 'energized-max'));

/** Ítems equipados que llevan alguno de esos efectos (su contador de stacks = cargas de Vigor). */
export function vigorItems(items: Item[], effects: ActiveNamedEffect[]): Item[] {
  const bases = new Set(effects.map(effect => effect.base));
  return items.filter(item => (item.namedEffects ?? []).some(id => bases.has(baseNamedEffectId(id))));
}

/** ¿Lleva algún ítem con Vigor (efecto base energized, cualquier variante)? Si no, el contador no se ve. */
export const hasVigorItem = (items: Item[]): boolean =>
  items.some(item => (item.namedEffects ?? []).some(id => baseNamedEffectId(id) === 'energized'));

/**
 * ¿Algún efecto de sus ítems deja que las habilidades descarguen el Vigor? (opción del configurador).
 * Vale cualquier efecto (energized:*, galvanize de la Espada ciclovoltaica…); el portador tiene que llevar Vigor.
 */
export function abilityDischargesVigor(items: Item[], data: NamedEffectData): boolean {
  return items.some(item => (item.namedEffects ?? []).some(id => !!namedEffectBonus(data, id)?.abilityDischarge));
}

/** Objetivos a los que encadena «Vigor al máximo»: el mayor «Encadena a N» de los efectos de sus ítems (mínimo 1). */
export function vigorChainTargets(items: Item[], data: NamedEffectData): number {
  let chain = 1;
  for (const item of items) {
    for (const id of item.namedEffects ?? []) {
      chain = Math.max(chain, Math.min(10, namedEffectBonus(data, id)?.chainTargets ?? 1));
    }
  }
  return chain;
}

/** Velocidad (casillas por turno) del participante. */
export function participantSpeed(participant: CombatParticipant, level: number, extra?: StatLine[]): number {
  const context = participantContext(participant, level, extra);
  return Math.max(0, Math.floor(statNumber(context?.ctx.stats.spe)));
}

/** ¿Este ítem tiene el Vigor cargado? (contador de stacks del player al máximo). */
export const vigorCharged = (item: Item, stacks: number): boolean =>
  !!item.hasStacks && typeof item.maxStacks === 'number' && item.maxStacks > 0 && stacks >= item.maxStacks;

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
  /** Cargas de Vigor extra que dan las reglas «Vigor extra» (p. ej. Electrochoque de Statikk). */
  vigor: number;
  /** En pantalla: un chip por efecto (color por tipo). */
  chips: ResultChip[];
  /** Consola: desarrollo completo de cada valor. */
  log: string[];
};

const DAMAGE_WORD = { physical: 'físico', magic: 'mágico', true: 'verdadero' } as const;

/**
 * Cura / escudo al aplicarlo: el valor de la fórmula (con decimales) × (1 + poder de curación y escudos % del que lo da),
 * redondeado al más cercano solo aquí. El robo de vida / omnisucción no usa el poder de curación (como en LoL).
 */
export function poolAmount(raw: number, ctx: EffectContext, usePower = true): { amount: number; text: string } {
  const pct = usePower ? statNumber(ctx.stats.healShieldPct) : 0;
  const boosted = raw * (1 + pct / 100);
  const amount = Math.round(boosted);
  const exact = Math.round(raw * 1000) / 1000;
  const power = pct ? ` × ${fmt(1 + pct / 100)} (poder de curación y escudos ${fmt(pct)}%) = ${fmt(Math.round(boosted * 1000) / 1000)}` : usePower ? ' (sin poder de curación y escudos)' : '';
  return { amount, text: `${fmt(exact)}${power} → ${amount} (redondeo al más cercano)` };
}

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
  /** Portador (para el «Enfriamiento por objetivo»). */
  bearer?: { id: string; name: string };
  /**
   * on-hit: ¿es un ataque básico? (por defecto sí). Un AA dispara «Al auto-atacar» + «Al aplicar efecto de impacto»
   * y gasta los «Tras habilidad» armados; una habilidad con «Aplica efectos de impacto» solo dispara los de impacto.
   */
  basicAttack?: boolean;
  /** Habilidad: ¿ha hecho daño a algún enemigo? (false = no gasta cargas de combate). Ausente = sí. */
  damaged?: boolean;
}): Promise<EffectFireResult> {
  const { trigger, effects, ctx, targetIds, participants, level, callbacks, bearer } = options;
  const basicAttack = trigger === 'on-hit' && options.basicAttack !== false;
  const matches = (ruleTrigger: string) => ruleTrigger === trigger || (basicAttack && ruleTrigger === 'on-attack');
  let bonuses = [...(options.bonuses ?? [])];
  const result: EffectFireResult = { bonuses, changed: false, notes: [], undos: [], kills: [], manual: [], vigor: 0, chips: [], log: [] };
  const nameOf = (id: string) => participants.find(p => p.id === id)?.name ?? id;
  const bearerName = bearer?.name ?? 'portador';
  const manual = (text: string) => { result.manual.push(text); result.chips.push({ kind: 'manual', text, title: 'Aplicar a mano' }); result.log.push(`${text} (a mano)`); };

  const targetInfo = (id: string, exclude: string): TargetInfo | undefined => {
    const target = participants.find(p => p.id === id);
    if (!target) return undefined;
    const hp = participantHp(target);
    const extra = bonusLines({ ...target, bonuses: (target.bonuses ?? []).filter(bonus => bonus.source !== exclude) });
    const context = participantContext(target, level, extra);
    const armor = statNumber(context?.ctx.stats.ac);
    const mr = statNumber(context?.ctx.stats.mr);
    const spe = statNumber(context?.ctx.stats.spe);
    return { current: hp?.current ?? 0, max: hp?.max ?? hp?.current ?? 0, armor, mr, spe, level: context?.ctx.level };
  };

  const areaCache = new Map<string, string[]>();
  const areaTargets = async (effect: ActiveNamedEffect, targets: string[]): Promise<string[]> => {
    const cached = areaCache.get(effect.base);
    if (cached) return cached;
    const picked = callbacks.pickArea ? await callbacks.pickArea(targets[0], effect.name) : targets;
    const ids = picked.length ? picked : targets;
    areaCache.set(effect.base, ids);
    return ids;
  };

  const alliesCache = new Map<string, string[]>();
  const allyTargets = async (effect: ActiveNamedEffect): Promise<string[]> => {
    const cached = alliesCache.get(effect.base);
    if (cached) return cached;
    const picked = callbacks.pickAllies ? await callbacks.pickAllies(effect.name) : [];
    alliesCache.set(effect.base, picked);
    return picked;
  };
  const isBearer = (id: string) => !!bearer && id === bearer.id;

  const applyRules = async (effect: ActiveNamedEffect, rules: { rule: EffectRule; index: number }[], targets: string[] = targetIds): Promise<number> => {
    let extraHits = 0;
    // Una carga permanente por efecto y disparo (aunque tenga varias reglas de cargas).
    const permanentDone = new Set<string>();
    const duration = effect.config.duration;
    const label = effect.name;
    const origin = `${label} (${effect.item})`;
    for (const { rule, index } of rules) {
      const source = `fx:${effect.base}:${index}`;
      const to = ruleAppliesTo(rule);
      // «Objetivo + cercanos» (Hendidura): se eligen el objetivo y los enemigos de alrededor (una vez por efecto).
      // «Solo cercanos»: los mismos sin el objetivo principal. «Aliados»: se eligen aparte (portador incluido si se marca).
      let ruleTargets = targets;
      if ((to === 'area' || to === 'nearby') && targets.length > 0) ruleTargets = await areaTargets(effect, targets);
      if (to === 'nearby') ruleTargets = ruleTargets.filter(id => id !== targets[0]);
      if (to === 'allies') {
        ruleTargets = await allyTargets(effect);
        if (ruleTargets.length === 0) { manual(`${label}: elegir aliados (${rule.kind})`); continue; }
        result.log.push(`${origin}: aliados → ${ruleTargets.map(nameOf).join(', ')}`);
      }
      if (to === 'self' && rule.kind === 'status') ruleTargets = bearer ? [bearer.id] : [];
      if (STAT_KINDS.has(rule.kind)) {
        const stat = ruleStat(rule);
        if (!stat) continue;
        // Permanente (Yun Tal): sin turnos → no caduca en el combate.
        const turns = rule.permanent ? undefined : rule.duration ?? duration ?? 1;
        const turnsText = turns ? `${turns} t.` : 'permanente (sin ficha: solo este combate)';
        // Buff a aliados: el portador va por sus propios bonus; el resto, por su lista.
        if (to === 'allies') {
          for (const id of ruleTargets) {
            const info = targetInfo(id, source);
            const calc = ruleBreakdown(rule, ctx, info);
            if (!calc.value) continue;
            if (isBearer(id)) {
              bonuses = upsertStacking(bonuses, source, stat, calc.value, rule, turns, label);
              result.changed = true;
            } else {
              if (!callbacks.onTargetBonuses) { manual(`${label}: ${signed(calc.value)} ${statTitle(stat)} a ${nameOf(id)}`); continue; }
              const undo = await callbacks.onTargetBonuses(id, current => upsertStacking(current, source, stat, calc.value, rule, turns, label));
              if (undo) result.undos.push(undo);
            }
            result.notes.push(`${label}: ${signed(calc.value)} ${statTitle(stat)} a ${nameOf(id)}`);
            result.chips.push({ kind: calc.value < 0 ? 'debuff' : 'buff', text: `${signed(calc.value)} ${statShort(stat)} ${nameOf(id)}`, title: `${label} · ${statTitle(stat)}` });
            result.log.push(`${origin}: ${statTitle(stat)} a ${nameOf(id)} = ${calc.text} · ${turnsText}`);
          }
          continue;
        }
        if (to === 'target' || to === 'area' || to === 'nearby') {
          if (!callbacks.onTargetBonuses || ruleTargets.length === 0) { manual(`${label}: debuff`); continue; }
          let first: number | undefined;
          for (const id of ruleTargets) {
            const info = targetInfo(id, source);
            const calc = ruleBreakdown(rule, ctx, info);
            if (!calc.value) continue;
            first ??= calc.value;
            let stackText = '';
            const undo = await callbacks.onTargetBonuses(id, current => {
              const next = upsertStacking(current, source, stat, calc.value, rule, turns, label);
              const entry = next.find(bonus => bonus.source === source);
              if (entry?.maxStacks) stackText = ` · stack ${entry.stacks ?? 1}/${entry.maxStacks} (total ${signed(calc.value * (entry.stacks ?? 1))})`;
              return next;
            });
            if (undo) result.undos.push(undo);
            result.chips.push({ kind: calc.value < 0 ? 'debuff' : 'buff', text: `${signed(calc.value)} ${statShort(stat)} ${nameOf(id)}`, title: `${label} · ${statTitle(stat)}` });
            result.log.push(`${origin}: ${statTitle(stat)} a ${nameOf(id)} = ${calc.text}${stackText} · ${turnsText}`);
          }
          if (first !== undefined) result.notes.push(`${label}: ${formatStat(first)} ${statTitle(stat)}${rule.maxStacks ? ' (stack)' : ''} al objetivo`);
        } else {
          const calc = ruleBreakdown(rule, ctx);
          // Cargas permanentes: el contador va en la ficha (sigue entre combates); el bonus lo suma combatExtraLines.
          // Va antes del «sin valor»: la carga se gana aunque el valor por carga esté aún sin rellenar.
          if (isPermanentStackRule(rule) && (callbacks.onPermanentStack || effect.config.charges)) {
            if (permanentDone.has(effect.id)) continue;
            permanentDone.add(effect.id);
            // Cargas de combate (Flujo de maná): sin cargas no da nada; si hay, gasta 1.
            const charges = effect.config.charges;
            if (charges) {
              if (options.damaged === false) { result.log.push(`${origin}: no ha dañado a ningún enemigo → no gasta carga`); continue; }
              const source = chargesSource(effect.id);
              const current = bonuses.find(bonus => bonus.source === source);
              const left = current ? current.amount : charges.start;
              if (left <= 0) {
                result.chips.push({ kind: 'cd', text: chargesText(label, 0, charges.max, current?.recharge), title: `${label}: sin cargas de combate` });
                result.log.push(`${origin}: sin cargas (0/${charges.max}${current?.recharge ? `, recarga en ${current.recharge} t.` : ''}) → no da carga permanente`);
                continue;
              }
              const recharge = current?.recharge ?? charges.every;
              bonuses = [...bonuses.filter(bonus => bonus.source !== source), { id: current?.id ?? newBonusId(), stat: 'charges', amount: left - 1, maxStacks: charges.max, recharge, rechargeEvery: charges.every, source, label }];
              result.changed = true;
              result.chips.push({ kind: 'mana', text: chargesText(label, left - 1, charges.max, recharge), title: `${label}: cargas de combate (recarga 1 cada ${charges.every} t.)` });
              result.log.push(`${origin}: gasta 1 carga de combate ${left} → ${left - 1}/${charges.max} · recarga en ${recharge} t. (1 cada ${charges.every} t.)`);
            }
            if (!callbacks.onPermanentStack) { manual(`${label}: +1 carga permanente (sin ficha)`); continue; }
            const saved = await callbacks.onPermanentStack(effect.id, rule.maxStacks);
            if (saved && !calc.value) {
              result.undos.push(saved.undo);
              result.chips.push({ kind: 'buff', text: `${label} ${saved.before}→${saved.after}${rule.maxStacks ? `/${rule.maxStacks}` : ''}`, title: `${label} · cargas permanentes (ficha)` });
              result.log.push(`${origin}: cargas permanentes de ${bearerName} ${saved.before} → ${saved.after}${rule.maxStacks ? `/${rule.maxStacks}` : ''} (valor por carga sin rellenar: no suma nada todavía)`);
              continue;
            }
            if (saved) {
              result.undos.push(saved.undo);
              const capped = saved.after === saved.before;
              const total = calc.value * saved.after;
              result.notes.push(`${label}: carga permanente ${saved.after}${rule.maxStacks ? `/${rule.maxStacks}` : ''}`);
              result.chips.push({ kind: 'buff', text: capped ? `${label} ${saved.after}/${rule.maxStacks ?? saved.after} (máx.)` : `${label} ${saved.before}→${saved.after}${rule.maxStacks ? `/${rule.maxStacks}` : ''}`, title: `${label} · ${statTitle(stat)} · cargas permanentes (ficha)` });
              result.log.push(`${origin}: cargas permanentes de ${bearerName} ${saved.before} → ${saved.after}${rule.maxStacks ? `/${rule.maxStacks}` : ''}${capped ? ' (máx.)' : ''} · ${calc.text} por carga = ${signed(Math.round(total * 1000) / 1000)} ${statTitle(stat)} (guardado en la ficha; suma con el ítem equipado)`);
              continue;
            }
          }
          if (!calc.value) continue;
          bonuses = upsertStacking(bonuses, source, stat, calc.value, rule, turns, label);
          const entry = bonuses.find(bonus => bonus.source === source);
          const stackText = entry?.maxStacks ? ` · stack ${entry.stacks ?? 1}/${entry.maxStacks}` : '';
          result.changed = true;
          result.notes.push(`${label}: ${signed(calc.value)} ${statTitle(stat)}`);
          result.chips.push({ kind: calc.value < 0 ? 'debuff' : 'buff', text: `${signed(calc.value)} ${statShort(stat)}`, title: `${label} · ${statTitle(stat)} (${bearerName})` });
          result.log.push(`${origin}: ${statTitle(stat)} a ${bearerName} = ${calc.text}${stackText} · ${turnsText}`);
        }
        continue;
      }
      switch (rule.kind) {
        case 'damage': {
          if (!callbacks.onTargetDamage || ruleTargets.length === 0) break;
          const parts: string[] = [];
          let totalDealt = 0;
          const type = rule.damageType ?? 'physical';
          for (const id of ruleTargets) {
            let dealt = 0;
            let calcText = '';
            let info: TargetInfo | undefined;
            try {
              const damage = await callbacks.onTargetDamage(id, currentHp => {
                info = targetInfo(id, '');
                const calc = ruleBreakdown(rule, ctx, info ? { ...info, current: currentHp } : undefined, true);
                dealt = Math.max(0, Math.ceil(calc.value));
                calcText = `${calc.text}${dealt !== calc.value ? ` → ${fmt(dealt)} (redondeo ↑)` : ''}`;
                return dealt;
              });
              if (damage) {
                result.undos.push(damage.undo);
                totalDealt += dealt;
                if (damage.before > 0 && damage.after <= 0) result.kills.push(id);
                parts.push(`${formatStat(dealt)} → ${damage.name}`);
                const mit = info && type !== 'true'
                  ? ` · ${effectiveResistLine(type, damage.name, type === 'physical' ? info.armor : info.mr, ctx.stats)}`
                  : type === 'true' ? ' · verdadero: ignora CA / RM' : '';
                const absorbed = damage.absorbed ? ` · ${fmt(damage.absorbed)} absorbido por escudo / vida temporal` : '';
                result.chips.push({ kind: damageChipKind(type), text: `−${fmt(dealt)} ${damage.name}`, title: `${label} · daño ${DAMAGE_WORD[type]}` });
                result.log.push(`${origin}: daño ${DAMAGE_WORD[type]} = ${calcText} → ${damage.name} (vida ${fmt(damage.before)} → ${fmt(damage.after)})${absorbed}${mit}${damage.before > 0 && damage.after <= 0 ? ' · ¡derrotado!' : ''}`);
              }
            } catch (caught) {
              const message = caught instanceof Error ? caught.message : 'daño';
              result.notes.push(`error: ${message}`);
              result.chips.push({ kind: 'error', text: message });
              result.log.push(`${origin}: error al aplicar el daño a ${nameOf(id)}: ${message}`);
            }
          }
          if (parts.length) result.notes.push(`${label}: +${parts.join(', ')} ${DAMAGE_WORD[type]}`);
          // «Aplica robo de vida»: cura al portador el daño hecho × su robo de vida % (100% de eficacia).
          if (rule.lifeSteal && totalDealt > 0) {
            const pct = statNumber(ctx.stats.lifeStealPct);
            const stolen = poolAmount(totalDealt * pct / 100, ctx, false);
            const heal = stolen.amount;
            if (heal > 0 && callbacks.onSelfPool) {
              const undo = await callbacks.onSelfPool('heal', heal);
              if (undo) {
                result.undos.push(undo);
                result.notes.push(`${label}: robo de vida +${heal}`);
                result.chips.push({ kind: 'heal', text: `+${heal} PV (robo de vida)`, title: `${label} → ${bearerName}` });
              }
            }
            result.log.push(`${origin}: robo de vida = ${fmt(totalDealt)} de daño × ${fmt(pct)}% = ${stolen.text} (el robo de vida no usa el poder de curación y escudos) → ${heal > 0 ? `cura ${heal}` : 'nada'}${heal > 0 && !callbacks.onSelfPool ? ' (a mano)' : ''}`);
          }
          break;
        }
        case 'heal': case 'shield': case 'mana': {
          if (to === 'allies' && rule.kind !== 'mana') {
            const kind = rule.kind;
            const word = kind === 'heal' ? 'cura' : 'escudo';
            for (const id of ruleTargets) {
              const calc = ruleBreakdown(rule, ctx, targetInfo(id, ''));
              const final = poolAmount(calc.raw, ctx);
              const amount = final.amount;
              if (amount <= 0) continue;
              const pool = isBearer(id)
                ? callbacks.onSelfPool && (() => callbacks.onSelfPool!(kind, amount))
                : callbacks.onTargetPool && (() => callbacks.onTargetPool!(id, kind, amount));
              if (!pool) { manual(`${label}: ${word} ${amount} a ${nameOf(id)}`); continue; }
              const undo = await pool();
              if (!undo) continue;
              result.undos.push(undo);
              result.notes.push(`${label}: ${word} +${amount} a ${nameOf(id)}`);
              result.chips.push({ kind, text: `+${amount} ${kind === 'heal' ? 'PV' : 'escudo'} ${nameOf(id)}`, title: label });
              result.log.push(`${origin}: ${word} a ${nameOf(id)} = ${calc.text} · al aplicar: ${final.text}${rule.duration ? ` · ${rule.duration} t. (quitar a mano al acabar)` : ''}`);
            }
            break;
          }
          const calc = ruleBreakdown(rule, ctx);
          // Maná: hacia abajo, sin poder de curación. Cura / escudo: × poder de curación y escudos, al más cercano.
          const final = rule.kind === 'mana' ? null : poolAmount(calc.raw, ctx);
          const amount = final ? final.amount : Math.floor(calc.value);
          if (amount <= 0) break;
          const word = rule.kind === 'heal' ? 'cura' : rule.kind === 'shield' ? 'escudo' : 'maná';
          if (!callbacks.onSelfPool) { manual(`${label}: ${word} ${amount}`); break; }
          const undo = await callbacks.onSelfPool(rule.kind, amount);
          if (undo) {
            result.undos.push(undo);
            result.notes.push(`${label}: ${word} +${amount}`);
            result.chips.push({ kind: rule.kind, text: `+${amount} ${rule.kind === 'heal' ? 'PV' : rule.kind === 'shield' ? 'escudo' : 'maná'}`, title: `${label} → ${bearerName}` });
            result.log.push(`${origin}: ${word} a ${bearerName} = ${calc.text}${final ? ` · al aplicar: ${final.text}` : amount !== calc.value ? ` → ${amount} (redondeo ↓)` : ''}`);
          }
          break;
        }
        case 'slow': case 'status': {
          if (!callbacks.onApplySourcedEffect || ruleTargets.length === 0) break;
          const name = rule.kind === 'slow' ? `Ralentizado ${formatStat(rule.slowPct ?? 0)}%` : rule.statusName || label;
          const turns = rule.duration ?? duration ?? 1;
          await callbacks.onApplySourcedEffect(ruleTargets, {
            source: `item:${effect.item}`.slice(0, 80),
            name: `${name} (${label})`.slice(0, 80),
            duration: turns,
          });
          result.notes.push(`${label}: ${name}`);
          result.chips.push({ kind: 'debuff', text: `${name} ${ruleTargets.map(nameOf).join(', ')}`, title: label });
          result.log.push(`${origin}: ${name} a ${ruleTargets.map(nameOf).join(', ')} · ${turns} t.`);
          break;
        }
        case 'extra-on-hit':
          extraHits += rule.count ?? 1;
          result.log.push(`${origin}: aplica los efectos de impacto ${rule.count ?? 1} vez/veces más`);
          break;
        case 'vigor': {
          const calc = ruleBreakdown(rule, ctx);
          const amount = Math.floor(calc.value);
          if (amount > 0) {
            result.vigor += amount;
            result.log.push(`${origin}: Vigor extra = ${calc.text} → +${amount}`);
          }
          break;
        }
      }
    }
    return extraHits;
  };

  let extraHits = 0;
  const rangeText = `${bearerName} es ${rangeTypeLabel(ctx.melee === true).toLowerCase()} (rango ${fmt(statNumber(ctx.stats.range))}; cuerpo a cuerpo = rango 1)`;
  for (const effect of effects) {
    const { config } = effect;
    const allRules = config.rules.map((rule, index) => ({ rule, index }));
    // «Solo si» cuerpo a cuerpo / a distancia: las que no valen para el portador ni cuentan (ni ponen CD).
    const armedNow = basicAttack && !!marker(bonuses, `armed:${effect.base}`);
    for (const { rule, index } of allRules) {
      if (rangeOk(rule, ctx)) continue;
      if (!matches(rule.trigger) && !(armedNow && isArmTrigger(rule.trigger))) continue;
      result.log.push(`${effect.name} (${effect.item}): regla ${index + 1} omitida — solo ${rangeConditionShort(rule.onlyIf)} y ${rangeText}`);
    }
    const rules = allRules.filter(({ rule }) => rangeOk(rule, ctx));
    // Siguiente AA potenciado: gasta el marcador (sin mirar el CD, que ya se miró al armarlo).
    if (basicAttack && marker(bonuses, `armed:${effect.base}`)) {
      bonuses = bonuses.filter(bonus => bonus.source !== `armed:${effect.base}`);
      result.changed = true;
      result.log.push(`${effect.name} (${effect.item}): AA potenciado (se gasta el «Tras habilidad» armado)`);
      if (config.cooldown && config.cdStart === 'on-end') {
        bonuses = setMarker(bonuses, 'cooldown', `cd:${effect.base}`, config.cooldown, effect.name);
        result.chips.push({ kind: 'cd', text: `CD ${effect.name} ${config.cooldown} t.` });
        result.log.push(`${effect.name}: CD ${config.cooldown} t. en ${bearerName} (empieza al terminar)`);
      }
      extraHits += await applyRules(effect, rules.filter(({ rule }) => isArmTrigger(rule.trigger)));
    }
    const own = rules.filter(({ rule }) => matches(rule.trigger));
    if (own.length === 0) continue;
    const hasAfterAbility = rules.some(({ rule }) => isArmTrigger(rule.trigger));
    // El CD de un efecto con «Tras habilidad» es el del AA potenciado; el resto lo comparte.
    // Enfriamiento por objetivo: solo los objetivos marcados (sin CD de este portador); el CD se pone en cada uno.
    if (config.cooldown && !hasAfterAbility && config.perTargetCooldown && bearer && callbacks.onTargetBonuses) {
      if (targetIds.length === 0) { result.notes.push(`${effect.name}: sin objetivo marcado`); continue; }
      const source = perTargetCdSource(effect.base, bearer.id);
      const marked = targetIds.filter(id => !marker(participants.find(p => p.id === id)?.bonuses ?? [], source));
      for (const id of targetIds.filter(id => !marked.includes(id))) {
        const left = marker(participants.find(p => p.id === id)?.bonuses ?? [], source)?.turns ?? 0;
        result.notes.push(`${effect.name}: ${nameOf(id)} sin marca (CD ${left} t.)`);
        result.chips.push({ kind: 'cd', text: `${effect.name}: ${nameOf(id)} en CD ${left} t.` });
        result.log.push(`${effect.name} (${effect.item}): ${nameOf(id)} sin marca de ${bearerName} (CD ${left} t. restantes) → no se aplica`);
      }
      if (marked.length === 0) continue;
      const turns = config.cdStart === 'on-end' ? (config.duration ?? 0) + config.cooldown : config.cooldown;
      for (const id of marked) {
        const undo = await callbacks.onTargetBonuses(id, current => setMarker(current, 'cooldown', source, turns, `${effect.name} (de ${bearer.name})`.slice(0, 80)));
        if (undo) result.undos.push(undo);
        result.chips.push({ kind: 'mark', text: `Marca ${effect.name} · ${nameOf(id)} → CD ${turns} t.`, title: 'Marca consumida; el CD queda en ese objetivo' });
        result.log.push(`${effect.name} (${effect.item}): marca de ${bearerName} consumida en ${nameOf(id)} → CD ${turns} t. en ${nameOf(id)}${config.cdStart === 'on-end' ? ` (${config.duration ?? 0} de efecto + ${config.cooldown} de CD)` : ''}`);
      }
      result.notes.push(`${effect.name}: marca de ${marked.map(nameOf).join(', ')} (CD ${turns} t. en el objetivo)`);
      extraHits += await applyRules(effect, own, marked);
      continue;
    }
    if (config.cooldown && !hasAfterAbility) {
      if (cooldownLeft(bonuses, effect.base) > 0) {
        const left = cooldownLeft(bonuses, effect.base);
        result.notes.push(`${effect.name} en CD (${left} t.)`);
        result.chips.push({ kind: 'cd', text: `${effect.name} en CD ${left} t.` });
        result.log.push(`${effect.name} (${effect.item}): en CD en ${bearerName} (${left} t. restantes) → no se aplica`);
        continue;
      }
      const turns = config.cdStart === 'on-end' ? (config.duration ?? 0) + config.cooldown : config.cooldown;
      bonuses = setMarker(bonuses, 'cooldown', `cd:${effect.base}`, turns, effect.name);
      result.changed = true;
      result.chips.push({ kind: 'cd', text: `CD ${effect.name} ${turns} t.` });
      result.log.push(`${effect.name} (${effect.item}): CD ${turns} t. en ${bearerName}${config.cdStart === 'on-end' ? ` (${config.duration ?? 0} de efecto + ${config.cooldown} de CD)` : ''}`);
    }
    extraHits += await applyRules(effect, own);
  }
  // Doble efecto de impacto (Amanecer y anochecer): repite las reglas «Al aplicar efecto de impacto» (no las de solo AA).
  for (let i = 0; i < Math.min(extraHits, 3); i += 1) {
    result.log.push(`— efectos de impacto, repetición ${i + 2} —`);
    for (const effect of effects) {
      const own = effect.config.rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.trigger === 'on-hit' && rule.kind !== 'extra-on-hit' && rangeOk(rule, ctx));
      if (own.length) await applyRules(effect, own);
    }
  }
  if (extraHits) {
    result.notes.push(`efectos de impacto ×${1 + Math.min(extraHits, 3)}`);
    result.chips.push({ kind: 'info', text: `impacto ×${1 + Math.min(extraHits, 3)}` });
  }
  result.bonuses = bonuses;
  return result;
}

/** Marcador de cargas de combate de un efecto (id con variante). */
export const chargesSource = (id: string): string => `charges:${id}`.slice(0, 80);

/**
 * Cargas de combate de los efectos del portador para enseñar: «Flujo de maná 3/4 · recarga en 2t».
 * Sin marcador = las del inicio (aún no ha gastado ninguna en este combate).
 */
export function chargeStatus(effects: ActiveNamedEffect[], bonuses: CombatBonus[] | undefined): { id: string; text: string }[] {
  return effects.filter(effect => effect.config.charges).map(effect => {
    const charges = effect.config.charges!;
    const marker = (bonuses ?? []).find(bonus => bonus.source === chargesSource(effect.id));
    return { id: effect.id, text: chargesText(effect.name, marker ? marker.amount : charges.start, charges.max, marker?.recharge) };
  });
}

/** Texto de los marcadores en la lista de bonus. */
export function markerText(bonus: CombatBonus): string | null {
  if (bonus.stat === 'armed') return `${bonus.label ?? 'Efecto'} armado${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'cooldown') return `CD ${bonus.label ?? 'efecto'}${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'charges') return chargesText(bonus.label ?? 'Cargas', bonus.amount, bonus.maxStacks ?? bonus.amount, bonus.recharge);
  return null;
}
