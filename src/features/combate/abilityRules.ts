import { BASIC_MAX_RANK, ULT_MAX_RANK, milestoneRank, normalizeRanks, type RankedSlot } from '../../data/abilityRanks';
import { abilityRuleBase, abilityStacks, hasPermanentMaxStacks, rankValue, readPermanentAbilityStacks, shouldGainAbilityStack, stacksRequirement, totalRangeBonus } from '../../data/abilityMechanics';
import { ABILITY_KEYS, findAbilityRef, type Ability } from '../../data/champions';
import type { CombatBonus, CombatParticipant } from '../../data/combat';
import { participantChampion } from '../../data/combatSheet';
import type { EffectRule } from '../../data/effectBonus';
import { PLAYERS, PLAYER_ABILITY_SLOTS } from '../../data/players';
import type { ActiveNamedEffect } from './effectRules';

/** Habilidad que tiene el participante, con su rango (0 = sin aprender; la pasiva siempre ≥ 1). */
export type OwnedAbility = { seal: string; name: string; ability: Ability; rank: number };

/** Habilidades de un participante y su rango (como las filas de la sección de habilidades del combate). */
export function participantAbilities(participant: CombatParticipant, level: number): OwnedAbility[] {
  if (participant.kind === 'player') {
    const player = PLAYERS.find(entry => entry.name === participant.sourceId);
    if (!player) return [];
    const ranks = normalizeRanks(player.abilityRanks, level);
    const out: OwnedAbility[] = [];
    for (const { slot, key } of PLAYER_ABILITY_SLOTS) {
      const name = player.abilities[slot];
      const ref = name ? findAbilityRef(name) : null;
      if (!ref) continue;
      const rank = slot === 'P' ? Math.max(1, milestoneRank(level)) : Math.max(0, ranks[slot as RankedSlot] ?? 0);
      out.push({ seal: key, name: ref.ability.name, ability: ref.ability, rank });
    }
    return out;
  }
  const champion = participantChampion(participant);
  if (!champion) return [];
  const championLevel = typeof champion.level === 'number' && Number.isFinite(champion.level) ? Math.min(20, Math.max(1, Math.floor(champion.level))) : 1;
  const saved = participant.sheet?.abilityRanks ?? {};
  const out: OwnedAbility[] = [];
  for (const slot of ABILITY_KEYS) {
    const ability = champion.abilities[slot];
    if (!ability?.name) continue;
    const max = slot === 'R' ? ULT_MAX_RANK : BASIC_MAX_RANK;
    const stored = saved[slot];
    const rank = slot === 'P'
      ? Math.max(1, milestoneRank(championLevel))
      : typeof stored === 'number' ? Math.min(max, Math.max(0, Math.floor(stored))) : 1;
    out.push({ seal: slot, name: ability.name, ability, rank });
  }
  return out;
}

/**
 * Las mecánicas de habilidad que van por el motor de efectos de los ítems, como efectos con nombre del portador:
 * - effectRules: sus reglas tal cual (Cadencia marcial: daño al AA por % de vida actual, CD por objetivo).
 * - learnedStats: reglas «Siempre» con el valor de su rango (Estandarte demaciano: vel. ataque por tenerla).
 * Solo las aprendidas (rango ≥ 1).
 */
export function abilityNamedEffects(
  owned: OwnedAbility[],
  stackOptions?: { playerStacks?: Record<string, number>; bonuses?: CombatBonus[]; level?: number },
): ActiveNamedEffect[] {
  const out: ActiveNamedEffect[] = [];
  for (const entry of owned) {
    const mechanics = entry.ability.mechanics;
    if (!mechanics || entry.rank < 1) continue;
    const base = abilityRuleBase(entry.name);
    const item = `${entry.seal} «${entry.name}»`.slice(0, 70);
    if (mechanics.effectRules?.rules.length) {
      out.push({ id: base, base, name: entry.name, item, config: mechanics.effectRules });
    }
    const learned: EffectRule[] = [];
    for (const stat of mechanics.learnedStats ?? []) {
      const value = rankValue(stat.values, entry.rank);
      if (value) learned.push({ trigger: 'always', kind: 'stat', stat: stat.stat, flat: value });
    }
    const level = stackOptions?.level ?? 1;
    const rangeBonus = totalRangeBonus(mechanics.levelThresholds, level);
    if (rangeBonus) learned.push({ trigger: 'always', kind: 'stat', stat: 'range', flat: rangeBonus });
    const temp = mechanics.stacks;
    if (temp?.stat && temp.perStack?.length) {
      const stacks = hasPermanentMaxStacks(mechanics.levelThresholds, level) ? temp.max : abilityStacks(stackOptions?.bonuses, entry.name).count;
      const per = rankValue(temp.perStack, entry.rank) ?? 0;
      const value = Math.round(stacks * per * 10) / 10;
      if (value) learned.push({ trigger: 'always', kind: 'stat', stat: temp.stat, flat: value });
    }
    if (temp?.onMaxStatus?.stat) {
      const atMax = hasPermanentMaxStacks(mechanics.levelThresholds, level) || abilityStacks(stackOptions?.bonuses, entry.name).count >= temp.max;
      if (atMax && temp.onMaxStatus.amount) learned.push({ trigger: 'always', kind: 'stat', stat: temp.onMaxStatus.stat, flat: temp.onMaxStatus.amount });
    }
    const perm = mechanics.permanentStacks;
    if (perm?.stat && perm.perStack?.length) {
      const stacks = readPermanentAbilityStacks({ name: entry.name, playerStacks: stackOptions?.playerStacks, bonuses: stackOptions?.bonuses });
      const per = rankValue(perm.perStack, entry.rank) ?? 0;
      const value = Math.round(stacks * per * 10) / 10;
      if (value) learned.push({ trigger: 'always', kind: 'stat', stat: perm.stat, flat: value });
    }
    if (learned.length) out.push({ id: `${base}-learned`.slice(0, 60), base: `${base}-learned`.slice(0, 60), name: `${entry.name} (aprendida)`, item, config: { rules: learned } });
  }
  return out;
}

/** Habilidades del portador cuyo contador de cargas debe sumar 1 con este impacto. */
export function stackGainOwners(
  owned: OwnedAbility[],
  options: { trigger: 'on-hit' | 'on-ability'; abilityOnHit: boolean; damaged: boolean; usedName?: string; usedRequires?: { name: string } },
): OwnedAbility[] {
  return owned.filter(entry => {
    const config = entry.ability.mechanics?.stacks;
    if (!config || entry.rank < 1) return false;
    return shouldGainAbilityStack({ config, ownerName: entry.name, ...options });
  });
}

export { stacksRequirement };
