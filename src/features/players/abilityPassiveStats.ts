import { milestoneRank, normalizeRanks, type RankedSlot } from '../../data/abilityRanks';
import { rankValue, readPermanentAbilityStacks, totalRangeBonus } from '../../data/abilityMechanics';
import { findAbilityRef, type Ability } from '../../data/champions';
import type { CombatBonus } from '../../data/combat';
import { partyLevel } from '../../data/party';
import { PLAYER_ABILITY_SLOTS, type Player } from '../../data/players';
import { emptyStatLine, formatStatBonus, isStatLineKey, type StatKey, type StatLine } from '../calculos/statLine';

/** De dónde sale un bonus pasivo de habilidad. */
export type PassiveBonusKind = 'learned' | 'level' | 'stacks';

/** Bonus de stat siempre activo que da una habilidad (no depende de estados ni cargas del combate). */
export type PassiveStatBonus = { stat: StatKey; amount: number; kind: PassiveBonusKind; reason: string };

/** Una habilidad del personaje que ahora mismo le da stats. */
export type AbilityPassiveSource = { seal: string; name: string; rank: number; bonuses: PassiveStatBonus[]; line: StatLine };

/** Chip de la carta / ficha de la habilidad. active false = aún sin aprender (lo que daría). */
export type PassiveBadge = { active: boolean; texts: string[] };

type PassiveOptions = { level: number; playerStacks?: Record<string, number>; bonuses?: CombatBonus[] };

const round = (value: number, factor: number) => Math.round(value * factor) / factor;

/**
 * Bonus pasivos fijos de una habilidad: los mismos que el combate mete como reglas «Siempre»
 * (abilityNamedEffects): learnedStats (por tenerla aprendida), alcance por nivel y stat por acumulación permanente.
 * Sin aprender (rango < 1) no da nada. Las cargas temporales y los estados solo cuentan en combate.
 */
export function abilityPassiveBonuses(ability: Ability, name: string, rank: number, options: PassiveOptions): PassiveStatBonus[] {
  const mechanics = ability.mechanics;
  if (!mechanics || rank < 1) return [];
  const out: PassiveStatBonus[] = [];
  for (const entry of mechanics.learnedStats ?? []) {
    const value = rankValue(entry.values, rank);
    if (value && isStatLineKey(entry.stat)) out.push({ stat: entry.stat, amount: value, kind: 'learned', reason: `por tenerla aprendida (rango ${rank})` });
  }
  const range = totalRangeBonus(mechanics.levelThresholds, options.level);
  if (range) out.push({ stat: 'range', amount: range, kind: 'level', reason: `por nivel ${options.level}` });
  const perm = mechanics.permanentStacks;
  if (perm?.stat && perm.perStack?.length && isStatLineKey(perm.stat)) {
    const stacks = readPermanentAbilityStacks({ name, playerStacks: options.playerStacks, bonuses: options.bonuses });
    const value = round(stacks * (rankValue(perm.perStack, rank) ?? 0), 10);
    if (value) out.push({ stat: perm.stat, amount: value, kind: 'stacks', reason: `${stacks} acumulaciones permanentes` });
  }
  return out;
}

export const passiveBonusTexts = (bonuses: PassiveStatBonus[]): string[] =>
  bonuses.map(bonus => formatStatBonus(bonus.stat, bonus.amount));

/** Chip para la carta: el bonus activo o, si aún no está aprendida, lo que daría al aprenderla. */
export function passiveBonusBadge(ability: Ability | null | undefined, name: string, rank: number, options: PassiveOptions): PassiveBadge | undefined {
  if (!ability?.mechanics) return undefined;
  const active = abilityPassiveBonuses(ability, name, rank, options);
  if (active.length) return { active: true, texts: passiveBonusTexts(active) };
  if (rank >= 1) return undefined;
  const preview = abilityPassiveBonuses(ability, name, 1, options).filter(bonus => bonus.kind === 'learned');
  return preview.length ? { active: false, texts: passiveBonusTexts(preview) } : undefined;
}

/** Pasivas con stats del player: rango de cada hueco (P por nivel; Q/W/E/R por puntos), igual que en el combate. */
export function playerAbilityPassives(player: Player, level: number = partyLevel()): AbilityPassiveSource[] {
  const ranks = normalizeRanks(player.abilityRanks, level);
  const out: AbilityPassiveSource[] = [];
  for (const { slot, key } of PLAYER_ABILITY_SLOTS) {
    const ref = findAbilityRef(player.abilities?.[slot] ?? null);
    if (!ref) continue;
    const rank = slot === 'P' ? Math.max(1, milestoneRank(level)) : Math.max(0, ranks[slot as RankedSlot] ?? 0);
    const bonuses = abilityPassiveBonuses(ref.ability, ref.ability.name, rank, { level, playerStacks: player.stacks });
    if (!bonuses.length) continue;
    const line = emptyStatLine();
    for (const bonus of bonuses) line[bonus.stat] = round((Number(line[bonus.stat]) || 0) + bonus.amount, 1000);
    out.push({ seal: key, name: ref.ability.name, rank, bonuses, line });
  }
  return out;
}

/** Líneas de stats de las pasivas del player, para sumarlas al total como bonus (igual que los ítems). */
export const playerAbilityPassiveLines = (player: Player | null | undefined, level?: number): StatLine[] =>
  player ? playerAbilityPassives(player, level).map(source => source.line) : [];
