import type { CombatBonus, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { participantChampion, participantNpc } from '../../data/combatSheet';
import { formulaText, isMeleeRange, rangeConditionShort, rangeTypeLabel, ruleAppliesTo, ruleLolAdAp, ruleMatchesRange, scalingLabel, stacksPerTriggerOf, withLevelCooldown, combatTurns, durationText, lolValue, type EffectBonusConfig, type EffectRule, type ScalingStat } from '../../data/effectBonus';
import { lolToDice } from '../../data/lolDiceTable';
import { withLolStatBonus } from '../../data/lolStatBonus';
import { damageChipKind, fmt, signed, statShort, type ResultChip } from './combatResult';
import { effectiveResistLine } from './combatMitigation';
import type { Item } from '../../data/items';
import { namedEffectBonus, type NamedEffectData } from '../../data/namedEffectDescriptions';
import { baseNamedEffectId, namedEffectName } from '../../data/namedEffects';
import { PLAYERS } from '../../data/players';
import { effectStackKey, isPermanentStackRule } from '../../data/permanentStacks';
import { readStack, readStackValue } from '../../data/stacks';
import { championDamageContext } from '../calculos/championDamage';
import { playerBonusLine, playerTotalLine } from '../calculos/playerTotals';
import { emptyStatLine, formatStat, type StatKey, type StatLine } from '../calculos/statLine';
import { rollDamageStat } from '../players/abilityDamage';
import { bonusLines, chargesText, equippedItems, isStatKey, newBonusId, statTitle } from './combatBonuses';
import { participantHp, participantHpPools, type TargetDamageFn } from './combatHp';
import { askCombatYesNo } from './combatPrompt';
import { applyScaledMr, isEnemyOf, ownedCombatTraits, type AbilityLike } from '../../data/combatTraits';
import { abilityNamedEffects, participantAbilities } from './abilityRules';
import { fullStackBonuses, rollAmpRound } from '../../data/rollAmps';

/**
 * Motor del configurador de bonus de los efectos con nombre (pasivas/activas de ítems) en combate.
 * - Un solo efecto por efecto base (exclusividad): manda el primer ítem equipado que lo tenga.
 * - CD por participante y efecto base: marcador en sus bonus (stat 'cooldown', source cd:<base>, turns).
 * - «Enfriamiento por objetivo»: el CD va en la lista del OBJETIVO (source cd:<base>@<id portador>); sin él, está marcado.
 * - «Tras habilidad»: marcador 'armed' (source armed:<base>, turns = duración); lo gasta el siguiente AA.
 * - Debuffs al objetivo (appliesTo target): bonus negativos en la lista del objetivo (source fx:<base>:<n>).
 * Los marcadores no suman a ninguna stat; caducan con el tick normal de bonus al empezar su turno.
 */

export type ActiveNamedEffect = { id: string; base: string; name: string; item: string; config: EffectBonusConfig; itemCooldown?: number };

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
      if (config && config.rules.length) out.push({ id, base, name: namedEffectName(id), item: item.nombre, config, itemCooldown: typeof item.cooldown === 'number' && item.cooldown > 0 ? item.cooldown : undefined });
    }
  }
  return out;
}

type Stats = Record<string, unknown> & { bonus?: Record<string, unknown> };
/**
 * missingHp: vida faltante del portador (máx. − actual) en combate; fuera de combate no hay.
 * melee: cuerpo a cuerpo (rango de ataque total ≤ 1, el 0 cuenta); si no, a distancia (condición «Solo si» de las reglas).
 */
export type EffectContext = { stats: Stats; level: number; missingHp?: number; melee?: boolean; /** Dano infligido por el disparo (solo reglas "Al infligir dano ..."; ya con armadura/RM y escudos del objetivo aplicados). */ dealt?: number; /** Enemigos distintos golpeados en esta activación (escalado «Enemigos golpeados»). */ enemiesHit?: number; /** Cargas permanentes del efecto que se est\u00e1 aplicando (escalado \u00abCargas permanentes de este efecto\u00bb). */ effectStacks?: number; /** Man\u00e1 actual del portador (escalado \u00abMan\u00e1 actual\u00bb). */ currentMana?: number; /** Campeones enemigos vivos en el combate (solo sugerencia de la pregunta \u00abcerca\u00bb). */ enemyChampions?: number; /** Respuesta a \u00ab\u00bfHay m\u00e1s de un campe\u00f3n enemigo cerca?\u00bb (S\u00ed = suma el +%). */ multiEnemyNearby?: boolean };
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
    case 'dealtDamage': return Math.max(0, ctx.dealt ?? 0);
    case 'enemiesHit': return Math.max(0, ctx.enemiesHit ?? 0);
    case 'effectStacks': return Math.max(0, ctx.effectStacks ?? 0);
    case 'currentMana': return Math.max(0, ctx.currentMana ?? total('mana'));
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

const NO_DICE = new Set<string>(['baseAd', 'bonusAd', 'bonusHp', 'bonusMana', 'bonusArmor', 'bonusMr', 'level', 'missingHp', 'targetMaxHp', 'targetCurrentHp', 'targetMissingHp', 'targetArmor', 'targetMr', 'targetSpe', 'dealtDamage', 'effectStacks', 'currentMana']);

/** Diferencia por rango: factor de la regla para este portador (a distancia = rangedPct %; cuerpo a cuerpo o rango desconocido = 1). */
export function rangedFactor(rule: Pick<EffectRule, 'rangedPct'>, ctx: Pick<EffectContext, 'melee'> | undefined): number {
  if (rule.rangedPct == null || !Number.isFinite(rule.rangedPct) || ctx?.melee !== false) return 1;
  return Math.max(0, rule.rangedPct) / 100;
}

/** " (a distancia 75%)" si la diferencia por rango se aplica. */
export const rangedNote = (rule: Pick<EffectRule, 'rangedPct'>, ctx: Pick<EffectContext, 'melee'> | undefined): string =>
  rangedFactor(rule, ctx) !== 1 ? ` (a distancia ${fmt(rule.rangedPct ?? 100)}%)` : '';

/** Valor de la fórmula + su desarrollo: «60% AD total (35) = 21 + 10 → 31». */
export type RuleBreakdown = { value: number; text: string; /** Sin redondear (curas / escudos: se redondean al aplicar). */ raw: number };

export function ruleBreakdown(rule: EffectRule, ctx: EffectContext, target?: TargetInfo, roll = false): RuleBreakdown {
  const parts: string[] = [];
  let value = 0;
  const lolAdAp = ruleLolAdAp(rule);
  if (lolAdAp && !rule.perLevel?.length) {
    value = lolAdAp.value;
    parts.push(`${fmt(lolAdAp.value)} ${lolAdAp.stat.toUpperCase()} del LoL`);
  } else if (rule.perLevel?.length) {
    // «Por nivel del objetivo» (Medallón, Redención…): el nivel de cada objetivo; si no se sabe, el del portador.
    const fromTarget = rule.levelFrom === 'target' && typeof target?.level === 'number';
    const level = fromTarget ? target!.level! : ctx.level;
    // Escala LoL: el fijo / por nivel se escribi\u00f3 con n\u00fameros del LoL; aqu\u00ed / 10 (sin redondear: redondea el total como siempre).
    value = lolValue(rule, rule.perLevel[Math.min(rule.perLevel.length, Math.max(1, level)) - 1] ?? 0);
    parts.push(`${fmt(value)} (nivel ${level}${fromTarget ? ' del objetivo' : ''})`);
  } else if (rule.flat) {
    value = lolValue(rule, rule.flat);
    parts.push(fmt(value));
  }
  if (rule.dice && !lolAdAp) {
    try {
      const rolled = rollDamageStat(rule.dice);
      const expected = rolled.flat + rolled.groups.reduce((sum, group) => sum + group.sign * group.count * (group.sides + 1) / 2, 0);
      const add = roll ? rolled.total : expected;
      value += add;
      const diceText = roll
        ? `${rule.dice} 🎲 [${rolled.groups.flatMap(group => group.rolls.map(n => (group.sign < 0 ? '−' : '') + String(n))).join(', ')}${rolled.flat ? (rolled.flat > 0 ? `+${rolled.flat}` : rolled.flat) : ''}] = ${fmt(add)}`
        : `${rule.dice} (media ${fmt(expected)})`;
      parts.push(diceText);
    } catch {
      parts.push(`${rule.dice} (tirada no válida)`);
    }
  }
  for (const ratio of rule.ratios ?? []) {
    if (ratio.stat === 'enemiesHit') continue;
    const base = scalingValue(ratio.stat, ctx, target, roll);
    const add = (ratio.pct / 100) * base;
    value += add;
    const raw = ctx.stats[SCALING_KEY[ratio.stat] ?? ratio.stat];
    const diced = roll && !NO_DICE.has(ratio.stat) && typeof raw === 'string' && /d/i.test(raw) ? ` 🎲 ${raw}` : '';
    parts.push(`${fmt(ratio.pct)}% ${scalingLabel(ratio.stat)} (${fmt(base)}${diced}) = ${fmt(add)}`);
  }
  if (rule.missingHpScalePct && target && target.max > 0) {
    const frac = Math.max(0, Math.min(1, (target.max - target.current) / target.max));
    const before = value;
    value = value * (1 + (rule.missingHpScalePct / 100) * frac);
    parts.push(`vida faltante ${fmt(frac * 100)}% → × ${fmt(1 + (rule.missingHpScalePct / 100) * frac)} (${fmt(before)} → ${fmt(value)})`);
  }
  const ranged = rangedFactor(rule, ctx);
  if (ranged !== 1) {
    const before = value;
    value = value * ranged;
    parts.push(`a distancia ${fmt(rule.rangedPct ?? 100)}% (${fmt(before)} \u2192 ${fmt(value)})`);
  }
  if (rule.multiEnemyChampionPct && ctx.multiEnemyNearby === true) {
    const before = value;
    value = value * (1 + rule.multiEnemyChampionPct / 100);
    parts.push(`m\u00e1s de un campe\u00f3n enemigo cerca +${fmt(rule.multiEnemyChampionPct)}% (${fmt(before)} \u2192 ${fmt(value)})`);
  }
  // Enemigos golpeados: multiplica todo lo anterior por los enemigos golpeados (× %); sin nada más, el % es el valor por enemigo.
  const hitPct = (rule.ratios ?? []).reduce((sum, ratio) => sum + (ratio.stat === 'enemiesHit' ? ratio.pct : 0), 0);
  let hitNote = '';
  if (hitPct) {
    const n = Math.max(0, Math.floor(ctx.enemiesHit ?? 0));
    const word = `${n} enemigo${n === 1 ? '' : 's'} golpeado${n === 1 ? '' : 's'}`;
    if (parts.length === 0) {
      value = hitPct * n;
      parts.push(`${fmt(hitPct)} × ${word} = ${fmt(value)}`);
    } else {
      const before = value;
      value = value * (hitPct / 100) * n;
      hitNote = ` · × ${word}${hitPct !== 100 ? ` × ${fmt(hitPct)}%` : ''} (${fmt(before)} → ${fmt(value)})`;
    }
  }
  const total = Math.round(value * 100) / 100;
  const text = parts.length === 0 ? '0' : parts.length === 1 ? parts[0] : `${parts.join(' + ')} → total ${fmt(total)}`;
  return { value: total, text: hitNote ? `${text}${hitNote}` : text, raw: value };
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
export type BearerContext = { ctx: EffectContext; items: Item[]; /** Reglas de sus habilidades (como efectos con nombre). */ abilityEffects: ActiveNamedEffect[] };

/** Efectos con reglas del portador: los de sus ítems + los de sus habilidades aprendidas. */
export const bearerEffects = (context: BearerContext, data: NamedEffectData): ActiveNamedEffect[] =>
  [...activeNamedEffects(context.items, data), ...context.abilityEffects];

export function participantContext(participant: CombatParticipant, level: number, extra: StatLine[] = bonusLines(participant)): BearerContext | null {
  const context = baseParticipantContext(participant, level, extra);
  if (!context) return null;
  context.ctx.melee = isMeleeRange(statNumber(context.ctx.stats.range));
  // «Vida faltante» del portador: con su vida del combate en este momento.
  const hp = participantHp(participant);
  if (hp && typeof hp.max === 'number') context.ctx.missingHp = Math.max(0, hp.max - hp.current);
  return context;
}

/** Rango de ataque total de unas stats y si cuenta como cuerpo a cuerpo (rango ≤ 1) o a distancia (rango > 1). */
export function rangeInfo(stats: Record<string, unknown>): { range: number; melee: boolean } {
  const range = statNumber(stats.range);
  return { range, melee: isMeleeRange(range) };
}

/** ¿Cuerpo a cuerpo? Rango de ataque total (base + ítems + bonus del combate) ≤ 1 (el 0 cuenta). */
export function isMelee(participant: CombatParticipant, level: number, extra?: StatLine[]): boolean {
  return participantContext(participant, level, extra)?.ctx.melee === true;
}

/** ¿La regla se aplica a este portador? (condición «Solo cuerpo a cuerpo» / «Solo a distancia»). */
const rangeOk = (rule: EffectRule, ctx: EffectContext): boolean => ruleMatchesRange(rule, ctx.melee === true);

function baseParticipantContext(participant: CombatParticipant, level: number, extra: StatLine[]): BearerContext | null {
  const context = itemContext(participant, level, extra);
  const owned = participantAbilities(participant, level);
  const player = participant.kind === 'player' ? PLAYERS.find(entry => entry.name === participant.sourceId) : undefined;
  return context ? { ...context, abilityEffects: abilityNamedEffects(owned, { playerStacks: player?.stacks, bonuses: participant.bonuses, level }) } : null;
}

function itemContext(participant: CombatParticipant, level: number, extra: StatLine[]): { ctx: EffectContext; items: Item[] } | null {
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
  if (npc) {
    const stats = withNumericBonuses({ ...(npc.stats ?? {}) }, extra);
    const hp = participantHp(participant);
    const abilities = (npc.abilities ?? []) as AbilityLike[];
    if (typeof stats.mr === 'number' && hp?.max) {
      stats.mr = applyScaledMr(stats.mr, abilities, hp.current, hp.max);
    }
    return { ctx: { stats: stats as Stats, level: typeof npc.level === 'number' ? npc.level : 1 }, items: [] };
  }
  return null;
}

/** Suma bonus numéricos del combate (CA, MR con decimales, etc.) a las stats del NPC, sin tocar dados. */
function withNumericBonuses(base: Record<string, unknown>, extra: StatLine[]): Record<string, unknown> {
  if (!extra.length) return base;
  const stats = { ...base };
  for (const line of extra) {
    for (const [key, raw] of Object.entries(line)) {
      const add = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(add) || add === 0) continue;
      const current = stats[key];
      if (typeof current === 'string' && /d/i.test(current)) continue;
      const parsed = typeof current === 'number' ? current : Number(current);
      const start = Number.isFinite(parsed) ? parsed : (current == null || current === '' ? 0 : null);
      if (start == null) continue;
      stats[key] = Math.round((start + add) * 1000) / 1000;
    }
  }
  return stats;
}

/** Líneas de stats de las reglas «Siempre» (al portador): se suman a los bonus del combate. */
export function alwaysOnLines(effects: ActiveNamedEffect[], ctx: EffectContext): StatLine[] {
  const lines: StatLine[] = [];
  for (const effect of effects) {
    for (const rule of effect.config.rules) {
      if (rule.trigger !== 'always' || rule.appliesTo === 'target' || rule.permanent || !STAT_KINDS.has(rule.kind) || !rangeOk(rule, ctx)) continue;
      const stat = ruleStat(rule);
      if (!stat) continue;
      const lol = ruleLolAdAp(rule);
      if (lol) {
        if (!lol.value) continue;
        const line = emptyStatLine();
        const converted = lolToDice(lol.stat, Math.max(0, lol.value));
        line[stat] = converted?.text ?? '0';
        withLolStatBonus(line, { [lol.stat]: lol.value });
        lines.push(line);
        continue;
      }
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
    const stored = readStackValue(stacks, effectStackKey(effect.id));
    const count = Math.trunc(stored);
    if (!stored) continue;
    for (const rule of effect.config.rules) {
      if (!isPermanentStackRule(rule) || rule.counterOnly || !rangeOk(rule, ctx)) continue;
      const stat = ruleStat(rule);
      if (!stat) continue;
      if (!rule.stackValue && !count) continue;
      // «Guarda el valor calculado»: lo guardado ya es el bonus (hacia abajo; % con 2 decimales).
      const used = rule.stackValue ? Math.min(stored, rule.maxStacks ?? stored) : Math.min(count, rule.maxStacks ?? count);
      const lol = ruleLolAdAp(rule);
      if (lol) {
        const total = rule.stackValue ? Math.round(used * 1000) / 1000 : Math.round(lol.value * used * 1000) / 1000;
        if (!total) continue;
        const line = emptyStatLine();
        const converted = lolToDice(lol.stat, Math.max(0, total));
        line[stat] = converted?.text ?? '0';
        withLolStatBonus(line, { [lol.stat]: total });
        lines.push(line);
        continue;
      }
      const amount = rule.stackValue ? (/Pct$/.test(stat) ? Math.round(used * 100) / 100 : Math.floor(used)) : ruleAmount(rule, ctx) * used;
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
/** In combat, these lines are passed to playerTotalLine as `extra`. Do not also pass itemPermanentStackSources there or stacks would count twice. */
export function combatExtraLines(participant: CombatParticipant, level: number, data: NamedEffectData): StatLine[] {
  const extra = bonusLines(participant);
  const base = participantContext(participant, level, extra);
  if (!base) return extra;
  const effects = bearerEffects(base, data);
  // Cargas al maximo por rondas (Creagrietas): omnisuccion como bonus del combate (la usa la curacion por dano hecho).
  const fullStack = fullStackBonuses(base.items, rollAmpRound(), base.ctx.melee === true).map(bonus => {
    const line = emptyStatLine();
    line.omnivampPct = bonus.omnivampPct;
    return line;
  });
  return [...extra, ...alwaysOnLines(effects, base.ctx), ...permanentStackLines(effects, base.ctx, playerPermanentStacks(participant)), ...fullStack];
}

const marker = (bonuses: CombatBonus[], source: string) => bonuses.find(bonus => bonus.source === source);
export const cooldownLeft = (bonuses: CombatBonus[] | undefined, base: string): number => marker(bonuses ?? [], `cd:${base}`)?.turns ?? 0;

/** Source del CD por objetivo de un portador (va en los bonus del objetivo). */
export const perTargetCdSource = (base: string, bearerId: string): string => `cd:${base}@${bearerId}`.slice(0, 80);

/**
 * «Cada AA reduce el CD»: baja by turnos del CD del portador (cd:<efecto>). Admite decimales: los turnos quedan
 * redondeados hacia arriba y la parte ya gastada va en cdCut. A 0 o menos, se quita (disponible). null si no está en CD.
 */
export function reduceCooldownOnAttack(bonuses: CombatBonus[], base: string, by: number): { bonuses: CombatBonus[]; before: number; after: number } | null {
  const cd = marker(bonuses, `cd:${base}`);
  if (!cd || typeof cd.turns !== 'number' || !(by > 0)) return null;
  const before = Math.round((cd.turns - (cd.cdCut ?? 0)) * 1000) / 1000;
  const left = Math.round((before - by) * 1000) / 1000;
  if (left <= 0) return { bonuses: bonuses.filter(bonus => bonus !== cd), before, after: 0 };
  const turns = Math.ceil(left);
  const cut = Math.round((turns - left) * 1000) / 1000;
  const { cdCut: _old, ...rest } = cd;
  return { bonuses: bonuses.map(bonus => (bonus === cd ? { ...rest, turns, ...(cut > 0 ? { cdCut: cut } : {}) } : bonus)), before, after: left };
}

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
    for (const effect of bearerEffects(context, data)) {
      if (!effect.config.perTargetCooldown || !(effect.config.cooldown || effect.config.cooldownByLevel?.length)) continue;
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
    // Decae durante la duración: guarda el valor entero y los turnos totales (tickCombatTrackers lo baja).
    ...(rule.decays && !rule.permanent && turns ? { decayFrom: amount, decayTurns: turns } : {}),
    source,
    label,
    ...(ruleLolAdAp(rule) ? { lol: true } : {}),
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
    const config = ctx ? withLevelCooldown(effect.config, ctx.level) : effect.config;
    // Con ctx: solo si alguna regla «Tras habilidad» vale para el portador (cuerpo a cuerpo / a distancia).
    if (!config.rules.some(rule => rule.trigger === trigger && (!ctx || rangeOk(rule, ctx)))) continue;
    if (cooldownLeft(next, effect.base) > 0) continue;
    next = setMarker(next, 'armed', `armed:${effect.base}`, combatTurns(config.duration ?? 1), effect.name);
    if (config.cooldown && config.cdStart !== 'on-end' && config.cdStart !== 'on-break') next = setMarker(next, 'cooldown', `cd:${effect.base}`, config.cooldown, effect.name);
    names.push(effect.name);
  }
  return { bonuses: next, names };
}

/** Reservas: cura / escudo / man\u00e1 / vida temporal ('temp' admite negativo: refresco de una concesi\u00f3n). */
export type PoolKind = 'heal' | 'shield' | 'shield-magic' | 'shield-physical' | 'mana' | 'temp';
/** noReceived: no aplicar la curación y escudos recibidos % de quien recibe (robo de vida / omnivamp.: ya la llevan en su %). */
export type PoolOpts = { noReceived?: boolean };
/** Escudo generico (bloquea todo), magico (solo dano magico) o fisico (solo dano fisico). */
export const isShieldKind = (kind: string): boolean => kind === 'shield' || kind === 'shield-magic' || kind === 'shield-physical';
export const shieldWord = (kind: string): string => (kind === 'shield-magic' ? 'escudo m\u00e1gico' : kind === 'shield-physical' ? 'escudo f\u00edsico' : 'escudo');
/** Concesiones de las reglas \u00abVida temporal\u00bb: bonus buff con lo que queda de lo concedido y sus turnos. */
export const TEMP_HP_PREFIX = 'temphp:';
export const isTempGrant = (bonus: CombatBonus): boolean => bonus.stat === 'buff' && (bonus.source ?? '').startsWith(TEMP_HP_PREFIX);

export type EffectCallbacks = {
  onTargetDamage?: TargetDamageFn;
  /** Cambia los bonus de otro participante (debuffs); devuelve su Deshacer. */
  onTargetBonuses?: (targetId: string, update: (current: CombatBonus[]) => CombatBonus[]) => Promise<(() => Promise<void>) | null>;
  onApplySourcedEffect?: (targetIds: string[], input: SourcedEffectInput) => void | Promise<void>;
  /** «Objetivo + cercanos»: elegir el objetivo principal y los enemigos de alrededor (principal ya marcado). */
  pickArea?: (primaryId: string, effectName: string) => Promise<string[]>;
  /** «Rebota a enemigos adicionales (cargas)»: elegir el principal + hasta max - 1 adicionales (max = cargas). */
  pickBounce?: (primaryId: string, effectName: string, max: number) => Promise<string[]>;
  /** Cura / escudo / maná al portador; devuelve su Deshacer. */
  onSelfPool?: (kind: PoolKind, amount: number, opts?: PoolOpts) => Promise<(() => Promise<void>) | null>;
  /** Cura / escudo a otro participante (reglas «Aliados»); devuelve su Deshacer. */
  onTargetPool?: (targetId: string, kind: Exclude<PoolKind, 'mana'>, amount: number, opts?: PoolOpts) => Promise<(() => Promise<void>) | null>;
  /** Reglas «Aliados»: elegir a quién (el portador puede ir incluido). */
  pickAllies?: (effectName: string) => Promise<string[]>;
  /**
   * Cargas permanentes: +N cargas del efecto (id con variante) en la ficha del portador (players.stacks effect:<id>, hasta max).
   * Devuelve antes / después y su Deshacer; null si el portador no tiene ficha (campeón / NPC).
   */
  onPermanentStack?: (base: string, max: number | undefined, gain?: number, opts?: { value?: boolean }) => Promise<{ before: number; after: number; undo: () => Promise<void> } | null>;
  /** Concede una acción extra de habilidad o de AA este turno. */
  onGrantAction?: (kind: 'abilities' | 'attacks', amount: number) => Promise<void>;
  /** ¿El jugador ha marcado crítico en esta acción? */
  critical?: boolean;
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
  const needsEnemies = rules.some(rule => rule.trigger === 'on-use' && (['target', 'area', 'nearby'].includes(ruleAppliesTo(rule)) || (rule.ratios ?? []).some(ratio => ratio.stat === 'enemiesHit')));
  const limits = effects.map(effect => effect.config.maxTargets).filter((n): n is number => typeof n === 'number' && n > 0);
  return { authoritative, needsEnemies, ...(limits.length ? { maxTargets: Math.min(...limits) } : {}) };
}

/** ¿Es una regla «Tras habilidad» / «Tras usar» (arma el siguiente AA)? */
const isArmTrigger = (trigger: string): boolean => trigger === 'after-ability' || trigger === 'after-use';

/** Estados «Vulnerable» de reglas (source vuln:<efecto>): el objetivo recibe +valor% de da\u00f1o de todas las fuentes. */
export const VULNERABLE_PREFIX = 'vuln:';

/** Contador de cargas \u00absolo contador\u00bb en el combate (portadores sin ficha: campeones / NPC). */
export const COMBAT_STACK_PREFIX = 'pstack:';

/** Contador \u00abRequiere N aplicaciones al mismo objetivo\u00bb: en el objetivo, source hits:<efecto>:<portador>. */
export const HITS_PREFIX = 'hits:';
/** Misma acci\u00f3n: aplicaciones al mismo objetivo a menos de esto del anterior cuentan como una (instancia de lanzamiento). */
const HIT_DEDUPE_MS = 2500;
const hitDedupe = new Map<string, number>();

export type EffectTriggerName = 'on-attack' | 'on-hit' | 'on-ability-hit' | 'on-ability-damage' | 'on-cc' | 'on-deal-any' | 'on-deal-physical' | 'on-deal-magic' | 'on-deal-true' | 'on-deal-or-cc' | 'on-use' | 'on-takedown' | 'hp-below' | 'on-damage-taken' | 'on-attacked' | 'each-turn' | 'energized-max' | 'on-ultimate-use' | 'on-enemy-ultimate-use' | 'combat-start' | 'combat-entry' | 'when-ready' | 'on-survived-hit' | 'on-death';

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
export function vigorChainTargets(items: Item[], data: NamedEffectData, level?: number): number {
  let chain = 1;
  for (const item of items) {
    for (const id of item.namedEffects ?? []) {
      const config = namedEffectBonus(data, id);
      const byLevel = config?.chainTargetsByLevel;
      // \u00abSeg\u00fan nivel\u00bb (Statikk): el valor del nivel del portador (sin nivel = el del 1); si no, el n\u00famero fijo.
      const n = byLevel?.length ? byLevel[Math.min(byLevel.length, Math.max(1, Math.floor(level ?? 1))) - 1] ?? 1 : config?.chainTargets ?? 1;
      chain = Math.max(chain, Math.min(10, n));
    }
  }
  return chain;
}

/** \u00bfAlg\u00fan efecto de sus \u00edtems hace que los secundarios del Vigor encadenado reciban los efectos de impacto? (Statikk) */
export function vigorChainOnHit(items: Item[], data: NamedEffectData): boolean {
  return items.some(item => (item.namedEffects ?? []).some(id => !!namedEffectBonus(data, id)?.chainOnHit));
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
/**
 * Curación por daño hecho: omnivampirismo % (todo el daño) + robo de vida % (solo si lifeSteal: AA, regla con
 * «Aplica robo de vida», o habilidad con esa opción × efficacy % de eficacia). Una cura, sin poder de curación
 * y escudos (como el robo de vida), redondeo al más cercano. null si no tiene ninguno de los dos.
 */
export async function vampHeal(options: { dealt: number; ctx: EffectContext; lifeSteal: boolean; lifeStealEfficacy?: number; onSelfPool?: EffectCallbacks['onSelfPool']; origin: string; bearerName: string }): Promise<{ heal: number; word: string; log: string[]; chips: ResultChip[]; undo?: () => Promise<void> } | null> {
  const { dealt, ctx, onSelfPool, origin, bearerName } = options;
  const efficacy = options.lifeSteal && options.lifeStealEfficacy != null ? options.lifeStealEfficacy : 100;
  // Curación y escudos recibidos % (Semblante espiritual): sube el % de robo de vida y omnisucción del portador; la cura no se vuelve a multiplicar.
  const recPct = receivedPct(ctx.stats);
  const recF = 1 + recPct / 100;
  const lsStat = statNumber(ctx.stats.lifeStealPct) * recF;
  const ls = options.lifeSteal ? lsStat * (efficacy / 100) : 0;
  const ov = statNumber(ctx.stats.omnivampPct) * recF;
  if (!(dealt > 0) || (ls <= 0 && ov <= 0)) return null;
  const lsPart = ls > 0 ? (options.lifeSteal && efficacy !== 100 ? `robo de vida ${fmt(lsStat)}% × ${fmt(efficacy)}% eficacia = ${fmt(ls)}%` : `robo de vida ${fmt(ls)}%`) : '';
  const parts = [lsPart, ov > 0 ? `omnivampirismo ${fmt(ov)}%` : ''].filter(Boolean);
  const word = ls > 0 && ov > 0 ? 'robo de vida + omnivamp.' : ls > 0 ? 'robo de vida' : 'omnivamp.';
  const final = poolAmount((dealt * (ls + ov)) / 100, ctx, false);
  const heal = final.amount;
  const undo = heal > 0 && onSelfPool ? await onSelfPool('heal', heal, { noReceived: true }) : null;
  const chips: ResultChip[] = heal > 0 ? [{ kind: undo ? 'heal' : 'manual', text: `+${heal} PV ${ls > 0 && ov > 0 ? 'RV+OV' : ls > 0 ? 'RV' : 'OV'}${undo ? '' : ' a mano'}`, title: `${parts.join(' + ')} → ${bearerName}` }] : [];
  const log = [`${origin}: ${parts.join(' + ')} = ${fmt(dealt)} de daño × ${fmt(ls + ov)}% = ${final.text} (sin poder de curación y escudos${recPct ? `; robo de vida / omnivamp. × ${fmt(recF)} por curación y escudos recibidos ${fmt(recPct)}%` : ''}) → ${heal > 0 ? `cura ${heal} a ${bearerName}${undo ? '' : ' (a mano / vida al máximo)'}` : 'nada'}`];
  return { heal, word, log, chips, ...(undo ? { undo } : {}) };
}

/** Curación y escudos recibidos % de quien recibe (Semblante espiritual): no es poder de quien cura; multiplica aparte. */
export function receivedPct(stats: Record<string, unknown> | undefined): number {
  return stats ? Math.max(-100, statNumber(stats.healShieldReceivedPct)) : 0;
}

/** " × 1,25 (curación y escudos recibidos 25%)"; vacío sin el stat. */
export function receivedText(pct: number): string {
  return pct ? ` × ${fmt(1 + pct / 100)} (curación y escudos recibidos ${fmt(pct)}%)` : '';
}

/** receiver: stats de quien lo recibe (curación y escudos recibidos %, multiplicativo tras el poder de quien cura; un solo redondeo). */
export function poolAmount(raw: number, ctx: EffectContext, usePower = true, receiver?: Record<string, unknown>): { amount: number; text: string } {
  const pct = usePower ? statNumber(ctx.stats.healShieldPct) : 0;
  const rec = receivedPct(receiver);
  const powered = raw * (1 + pct / 100);
  const boosted = powered * (1 + rec / 100);
  const amount = Math.round(boosted);
  const exact = Math.round(raw * 1000) / 1000;
  const power = pct ? ` × ${fmt(1 + pct / 100)} (poder de curación y escudos ${fmt(pct)}%) = ${fmt(Math.round(powered * 1000) / 1000)}` : usePower ? ' (sin poder de curación y escudos)' : '';
  const received = rec ? `${receivedText(rec)} = ${fmt(Math.round(boosted * 1000) / 1000)}` : '';
  return { amount, text: `${fmt(exact)}${power}${received} → ${amount} (redondeo al más cercano)` };
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
  /** \u00abAl matar / asistir\u00bb: el derrotado (para \u00abSolo derribos de campeones\u00bb). */
  takedownOf?: string;
  /** Habilidad: ¿ha hecho daño a algún enemigo? (false = no gasta cargas de combate). Ausente = sí. */
  damaged?: boolean;
  /** Daño que acaba de recibir el portador (reglas on-damage-taken con fromDamagePct). */
  incomingDamage?: number;
  /** on-cc: ¿el control aplicado inmoviliza? (las reglas «Solo inmovilizaciones» lo necesitan). */
  ccImmobilizing?: boolean;
  /** on-cc: \u00bfel control es una ralentizaci\u00f3n? (\u00ab...o ralentizar si es cuerpo a cuerpo\u00bb). */
  ccSlow?: boolean;
}): Promise<EffectFireResult> {
  const { trigger, effects, ctx: ctxIn, targetIds, participants, level, callbacks, bearer } = options;
  // Copia: effectStacks cambia por efecto (escalado \u00abCargas permanentes de este efecto\u00bb).
  const ctx: EffectContext = { ...ctxIn };
  const incomingDamage = options.incomingDamage ?? 0;
  const basicAttack = trigger === 'on-hit' && options.basicAttack !== false;
  const matches = (ruleTrigger: string) => ruleTrigger === trigger || (basicAttack && ruleTrigger === 'on-attack');
  let bonuses = [...(options.bonuses ?? [])];
  const result: EffectFireResult = { bonuses, changed: false, notes: [], undos: [], kills: [], manual: [], vigor: 0, chips: [], log: [] };
  // «Cada AA reduce el CD»: un AA (on-hit de ataque básico) baja el CD del portador de esos efectos (antes de mirar sus reglas).
  if (basicAttack) {
    const seen = new Set<string>();
    for (const effect of effects) {
      const by = effect.config.cooldownReducedOnAttack;
      if (!by || !(by > 0) || seen.has(effect.base)) continue;
      seen.add(effect.base);
      const cut = reduceCooldownOnAttack(bonuses, effect.base, by);
      if (!cut) continue;
      bonuses = cut.bonuses;
      result.changed = true;
      result.log.push(`CD de ${effect.name}: ${fmt(cut.before)} → ${fmt(cut.after)} (AA)${cut.after <= 0 ? ' · disponible' : ''}`);
      result.chips.push({ kind: 'cd', text: `CD ${effect.name} ${Math.ceil(cut.before)}→${Math.ceil(cut.after)} (AA)`, title: `Cada AA reduce el CD ${fmt(by)} t.` });
    }
  }
  const nameOf = (id: string) => participants.find(p => p.id === id)?.name ?? id;
  /** \u00bfNo campe\u00f3n? (NPC / monstruo / personalizado: ni campe\u00f3n ni player). */
  // Cargas permanentes por efecto: ficha del player (players.stacks) o, sin ficha, el contador del combate (pstack:<id>).
  const stackCounts = new Map<string, number>();
  const bearerEntry = bearer ? participants.find(p => p.id === bearer.id) : undefined;
  if (bearerEntry) {
    // Man\u00e1 actual: ficha del player (actualMana) o el recurso del combate; sin dato, el man\u00e1 total.
    const sheet = bearerEntry.kind === 'player' ? PLAYERS.find(entry => entry.name === bearerEntry.sourceId) : undefined;
    const mana = sheet ? (sheet.actualMana ?? sheet.mana) : bearerEntry.currentResource;
    if (ctx.currentMana === undefined && typeof mana === 'number' && Number.isFinite(mana)) ctx.currentMana = mana;
    ctx.enemyChampions = participants.filter(p => !p.defeated && (p.kind === 'champion' || p.kind === 'player') && isEnemyOf(p, bearerEntry) && (participantHp(p)?.current ?? 1) > 0).length;
  }
  const effectStackCount = (effect: ActiveNamedEffect): number => {
    const known = stackCounts.get(effect.id);
    if (known !== undefined) return known;
    const stored = bearerEntry ? Math.trunc(readStackValue(playerPermanentStacks(bearerEntry), effectStackKey(effect.id))) : 0;
    const combat = Number(bonuses.find(bonus => bonus.source === `${COMBAT_STACK_PREFIX}${effect.id}`)?.amount ?? 0);
    return Math.max(0, stored || combat || 0);
  };
  const isNonChampion = (id: string) => { const kind = participants.find(p => p.id === id)?.kind; return !!kind && kind !== 'champion' && kind !== 'player'; };
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

  // Escalado «Enemigos golpeados»: enemigos distintos de esta activación (con «Objetivo + cercanos» en el efecto, los elegidos de la zona; sin el portador).
  const enemiesHitOf = async (effect: ActiveNamedEffect, targets: string[]): Promise<number> => {
    const hasArea = effect.config.rules.some(other => { const to = ruleAppliesTo(other); return to === 'area' || to === 'nearby'; });
    const ids = hasArea && targets.length ? [...targets, ...(await areaTargets(effect, targets))] : targets;
    return new Set(ids.filter(id => !isBearer(id))).size;
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
  // \u00abSolo inmovilizaciones\u00bb (+ \u00ab...o ralentizar si cuerpo a cuerpo\u00bb) y \u00abSolo si el objetivo es un campe\u00f3n\u00bb.
  const ccGateOk = (rule: EffectRule) => !(rule.trigger === 'on-cc' && rule.ccImmobilizeOnly) || !!options.ccImmobilizing || (!!rule.ccSlowIfMelee && !!options.ccSlow && ctx.melee === true);
  const championTargets = (ids: string[]) => ids.filter(id => !isBearer(id) && participants.some(p => p.id === id) && !isNonChampion(id));

  const nearbyAnswers = new Map<string, boolean>();
  let procCooldown = false;
  const applyRules = async (effect: ActiveNamedEffect, rules: { rule: EffectRule; index: number }[], targets: string[] = targetIds): Promise<number> => {
    let extraHits = 0;
    // Cargas permanentes por efecto y disparo (stacksPerTrigger de la regla, por defecto 1; aunque tenga varias reglas de cargas).
    const permanentDone = new Set<string>();
    const duration = effect.config.duration;
    const label = effect.name;
    const origin = `${label} (${effect.item})`;
    for (const { rule, index } of rules) {
      if (!ccGateOk(rule)) {
        if (options.ccSlow) result.log.push(`${origin}: ralentizar solo cuenta si ${bearerName} es cuerpo a cuerpo \u2192 no se aplica`);
        continue;
      }
      if (rule.trigger === 'on-takedown' && rule.championTakedownOnly && options.takedownOf && isNonChampion(options.takedownOf)) {
        result.log.push(`${origin}: ${nameOf(options.takedownOf)} no es un campe\u00f3n \u2192 no cuenta`);
        continue;
      }
      ctx.effectStacks = effectStackCount(effect);
      const source = `fx:${effect.base}:${index}`;
      const to = ruleAppliesTo(rule);
      // «Objetivo + cercanos» (Hendidura): se eligen el objetivo y los enemigos de alrededor (una vez por efecto).
      // «Solo cercanos»: los mismos sin el objetivo principal. «Aliados»: se eligen aparte (portador incluido si se marca).
      let ruleTargets = targets;
      if (rule.championTargetsOnly) {
        const champs = championTargets(targets);
        if (!champs.length) { result.log.push(`${origin}: ning\u00fan objetivo es un campe\u00f3n \u2192 no se aplica`); continue; }
        ruleTargets = champs;
      }
      // \u00ab+% si hay m\u00e1s de un campe\u00f3n enemigo cerca\u00bb: se pregunta al aplicar (una vez por efecto y disparo; Escape = No).
      ctx.multiEnemyNearby = undefined;
      if (rule.multiEnemyChampionPct) {
        let yes = nearbyAnswers.get(effect.base);
        if (yes === undefined) {
          const pct = fmt(rule.multiEnemyChampionPct);
          const alive = ctx.enemyChampions;
          yes = await askCombatYesNo({
            title: `${label}: \u00bfhay m\u00e1s de un campe\u00f3n enemigo cerca de ${bearerName}?`,
            body: `S\u00ed = +${pct}% (en el LoL, a 1200 u. o menos).${alive !== undefined ? ` Campeones enemigos vivos en el combate: ${alive}.` : ''}`,
            yesLabel: `S\u00ed (+${pct}%)`,
            noLabel: 'No',
            suggestYes: (alive ?? 0) > 1,
          });
          nearbyAnswers.set(effect.base, yes);
          result.log.push(`${origin}: \u00bfm\u00e1s de un campe\u00f3n enemigo cerca? ${yes ? `S\u00ed \u2192 +${pct}%` : 'No'}`);
        }
        ctx.multiEnemyNearby = yes;
      }
      if ((to === 'area' || to === 'nearby') && targets.length > 0) ruleTargets = await areaTargets(effect, targets);
      if (to === 'nearby') ruleTargets = ruleTargets.filter(id => id !== targets[0]);
      if (to === 'allies') {
        ruleTargets = await allyTargets(effect);
        if (ruleTargets.length === 0) { manual(`${label}: elegir aliados (${rule.kind})`); continue; }
        result.log.push(`${origin}: aliados → ${ruleTargets.map(nameOf).join(', ')}`);
      }
      if (to === 'self' && rule.kind === 'status') ruleTargets = bearer ? [bearer.id] : [];
      if ((rule.ratios ?? []).some(ratio => ratio.stat === 'enemiesHit')) {
        ctx.enemiesHit = await enemiesHitOf(effect, targets);
        result.log.push(`${origin}: enemigos golpeados = ${ctx.enemiesHit}${ctx.enemiesHit ? ` (${[...new Set(targets)].map(nameOf).join(', ')}${areaCache.has(effect.base) ? ' + zona' : ''})` : ' (sin objetivos marcados → 0)'}`);
      }
      if (rule.targetHpBelowPct != null && ruleTargets.length) {
        const threshold = rule.targetHpBelowPct;
        ruleTargets = ruleTargets.filter(id => {
          const info = targetInfo(id, '');
          if (!info || !(info.max > 0)) return false;
          return (info.current / info.max) * 100 <= threshold;
        });
        if (ruleTargets.length === 0) {
          result.log.push(`${origin}: ningún objetivo por debajo de ${threshold}% de vida → no se aplica`);
          continue;
        }
      }
      if (rule.pulseEachTurn && trigger === 'each-turn' && bearer) {
        const zone = `zone:${effect.base}:${bearer.id}`;
        ruleTargets = participants.filter(entry => marker(entry.bonuses ?? [], zone)).map(entry => entry.id);
        if (ruleTargets.length === 0) continue;
        result.log.push(`${origin}: zona → ${ruleTargets.map(nameOf).join(', ')}`);
      }
      if (rule.requiresMaxStacks) {
        const atMax = effect.config.rules.some((other, otherIndex) => {
          if (!other.maxStacks || other.triggerAtMax) return false;
          const entry = bonuses.find(bonus => bonus.source === `fx:${effect.base}:${otherIndex}`);
          const stacks = entry?.stacks ?? (entry ? 1 : 0);
          return !!entry && stacks >= other.maxStacks;
        });
        if (!atMax) {
          result.log.push(`${origin}: aún no está al máximo de cargas → no se aplica`);
          continue;
        }
      }
      if (rule.everyN || rule.triggerAtMax) {
        const cap = rule.triggerAtMax ? (rule.maxStacks ?? 1) : rule.everyN!;
        const nextTargets: string[] = [];
        const bumpFor = (key: string) => {
          const found = bonuses.find(bonus => bonus.source === key);
          const next = (found?.amount ?? 0) + 1;
          if (found) {
            bonuses = bonuses.map(bonus => bonus.source === key ? { ...bonus, amount: next >= cap ? 0 : next, stacks: next >= cap ? 0 : next } : bonus);
          } else {
            bonuses = [...bonuses, { id: `cnt-${effect.base}-${index}-${key.length}`, stat: 'buff', amount: next >= cap ? 0 : next, stacks: next >= cap ? 0 : next, source: key, label: `${label} (${next}/${cap})`.slice(0, 80) }];
          }
          result.changed = true;
          return next >= cap;
        };
        if (rule.perTargetCounter && ruleTargets.length) {
          for (const id of ruleTargets) {
            if (bumpFor(`cnt:${effect.base}:${index}:${id}`)) nextTargets.push(id);
          }
          if (nextTargets.length === 0) {
            result.log.push(`${origin}: contador por objetivo (${cap}) aún no se completa`);
            continue;
          }
          ruleTargets = nextTargets;
        } else if (rule.perTargetCounter && ruleTargets.length === 0) {
          continue;
        } else {
          if (!bumpFor(`cnt:${effect.base}:${index}`)) {
            result.log.push(`${origin}: contador ${cap} aún no se completa`);
            continue;
          }
        }
        if (rule.cooldownOnProc) procCooldown = true;
      }
      if (rule.unseenTurns && trigger === 'each-turn' && bearer) {
        if (marker(bonuses, `seen:${effect.base}`)) {
          result.log.push(`${origin}: ha sido visto este turno → no arma la invisibilidad`);
          continue;
        }
        const key = `unseen:${effect.base}`;
        const found = bonuses.find(bonus => bonus.source === key);
        const next = (found?.amount ?? 0) + 1;
        bonuses = found
          ? bonuses.map(bonus => bonus.source === key ? { ...bonus, amount: next } : bonus)
          : [...bonuses, { id: `unseen-${effect.base}`, stat: 'buff', amount: next, source: key, label: `${label} oculto ${next}`.slice(0, 80) }];
        result.changed = true;
        if (next < rule.unseenTurns) {
          result.log.push(`${origin}: ${next}/${rule.unseenTurns} turno(s) sin ser visto`);
          continue;
        }
        bonuses = setMarker(bonuses, 'armed', `armed-item:${effect.base}`, 99, `${effect.name} (AA armado)`);
        result.log.push(`${origin}: invisible y AA armado (${rule.dice || 'daño armado'})`);
      }
      if ((trigger === 'on-damage-taken' || trigger === 'on-attacked') && (rule.unseenTurns || rule.armedTurnsAfterSeen || effect.config.rules.some(entry => entry.unseenTurns))) {
        bonuses = setMarker(bonuses, 'cooldown', `seen:${effect.base}`, 1, `${effect.name} (visto)`);
        bonuses = bonuses.filter(bonus => bonus.source !== `unseen:${effect.base}`);
        if (marker(bonuses, `armed-item:${effect.base}`)) {
          const window = rule.armedTurnsAfterSeen ?? effect.config.rules.find(entry => entry.armedTurnsAfterSeen)?.armedTurnsAfterSeen ?? 2;
          bonuses = setMarker(bonuses, 'armed', `armed-item:${effect.base}`, window, `${effect.name} (visto)`);
          result.log.push(`${origin}: ha sido visto · el AA armado dura ${window} t.`);
        }
        result.changed = true;
      }
      if (rule.kind === 'damage' && effect.config.rules.some(entry => entry.unseenTurns) && trigger === 'on-hit') {
        if (!marker(bonuses, `armed-item:${effect.base}`)) {
          result.log.push(`${origin}: AA no armado (hace falta estar o haber estado invisible)`);
          continue;
        }
      }
      if (STAT_KINDS.has(rule.kind)) {
        const stat = ruleStat(rule);
        if (!stat) continue;
        // Permanente (Yun Tal): sin turnos → no caduca en el combate.
        // -1 = hasta el final del combate: sin turnos (no caduca; se limpia al terminar el combate).
        const rawTurns = rule.duration ?? duration ?? 1;
        const turns = rule.permanent || rawTurns < 0 ? undefined : rawTurns;
        const turnsText = (rule.decays && turns ? 'decae hasta 0 en ' : '') + (turns ? `${turns} t.` : rule.permanent ? 'permanente (sin ficha: solo este combate)' : durationText(-1));
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
          // Solo contador sin ficha (campeones / NPC): la carga va en el combate (pstack:<id>), sin stats.
          if (isPermanentStackRule(rule) && rule.counterOnly && !callbacks.onPermanentStack && !effect.config.charges) {
            if (permanentDone.has(effect.id)) continue;
            permanentDone.add(effect.id);
            const counterSource = `${COMBAT_STACK_PREFIX}${effect.id}`;
            const had = bonuses.find(bonus => bonus.source === counterSource);
            const before = had ? had.amount : effectStackCount(effect);
            const after = Math.min(rule.maxStacks ?? 999, before + stacksPerTriggerOf(rule));
            bonuses = [...bonuses.filter(bonus => bonus.source !== counterSource), { id: had?.id ?? newBonusId(), stat: 'stacks', amount: after, ...(rule.maxStacks ? { maxStacks: rule.maxStacks } : {}), source: counterSource, label }];
            stackCounts.set(effect.id, after);
            result.changed = true;
            result.chips.push({ kind: 'buff', text: `${label} ${before}\u2192${after}`, title: `${label} \u00b7 cargas (solo este combate)` });
            result.log.push(`${origin}: cargas de ${bearerName} ${before} \u2192 ${after}${rule.maxStacks ? `/${rule.maxStacks}` : ''} (solo contador; sin ficha: solo este combate)`);
            continue;
          }
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
              // Máx. 1 por turno: marcador de 1 turno (se quita al empezar el turno del portador).
              const turnSource = chargeTurnSource(effect.id);
              if (charges.perTurn && bonuses.some(bonus => bonus.source === turnSource)) {
                result.chips.push({ kind: 'cd', text: `${label}: ya gastada`, title: `${label}: máx. 1 carga por turno` });
                result.log.push(`${origin}: carga de combate ya gastada este turno (máx. 1 por turno) → no da carga permanente`);
                continue;
              }
              if (left <= 0) {
                result.chips.push({ kind: 'cd', text: chargesText(label, 0, charges.max, current?.recharge), title: `${label}: sin cargas de combate` });
                result.log.push(`${origin}: sin cargas (0/${charges.max}${current?.recharge ? `, recarga en ${current.recharge} t.` : ''}) → no da carga permanente`);
                continue;
              }
              const recharge = current?.recharge ?? charges.every;
              bonuses = [...bonuses.filter(bonus => bonus.source !== source), { id: current?.id ?? newBonusId(), stat: 'charges', amount: left - 1, maxStacks: charges.max, recharge, rechargeEvery: charges.every, source, label }];
              if (charges.perTurn) bonuses = [...bonuses.filter(bonus => bonus.source !== turnSource), { id: newBonusId(), stat: 'buff', amount: 1, turns: 1, source: turnSource, label }];
              result.changed = true;
              result.chips.push({ kind: 'mana', text: chargesText(label, left - 1, charges.max, recharge), title: `${label}: cargas de combate (recarga 1 cada ${charges.every} t.)` });
              result.log.push(`${origin}: gasta 1 carga de combate ${left} → ${left - 1}/${charges.max} · recarga en ${recharge} t. (1 cada ${charges.every} t.)`);
            }
            const gain = stacksPerTriggerOf(rule);
            if (!callbacks.onPermanentStack) { manual(`${label}: +${gain} carga${gain === 1 ? '' : 's'} permanente${gain === 1 ? '' : 's'} (sin ficha)`); continue; }
            // «Guarda el valor calculado»: suma lo de esta activación (stats de ahora: vida máx. antes de ganar) × cargas por activación.
            const stackAdd = rule.stackValue ? (Math.round(calc.raw * 1000) / 1000) * gain : gain;
            if (rule.stackValue && !(stackAdd > 0)) { result.log.push(`${origin}: valor calculado ${calc.text} → no suma`); continue; }
            const saved = await callbacks.onPermanentStack(effect.id, rule.maxStacks, stackAdd, rule.stackValue ? { value: true } : undefined);
            if (saved) stackCounts.set(effect.id, Math.trunc(saved.after));
            if (saved && rule.counterOnly) {
              result.undos.push(saved.undo);
              result.notes.push(`${label}: carga ${saved.after}${rule.maxStacks ? `/${rule.maxStacks}` : ''}`);
              result.chips.push({ kind: 'buff', text: `${label} ${saved.before}\u2192${saved.after}${rule.maxStacks ? `/${rule.maxStacks}` : ''}`, title: `${label} \u00b7 cargas permanentes (ficha; solo contador)` });
              result.log.push(`${origin}: cargas permanentes de ${bearerName} ${saved.before} \u2192 ${saved.after}${rule.maxStacks ? `/${rule.maxStacks}` : ''} (solo contador: no suma stats; guardado en la ficha)`);
              continue;
            }
            if (saved && rule.stackValue) {
              result.undos.push(saved.undo);
              const shown = (n: number) => fmt(Math.round(n * 100) / 100);
              const added = Math.round((saved.after - saved.before) * 1000) / 1000;
              result.notes.push(`${label}: +${shown(added)} ${statTitle(stat)} permanente (total ${shown(saved.after)})`);
              result.chips.push({ kind: 'buff', text: `${label} +${shown(added)} ${statShort(stat)} (total ${shown(saved.after)})`, title: `${label} · ${statTitle(stat)} acumulado (ficha)` });
              result.log.push(`${origin}: ${statTitle(stat)} permanente de ${bearerName} +${calc.text}${gain > 1 ? ` × ${gain}` : ''} → acumulado ${shown(saved.before)} → ${shown(saved.after)}${added < stackAdd ? ' (máx.)' : ''} (guardado en la ficha; suma con el ítem equipado; en la ficha, hacia abajo)`);
              continue;
            }
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
          if (rule.counterOnly) continue;
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
          const hasFormula = !!rule.dice || (rule.flat != null && rule.flat !== 0) || (rule.ratios && rule.ratios.length > 0) || (rule.perLevel && rule.perLevel.length > 0);
          if (!hasFormula) { manual(`${label}: ${rule.note || 'tirar el daño a mano'}`); break; }
          if (!callbacks.onTargetDamage || ruleTargets.length === 0) { manual(`${label}: ${rule.note || 'elegir objetivo del daño'}`); break; }
          // \u00abFijo contra no campeones\u00bb (Statikk: 60 \u2192 90): ese fijo en vez del normal si el objetivo no es campe\u00f3n.
          const vsRule = (id: string): EffectRule => rule.nonChampionFlat != null && !isBearer(id) && isNonChampion(id) ? { ...rule, flat: rule.nonChampionFlat } : rule;
          if (rule.delayTurns) {
            for (const id of ruleTargets) {
              const info = targetInfo(id, '');
              const calc = ruleBreakdown(vsRule(id), ctx, info, true);
              const amount = Math.max(0, Math.ceil(calc.value));
              if (amount <= 0) continue;
              const pending = `pending-dmg:${effect.base}:${id}`;
              bonuses = [...bonuses.filter(bonus => bonus.source !== pending), { id: `pdmg-${id}-${effect.base}`, stat: 'buff', amount, turns: rule.delayTurns, source: pending, label: `${label} → ${nameOf(id)}`.slice(0, 80) }];
              result.changed = true;
              result.log.push(`${origin}: daño ${rule.damageType ?? 'pendiente'} ${amount} a ${nameOf(id)} en ${rule.delayTurns} t. (${calc.text})`);
            }
            if (rule.cooldownOnProc) procCooldown = true;
            break;
          }
          // «Rebota a enemigos adicionales (cargas)» (Eco de Luden): carga 1 = el principal; cada carga m\u00e1s = un enemigo adicional
          // con el mismo da\u00f1o; las que se quedan sin objetivo (el DM elige cu\u00e1ntos hay) suman +X% cada una al principal.
          let bounceFactor: Map<string, number> | null = null;
          if (rule.bounceStacks && rule.bounceStacks >= 2 && ruleTargets.length > 0) {
            const primary = ruleTargets[0];
            const maxExtra = rule.bounceStacks - 1;
            let picked: string[] = [];
            if (callbacks.pickBounce) picked = await callbacks.pickBounce(primary, label, rule.bounceStacks);
            else if (callbacks.pickArea) picked = await callbacks.pickArea(primary, `${label}: hasta ${maxExtra} adicionales`);
            const extra = [...new Set(picked)].filter(id => id !== primary && !isBearer(id)).slice(0, maxExtra);
            const leftover = maxExtra - extra.length;
            const pct = rule.bounceLeftoverPct ?? 20;
            ruleTargets = [primary, ...extra];
            bounceFactor = new Map([[primary, 1 + (pct / 100) * leftover]]);
            result.log.push(`${origin}: ${rule.bounceStacks} cargas \u2192 ${nameOf(primary)}${extra.length ? ` + ${extra.length} adicional(es): ${extra.map(nameOf).join(', ')}` : ' (sin adicionales)'}${leftover ? `; ${leftover} sobrante(s) \u2192 +${fmt(pct * leftover)}% al principal` : ''}`);
          }
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
                const vs = vsRule(id);
                const calc = ruleBreakdown(vs, ctx, info ? { ...info, current: currentHp } : undefined, true);
                const factor = bounceFactor?.get(id) ?? 1;
                const value = calc.value * factor;
                dealt = Math.max(0, Math.ceil(value));
                calcText = `${vs !== rule ? '(no campe\u00f3n) ' : ''}${calc.text}${factor !== 1 ? ` \u00d7 ${fmt(Math.round(factor * 1000) / 1000)} (cargas sobrantes)` : ''}${dealt !== value ? ` → ${fmt(dealt)} (redondeo ↑)` : ''}`;
                return dealt;
              }, { damageType: type, ...(bearer ? { attackerId: bearer.id } : {}), fromRule: true });
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
          // Omnivampirismo (siempre) + robo de vida (solo con «Aplica robo de vida»): cura al portador.
          if (totalDealt > 0) {
            const vamp = await vampHeal({ dealt: totalDealt, ctx, lifeSteal: rule.lifeSteal === true, onSelfPool: callbacks.onSelfPool, origin, bearerName });
            if (vamp) {
              if (vamp.undo) result.undos.push(vamp.undo);
              if (vamp.heal > 0) result.notes.push(`${label}: ${vamp.word} +${vamp.heal}`);
              result.chips.push(...vamp.chips);
              result.log.push(...vamp.log);
            }
          }
          if (totalDealt > 0 && rule.healFromDealtPct) {
            const raw = totalDealt * rule.healFromDealtPct / 100 * rangedFactor(rule, ctx);
            const final = poolAmount(raw, ctx);
            const amount = final.amount;
            if (amount > 0) {
              if (!callbacks.onSelfPool) { manual(`${label}: cura ${amount} (${rule.healFromDealtPct}% del daño)`); }
              else {
                const undo = await callbacks.onSelfPool('heal', amount);
                if (undo) result.undos.push(undo);
                result.notes.push(`${label}: cura +${amount} (${rule.healFromDealtPct}% del daño)`);
                result.chips.push({ kind: 'heal', text: `+${amount} PV`, title: `${label} · ${rule.healFromDealtPct}% del daño` });
                result.log.push(`${origin}: cura ${rule.healFromDealtPct}% de ${fmt(totalDealt)}${rangedNote(rule, ctx)} = ${final.text} → ${bearerName}${undo ? '' : ' (a mano / vida al máximo)'}`);
              }
            }
          }
          if (totalDealt > 0 && rule.cooldownOnProc) procCooldown = true;
          if (rule.pulseEachTurn && bearer && callbacks.onTargetBonuses) {
            const zone = `zone:${effect.base}:${bearer.id}`;
            const turns = combatTurns(rule.duration ?? duration ?? 2);
            for (const id of ruleTargets) {
              const undo = await callbacks.onTargetBonuses(id, current => setMarker(current, 'cooldown', zone, turns, `${effect.name} (zona)`));
              if (undo) result.undos.push(undo);
            }
            result.log.push(`${origin}: zona marcada ${durationText(turns)} en ${ruleTargets.map(nameOf).join(', ')}`);
          }
          if (trigger === 'on-hit' && marker(bonuses, `armed-item:${effect.base}`)) {
            bonuses = bonuses.filter(bonus => bonus.source !== `armed-item:${effect.base}`);
            result.changed = true;
            result.log.push(`${origin}: se gasta el AA armado`);
          }
          break;
        }
        case 'temp-hp': {
          // Vida temporal: misma f\u00f3rmula que el escudo (con poder de curaci\u00f3n y escudos); caduca sola a los turnos de la
          // regla / del efecto (-1 = fin del combate). Del mismo efecto no se acumula: se renueva (quita lo que quede de la anterior).
          const ids = to === 'allies' ? ruleTargets : bearer ? [bearer.id] : [];
          const turns = combatTurns(rule.duration ?? duration ?? 1);
          const grantSource = `${TEMP_HP_PREFIX}${effect.base}`;
          for (const id of ids) {
            const calc = ruleBreakdown(rule, ctx, isBearer(id) ? undefined : targetInfo(id, ''));
            const holder = participants.find(p => p.id === id);
            // Vida temporal: con la curación y escudos recibidos % de quien la recibe (aquí, para que la concesión guarde lo dado).
            const final = poolAmount(calc.raw, ctx, true, isBearer(id) ? ctx.stats : holder ? participantContext(holder, level)?.ctx.stats : undefined);
            const amount = final.amount;
            if (amount <= 0) continue;
            const held = isBearer(id) ? bonuses : holder?.bonuses ?? [];
            const old = held.find(bonus => bonus.source === grantSource);
            const pools = holder ? participantHpPools(holder) : null;
            const oldLeft = old ? Math.max(0, Math.min(old.amount, pools?.tempHp ?? old.amount)) : 0;
            const delta = amount - oldLeft;
            const pool = isBearer(id)
              ? callbacks.onSelfPool && (() => callbacks.onSelfPool!('temp', delta))
              : callbacks.onTargetPool && (() => callbacks.onTargetPool!(id, 'temp', delta));
            if (!pool) { manual(`${label}: +${amount} vida temporal a ${nameOf(id)} (${durationText(turns)})`); continue; }
            if (delta !== 0) {
              const undo = await pool();
              if (undo) result.undos.push(undo);
            }
            const grant: CombatBonus = { id: `temphp-${id}-${effect.base}`, stat: 'buff', amount, turns, source: grantSource, label: label.slice(0, 80) };
            if (isBearer(id)) {
              bonuses = [...bonuses.filter(bonus => bonus.source !== grantSource), grant];
              result.changed = true;
            } else if (callbacks.onTargetBonuses) {
              const undo = await callbacks.onTargetBonuses(id, current => [...current.filter(bonus => bonus.source !== grantSource), grant]);
              if (undo) result.undos.push(undo);
            }
            result.notes.push(`${label}: +${amount} vida temporal a ${nameOf(id)}`);
            result.chips.push({ kind: 'shield', text: `+${amount} vida temporal${isBearer(id) ? '' : ` ${nameOf(id)}`} (${durationText(turns)})`, title: `${label} \u00b7 caduca sola` });
            result.log.push(`${origin}: +${amount} vida temporal a ${nameOf(id)} (${label}, ${durationText(turns)}) = ${calc.text} \u00b7 al aplicar: ${final.text}${old ? ` \u00b7 renueva la anterior (quedaban ${oldLeft})` : ''}`);
          }
          if (rule.cooldownOnProc) procCooldown = true;
          break;
        }
        case 'heal': case 'shield': case 'shield-magic': case 'shield-physical': case 'mana': {
          // Cura repartida: total calculado ya (valor + escalados x poder de curaci\u00f3n), 1.\u00ba tramo al momento y el resto
          // al empezar cada turno de quien la recibe (Combate: hotTicks). Del mismo efecto, sustituye lo que quedaba.
          if (rule.kind === 'heal' && (rule.healOverTurns ?? 0) >= 2 && !rule.fromDamagePct && !rule.fromManaSpentPct) {
            const count = Math.min(20, Math.floor(rule.healOverTurns as number));
            const ids = to === 'allies' ? ruleTargets : bearer ? [bearer.id] : [];
            const hotSource = `hot:${effect.base}`;
            for (const id of ids) {
              const calc = ruleBreakdown(rule, ctx, isBearer(id) ? undefined : targetInfo(id, ''));
              const final = poolAmount(calc.raw, ctx);
              const total = final.amount;
              if (total <= 0) continue;
              const first = Math.ceil(total / count);
              const rest = total - first;
              const pool = isBearer(id)
                ? callbacks.onSelfPool && (() => callbacks.onSelfPool!('heal', first))
                : callbacks.onTargetPool && (() => callbacks.onTargetPool!(id, 'heal', first));
              if (!pool) { manual(`${label}: cura ${total} en ${count} t. a ${nameOf(id)}`); continue; }
              const undo = await pool();
              if (undo) result.undos.push(undo);
              const entry: CombatBonus | null = rest > 0
                ? { id: `hot-${id}-${effect.base}`.slice(0, 64), stat: 'buff', amount: rest, turns: count - 1, maxStacks: count, source: `${hotSource}|${total}`, label: label.slice(0, 80) }
                : null;
              const keep = (list: CombatBonus[]): CombatBonus[] => [...list.filter(bonus => !(bonus.source ?? '').startsWith(`${hotSource}|`)), ...(entry ? [entry] : [])];
              if (isBearer(id)) {
                bonuses = keep(bonuses);
                result.changed = true;
              } else if (callbacks.onTargetBonuses) {
                const undoBonus = await callbacks.onTargetBonuses(id, keep);
                if (undoBonus) result.undos.push(undoBonus);
              }
              result.notes.push(`${label}: cura ${first}/${total} (1/${count}) a ${nameOf(id)}`);
              result.chips.push({ kind: 'heal', text: `+${first} PV${isBearer(id) ? '' : ` ${nameOf(id)}`} (1/${count}, quedan ${count - 1} t.)`, title: `${label} \u00b7 cura ${total} en ${count} t.` });
              result.log.push(`${label}: cura ${first}/${total} (1/${count}) a ${nameOf(id)} = ${calc.text} \u00b7 al aplicar: ${final.text} \u00b7 quedan ${rest} en ${count - 1} t. (al empezar sus turnos)`);
            }
            if (rule.cooldownOnProc) procCooldown = true;
            break;
          }
          if (to === 'allies' && rule.kind !== 'mana') {
            const kind = rule.kind;
            const word = kind === 'heal' ? 'cura' : shieldWord(kind);
            for (const id of ruleTargets) {
              const calc = ruleBreakdown(rule, ctx, targetInfo(id, ''));
              const final = poolAmount(calc.raw, ctx);
              const amount = final.amount;
              if (amount <= 0) continue;
              if (rule.delayTurns) {
                const pending = `pending:${effect.base}`;
                if (callbacks.onTargetBonuses) {
                  const turns = isBearer(id) ? rule.delayTurns : undefined;
                  const undo = await callbacks.onTargetBonuses(id, current => [
                    ...current.filter(bonus => bonus.source !== pending),
                    { id: `pend-${id}-${effect.base}`, stat: 'buff', amount, ...(turns ? { turns } : {}), source: pending, label: `${label}`.slice(0, 80) },
                  ]);
                  if (undo) result.undos.push(undo);
                }
                result.log.push(`${origin}: ${word} ${amount} a ${nameOf(id)} pendiente ${rule.delayTurns} t.`);
                if (rule.cooldownOnProc) procCooldown = true;
                continue;
              }
              const pool = isBearer(id)
                ? callbacks.onSelfPool && (() => callbacks.onSelfPool!(kind, amount))
                : callbacks.onTargetPool && (() => callbacks.onTargetPool!(id, kind, amount));
              if (!pool) { manual(`${label}: ${word} ${amount} a ${nameOf(id)}`); continue; }
              const undo = await pool();
              if (!undo) continue;
              result.undos.push(undo);
              result.notes.push(`${label}: ${word} +${amount} a ${nameOf(id)}`);
              result.chips.push({ kind: kind === 'heal' ? 'heal' : 'shield', text: `+${amount} ${kind === 'heal' ? 'PV' : shieldWord(kind)} ${nameOf(id)}`, title: label });
              result.log.push(`${origin}: ${word} a ${nameOf(id)} = ${calc.text} · al aplicar: ${final.text}${(rule.duration ?? duration) ? ` · ${durationText(rule.duration ?? duration ?? 0)} (quitar a mano al acabar)` : ''}`);
              if (isShieldKind(kind) && rule.halfAfterTurns && callbacks.onTargetBonuses) {
                const pending = `pending-half:${effect.base}${kind === 'shield-magic' ? '|magic' : kind === 'shield-physical' ? '|physical' : ''}`;
                const half = Math.max(0, Math.round(amount / 2));
                const undoHalf = await callbacks.onTargetBonuses(id, current => [
                  ...current.filter(bonus => bonus.source !== pending),
                  { id: `phalf-${id}-${effect.base}`, stat: 'buff', amount: half, turns: rule.halfAfterTurns, source: pending, label: `${label} (mitad)`.slice(0, 80) },
                ]);
                if (undoHalf) result.undos.push(undoHalf);
                result.log.push(`${origin}: el escudo de ${nameOf(id)} bajará ${half} en ${rule.halfAfterTurns} t.`);
              }
            }
            if (rule.cooldownOnProc) procCooldown = true;
            break;
          }
          if (rule.fromDamagePct && incomingDamage > 0 && (rule.kind === 'mana' || rule.kind === 'heal')) {
            const raw = incomingDamage * rule.fromDamagePct / 100 * rangedFactor(rule, ctx);
            const final = rule.kind === 'heal' ? poolAmount(raw, ctx) : null;
            const amount = final ? final.amount : Math.floor(raw);
            const word = rule.kind === 'heal' ? 'cura' : 'maná';
            if (amount <= 0) break;
            if (!callbacks.onSelfPool) { manual(`${label}: ${word} ${amount} (${rule.fromDamagePct}% del daño recibido)`); break; }
            const undo = await callbacks.onSelfPool(rule.kind, amount);
            if (undo) {
              result.undos.push(undo);
              result.notes.push(`${label}: ${word} +${amount}`);
              result.chips.push({ kind: rule.kind, text: `+${amount} ${rule.kind === 'heal' ? 'PV' : 'maná'}`, title: `${label} · ${rule.fromDamagePct}% del daño` });
              result.log.push(`${origin}: ${word} ${rule.fromDamagePct}% de ${fmt(incomingDamage)} recibido${rangedNote(rule, ctx)} = ${fmt(raw)} → ${amount} a ${bearerName}`);
            }
            break;
          }
          const calc = ruleBreakdown(rule, ctx);
          // Maná: hacia abajo, sin poder de curación. Cura / escudo: × poder de curación y escudos, al más cercano.
          const final = rule.kind === 'mana' ? null : poolAmount(calc.raw, ctx);
          const amount = final ? final.amount : Math.floor(calc.value);
          if (amount <= 0) break;
          const word = rule.kind === 'heal' ? 'cura' : isShieldKind(rule.kind) ? shieldWord(rule.kind) : 'maná';
          if (rule.delayTurns && rule.kind !== 'mana') {
            const pending = `pending:${effect.base}`;
            bonuses = [...bonuses.filter(bonus => bonus.source !== pending), { id: `pend-self-${effect.base}`, stat: 'buff', amount, turns: rule.delayTurns, source: pending, label: `${label}`.slice(0, 80) }];
            result.changed = true;
            result.log.push(`${origin}: ${word} ${amount} pendiente ${rule.delayTurns} t.`);
            if (rule.cooldownOnProc) procCooldown = true;
            break;
          }
          if (!callbacks.onSelfPool) { manual(`${label}: ${word} ${amount}`); break; }
          const undo = await callbacks.onSelfPool(rule.kind, amount);
          if (undo) {
            result.undos.push(undo);
            result.notes.push(`${label}: ${word} +${amount}`);
            result.chips.push({ kind: rule.kind === 'heal' || rule.kind === 'mana' ? rule.kind : 'shield', text: `+${amount} ${rule.kind === 'heal' ? 'PV' : isShieldKind(rule.kind) ? shieldWord(rule.kind) : 'maná'}`, title: `${label} → ${bearerName}` });
            result.log.push(`${origin}: ${word} a ${bearerName} = ${calc.text}${final ? ` · al aplicar: ${final.text}` : amount !== calc.value ? ` → ${amount} (redondeo ↓)` : ''}`);
          }
          break;
        }
        case 'slow': case 'status': {
          if (!callbacks.onApplySourcedEffect || ruleTargets.length === 0) break;
          const name = rule.kind === 'slow' ? `Ralentizado ${formatStat(rule.slowPct ?? 0)}%` : rule.statusName || label;
          const turns = combatTurns(rule.duration ?? duration ?? 1);
          const statusSource = rule.spellShield ? `item-spellshield:${effect.base}` : `item:${effect.item}`.slice(0, 80);
          if (rule.spellShield) {
            if (cooldownLeft(bonuses, effect.base) > 0) {
              if (trigger !== 'when-ready') result.log.push(`${origin}: escudo de hechizos en CD (${cooldownLeft(bonuses, effect.base)} t.)`);
              break;
            }
            const already = (bearer ? participants.find(entry => entry.id === bearer.id)?.effects : undefined)
              ?.some(effect => effect.source === statusSource && effect.duration > 0);
            if (already) {
              if (trigger !== 'when-ready') result.log.push(`${origin}: escudo de hechizos ya activo`);
              break;
            }
          }
          if (rule.extendDuration) {
            // Reaplicar suma la duraci\u00f3n: por objetivo, lo que le queda + la duraci\u00f3n (m\u00e1x. 99).
            for (const id of ruleTargets) {
              const had = participants.find(entry => entry.id === id)?.effects?.find(fx => fx.source === statusSource && fx.duration > 0);
              await callbacks.onApplySourcedEffect([id], { source: statusSource, name: `${name} (${label})`.slice(0, 80), duration: Math.min(99, had ? had.duration + turns : turns) });
            }
          } else {
            await callbacks.onApplySourcedEffect(ruleTargets, {
              source: statusSource,
              name: `${name} (${label})`.slice(0, 80),
              duration: turns,
            });
          }
          if (rule.cooldownOnProc) procCooldown = true;
          result.notes.push(`${label}: ${name}`);
          result.chips.push({ kind: 'debuff', text: `${name} ${ruleTargets.map(nameOf).join(', ')}`, title: label });
          result.log.push(`${origin}: ${name} a ${ruleTargets.map(nameOf).join(', ')} · ${durationText(turns)}`);
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
        case 'vulnerable': {
          if (!callbacks.onApplySourcedEffect || ruleTargets.length === 0) { manual(`${label}: Vulnerable +${formulaText(rule)}%`); break; }
          const calc = ruleBreakdown(rule, ctx);
          const pct = Math.max(1, Math.min(99, Math.round(calc.value)));
          const turns = combatTurns(rule.duration ?? duration ?? 1);
          const vulnSource = `${VULNERABLE_PREFIX}${effect.base}`.slice(0, 80);
          const vulnName = `Vulnerable +${pct}% (${label})`.slice(0, 80);
          const parts: string[] = [];
          for (const id of ruleTargets) {
            const had = participants.find(entry => entry.id === id)?.effects?.find(fx => fx.source === vulnSource && fx.duration > 0);
            // Reaplicar: renueva a la duraci\u00f3n completa; con «Reaplicar suma la duraci\u00f3n», lo que queda + la duraci\u00f3n.
            const total = Math.min(99, had && rule.extendDuration ? had.duration + turns : turns);
            await callbacks.onApplySourcedEffect([id], { source: vulnSource, name: vulnName, duration: total, value: pct });
            parts.push(`${nameOf(id)} ${had ? (rule.extendDuration ? `${had.duration} \u2192 ${total} t. (suma)` : `renueva \u2192 ${total} t.`) : `${total} t.`}`);
          }
          if (rule.cooldownOnProc) procCooldown = true;
          result.notes.push(`${label}: Vulnerable +${pct}%`);
          result.chips.push({ kind: 'debuff', text: `Vulnerable +${pct}% ${ruleTargets.map(nameOf).join(', ')}`, title: `${label}: recibe +${pct}% de da\u00f1o de todas las fuentes` });
          result.log.push(`${origin}: Vulnerable (recibe +${pct}% de da\u00f1o de todas las fuentes; ${calc.text}) a ${parts.join(', ')}`);
          break;
        }
        case 'damage-amp':
          result.log.push(`${origin}: +${formulaText(rule)}% de daño (se aplica al infligir cada golpe)`);
          break;
        case 'damage-reduction':
          result.log.push(`${origin}: ${formulaText(rule)}% menos de daño${rule.vs === 'aa' ? ' de AA' : ''} (se aplica al recibir el golpe)`);
          break;
        case 'execute': {
          const threshold = rule.targetHpBelowPct ?? rule.hpBelowPct ?? 5;
          if (!callbacks.onTargetDamage || ruleTargets.length === 0) { manual(`${label}: ejecutar < ${threshold}%`); break; }
          for (const id of ruleTargets) {
            const info = targetInfo(id, '');
            const max = info?.max ?? 0;
            const current = info?.current ?? 0;
            const pct = max > 0 ? (current / max) * 100 : 100;
            if (pct > threshold) {
              result.log.push(`${origin}: ${nameOf(id)} está al ${fmt(pct)}% (> ${threshold}%) → no ejecuta`);
              continue;
            }
            try {
              const damage = await callbacks.onTargetDamage(id, hp => hp);
              if (damage) {
                result.undos.push(damage.undo);
                if (damage.before > 0 && damage.after <= 0) result.kills.push(id);
                result.notes.push(`${label}: ejecuta a ${damage.name}`);
                result.chips.push({ kind: damageChipKind('true'), text: `ejecuta ${damage.name}`, title: `${label} · vida < ${threshold}%` });
                result.log.push(`${origin}: ejecuta a ${damage.name} (vida ${fmt(damage.before)} → ${fmt(damage.after)}, umbral ${threshold}%)`);
              }
            } catch (caught) {
              const message = caught instanceof Error ? caught.message : 'ejecutar';
              result.notes.push(`error: ${message}`);
              result.log.push(`${origin}: error al ejecutar a ${nameOf(id)}: ${message}`);
            }
          }
          break;
        }
        case 'extra-action': {
          const kind = rule.action === 'attacks' ? 'attacks' : 'abilities';
          const amount = rule.count ?? 1;
          if (!callbacks.onGrantAction) { manual(`${label}: +${amount} acción de ${kind === 'abilities' ? 'habilidad' : 'AA'}`); break; }
          await callbacks.onGrantAction(kind, amount);
          result.notes.push(`${label}: +${amount} acción de ${kind === 'abilities' ? 'habilidad' : 'AA'}`);
          result.chips.push({ kind: 'buff', text: `+${amount} ${kind === 'abilities' ? 'hab.' : 'AA'}`, title: label });
          result.log.push(`${origin}: +${amount} acción de ${kind === 'abilities' ? 'habilidad básica' : 'ataque'} este turno`);
          if (rule.cooldownOnProc) procCooldown = true;
          break;
        }
      }
    }
    return extraHits;
  };

  // \u00abRequiere N aplicaciones al mismo objetivo\u00bb: suma 1 en cada objetivo (como mucho 1 por acci\u00f3n) y devuelve los que llegan a N.
  const hitsGate = async (effect: ActiveNamedEffect, config: EffectBonusConfig): Promise<string[]> => {
    const need = config.hitsRequired ?? 2;
    const windowTurns = config.hitsWindow ?? 1;
    const origin = `${effect.name} (${effect.item})`;
    const key = `${HITS_PREFIX}${effect.base}:${bearer?.id ?? ''}`;
    const done: string[] = [];
    for (const id of [...new Set(targetIds)]) {
      if (isBearer(id)) continue;
      if (config.hitsChampionsOnly && (isNonChampion(id) || !participants.some(p => p.id === id))) {
        result.log.push(`${origin}: ${nameOf(id)} no es un campe\u00f3n \u2192 no suma aplicaci\u00f3n`);
        continue;
      }
      const memo = `${id}|${key}`;
      const now = Date.now();
      const last = hitDedupe.get(memo);
      hitDedupe.set(memo, now);
      if (last !== undefined && now - last < HIT_DEDUPE_MS) {
        result.log.push(`${origin}: ${nameOf(id)} ya ha recibido una aplicaci\u00f3n en esta acci\u00f3n \u2192 no suma otra`);
        continue;
      }
      if (!callbacks.onTargetBonuses) { manual(`${effect.name}: +1 aplicaci\u00f3n a ${nameOf(id)} (${need} en ${windowTurns} t.)`); continue; }
      let count = 0;
      const undo = await callbacks.onTargetBonuses(id, current => {
        const found = current.find(bonus => bonus.source === key);
        count = (found?.amount ?? 0) + 1;
        const rest = current.filter(bonus => bonus.source !== key);
        if (count >= need) return rest;
        return [...rest, { id: found?.id ?? newBonusId(), stat: 'buff', amount: count, maxStacks: need, turns: found?.turns ?? windowTurns, source: key, label: `${effect.name} (${bearerName})`.slice(0, 80) }];
      });
      if (undo) result.undos.push(undo);
      if (count >= need) {
        done.push(id);
        result.log.push(`${origin}: aplicaci\u00f3n ${need}/${need} en ${nameOf(id)} \u2192 se activa`);
      } else {
        result.chips.push({ kind: 'buff', text: `${effect.name} ${count}/${need} ${nameOf(id)}`, title: `${effect.name}: aplicaciones al mismo objetivo (caduca en ${windowTurns} t. del objetivo)` });
        result.log.push(`${origin}: aplicaci\u00f3n ${count}/${need} en ${nameOf(id)} (caduca al empezar ${windowTurns === 1 ? 'su siguiente turno' : `su turno ${windowTurns}`})`);
      }
    }
    return done;
  };

  let extraHits = 0;
  const rangeText = `${bearerName} es ${rangeTypeLabel(ctx.melee === true).toLowerCase()} (rango ${fmt(statNumber(ctx.stats.range))}; cuerpo a cuerpo = rango ≤ 1)`;
  for (const effect of effects) {
    // CD por tramo de nivel del portador (Cadencia marcial: 3/3/2/2): se resuelve aquí.
    const config = withLevelCooldown(effect.config, ctx.level);
    const levelCdNote = effect.config.cooldownByLevel?.length ? ` (CD por nivel ${effect.config.cooldownByLevel.join('/')}: nivel ${ctx.level} → ${config.cooldown ?? '—'} t.)` : '';
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
    if (trigger === 'hp-below') {
      const me = bearer ? participants.find(p => p.id === bearer.id) : undefined;
      const hp = me ? participantHp(me) : undefined;
      const max = hp?.max ?? 0;
      const current = hp?.current ?? 0;
      const pct = max > 0 ? (current / max) * 100 : 100;
      const threshold = own.find(entry => entry.rule.hpBelowPct != null)?.rule.hpBelowPct ?? 30;
      if (pct >= threshold) {
        result.log.push(`${effect.name} (${effect.item}): vida ${fmt(pct)}% no está por debajo de ${threshold}% → no se aplica`);
        continue;
      }
    }
    if (config.oncePerCombat && marker(bonuses, `once:${effect.base}`)) {
      result.notes.push(`${effect.name}: ya usado en este combate`);
      result.chips.push({ kind: 'cd', text: `${effect.name} ya usado` });
      result.log.push(`${effect.name} (${effect.item}): ya se usó en este combate → no se aplica`);
      continue;
    }
    // Filtros de control / campe\u00f3n antes del CD: si ninguna regla vale, no salta ni gasta el CD.
    if (own.length && !own.some(({ rule }) => ccGateOk(rule) && (!rule.championTargetsOnly || championTargets(targetIds).length > 0))) {
      const why = own.some(({ rule }) => !ccGateOk(rule)) ? (options.ccSlow ? `ralentizar solo cuenta si ${bearerName} es cuerpo a cuerpo` : 'el control no inmoviliza') : 'ning\u00fan objetivo es un campe\u00f3n';
      result.log.push(`${effect.name} (${effect.item}): ${why} \u2192 no se aplica (sin gastar CD)`);
      continue;
    }
    const hasAfterAbility = rules.some(({ rule }) => isArmTrigger(rule.trigger));
    const deferCd = own.some(({ rule }) => rule.cooldownOnProc || rule.triggerAtMax || rule.everyN) || !!config.hitsRequired;
    procCooldown = false;
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
      const turns = config.cdStart === 'on-end' ? Math.max(0, config.duration ?? 0) + config.cooldown : config.cooldown;
      for (const id of marked) {
        const undo = await callbacks.onTargetBonuses(id, current => setMarker(current, 'cooldown', source, turns, `${effect.name} (de ${bearer.name})`.slice(0, 80)));
        if (undo) result.undos.push(undo);
        result.chips.push({ kind: 'mark', text: `Marca ${effect.name} · ${nameOf(id)} → CD ${turns} t.`, title: 'Marca consumida; el CD queda en ese objetivo' });
        result.log.push(`${effect.name} (${effect.item}): marca de ${bearerName} consumida en ${nameOf(id)} → CD ${turns} t. en ${nameOf(id)}${config.cdStart === 'on-end' ? ` (${config.duration ?? 0} de efecto + ${config.cooldown} de CD)` : ''}${levelCdNote}`);
      }
      result.notes.push(`${effect.name}: marca de ${marked.map(nameOf).join(', ')} (CD ${turns} t. en el objetivo)`);
      extraHits += await applyRules(effect, own, marked);
      if (config.oncePerCombat) {
        bonuses = setMarker(bonuses, 'cooldown', `once:${effect.base}`, 99, `${effect.name} (1/combate)`);
        result.changed = true;
      }
      continue;
    }
    if (config.cooldown && !hasAfterAbility && !deferCd) {
      if (cooldownLeft(bonuses, effect.base) > 0) {
        // "Cuando est\u00e9 disponible": en CD no hace nada (ni avisa); se volver\u00e1 a mirar al empezar su turno.
        if (trigger === 'when-ready') continue;
        const left = cooldownLeft(bonuses, effect.base);
        result.notes.push(`${effect.name} en CD (${left} t.)`);
        result.chips.push({ kind: 'cd', text: `${effect.name} en CD ${left} t.` });
        result.log.push(`${effect.name} (${effect.item}): en CD en ${bearerName} (${left} t. restantes) → no se aplica`);
        continue;
      }
      // "Al romperse el escudo de hechizos": no hay CD al ponerlo; lo pone consumeSpellShields cuando bloquea una habilidad.
      if (config.cdStart !== 'on-break') {
        const turns = config.cdStart === 'on-end' ? Math.max(0, config.duration ?? 0) + config.cooldown : config.cooldown;
        bonuses = setMarker(bonuses, 'cooldown', `cd:${effect.base}`, turns, effect.name);
        result.changed = true;
        result.chips.push({ kind: 'cd', text: `CD ${effect.name} ${turns} t.` });
        result.log.push(`${effect.name} (${effect.item}): CD ${turns} t. en ${bearerName}${config.cdStart === 'on-end' ? ` (${config.duration ?? 0} de efecto + ${config.cooldown} de CD)` : ''}${levelCdNote}`);
      }
    }
    let gateTargets: string[] | undefined;
    if (config.hitsRequired && config.hitsRequired >= 2) {
      const left = cooldownLeft(bonuses, effect.base);
      if (left > 0) {
        result.log.push(`${effect.name} (${effect.item}): en CD en ${bearerName} (${left} t.) \u2192 no suma aplicaciones`);
        continue;
      }
      gateTargets = await hitsGate(effect, config);
      if (!gateTargets.length) continue;
      procCooldown = true;
    }
    extraHits += await applyRules(effect, own, gateTargets);
    if (deferCd && procCooldown && config.cooldown && cooldownLeft(bonuses, effect.base) <= 0) {
      const turns = config.cdStart === 'on-end' ? Math.max(0, config.duration ?? 0) + config.cooldown : config.cooldown;
      bonuses = setMarker(bonuses, 'cooldown', `cd:${effect.base}`, turns, effect.name);
      result.changed = true;
      result.chips.push({ kind: 'cd', text: `CD ${effect.name} ${turns} t.` });
      result.log.push(`${effect.name} (${effect.item}): CD ${turns} t. en ${bearerName} (al proc)`);
    }
    if (config.oncePerCombat) {
      bonuses = setMarker(bonuses, 'cooldown', `once:${effect.base}`, 99, `${effect.name} (1/combate)`);
      result.changed = true;
      result.chips.push({ kind: 'cd', text: `${effect.name} 1/combate` });
      result.log.push(`${effect.name} (${effect.item}): queda usado por este combate`);
    }
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
/** «Ya gastada este turno» de unas cargas de combate con perTurn. */
export const chargeTurnSource = (id: string): string => `chargeturn:${id}`.slice(0, 80);

/**
 * Cargas de combate de los efectos del portador para enseñar: «Flujo de maná 3/4 · recarga en 2t».
 * Sin marcador = las del inicio (aún no ha gastado ninguna en este combate).
 */
export function chargeStatus(effects: ActiveNamedEffect[], bonuses: CombatBonus[] | undefined): { id: string; text: string }[] {
  return effects.filter(effect => effect.config.charges).map(effect => {
    const charges = effect.config.charges!;
    const marker = (bonuses ?? []).find(bonus => bonus.source === chargesSource(effect.id));
    const spent = charges.perTurn && (bonuses ?? []).some(bonus => bonus.source === chargeTurnSource(effect.id));
    return { id: effect.id, text: `${chargesText(effect.name, marker ? marker.amount : charges.start, charges.max, marker?.recharge)}${spent ? ' · ya gastada este turno' : ''}` };
  });
}

/** Texto de los marcadores en la lista de bonus. */
export function markerText(bonus: CombatBonus): string | null {
  if (bonus.stat === 'armed') return `${bonus.label ?? 'Efecto'} armado${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'cooldown') return `CD ${bonus.label ?? 'efecto'}${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'charges') return chargesText(bonus.label ?? 'Cargas', bonus.amount, bonus.maxStacks ?? bonus.amount, bonus.recharge);
  if (bonus.stat === 'stacks') return `${bonus.label ?? 'Cargas'} ${bonus.amount}${bonus.maxStacks ? `/${bonus.maxStacks}` : ''}${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'buff' && bonus.source?.startsWith('shield:')) return `Escudo ${bonus.label ?? ''} ${bonus.amount}${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'buff' && bonus.source?.startsWith('recast:')) return `Recast ${bonus.label ?? ''} ×${bonus.amount}${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'buff' && bonus.source?.startsWith('chargeturn:')) return `${bonus.label ?? 'Cargas'}: ya gastada este turno`;
  if (bonus.stat === 'buff' && bonus.source?.startsWith('innate:')) return `Escudo automático ${bonus.label ?? ''} ${bonus.amount}`;
  if (bonus.stat === 'buff' && bonus.source?.startsWith('innatecd:')) return `CD escudo ${bonus.label ?? ''} ${Math.round(bonus.amount * 100) / 100} t.`;
  if (bonus.stat === 'buff' && bonus.source?.startsWith('pending:')) return `Cura pendiente ${bonus.label ?? ''} ${bonus.amount}${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'buff') return `${bonus.label ?? 'Habilidad'} activa${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  return null;
}
