import { BASIC_MAX_RANK, ULT_MAX_RANK, milestoneRank, normalizeRanks, type RankedSlot } from '../../data/abilityRanks';
import { abilityRuleBase, abilityStacks, hasPermanentMaxStacks, rankValue, shouldGainAbilityStack, stacksRequirement } from '../../data/abilityMechanics';
import { ABILITY_KEYS, findAbilityRef, type Ability } from '../../data/champions';
import type { CombatBonus, CombatParticipant } from '../../data/combat';
import { participantChampion, participantNpc } from '../../data/combatSheet';
import type { EffectRule } from '../../data/effectBonus';
import { PLAYERS, PLAYER_ABILITY_SLOTS } from '../../data/players';
import type { ActiveNamedEffect } from './effectRules';
import { abilityPassiveBonuses } from '../players/abilityPassiveStats';

/** Habilidad que tiene el participante, con su rango (0 = sin aprender; la pasiva siempre ≥ 1). */
export type OwnedAbility = { seal: string; name: string; ability: Ability; rank: number };

/** Habilidades de un participante y su rango (como las filas de la sección de habilidades del combate). */
export function participantAbilities(participant: CombatParticipant, level: number): OwnedAbility[] {
  const npc = participantNpc(participant);
  if (npc?.abilities?.length) {
    return npc.abilities.filter(ability => ability?.name).map((ability, index) => {
      const label = (ability.label ?? '').trim().toLowerCase();
      const isPassive = label === 'pasiva' || label === 'p' || ability.mechanics?.noAction === true;
      const mapped = {
        name: ability.name,
        description: ability.description,
        cost: ability.cost,
        damage: ability.damage,
        effect: ability.effect,
        mechanics: ability.mechanics,
      } as Ability;
      const seal = isPassive ? 'P' : (label === 'q' || label === 'w' || label === 'e' || label === 'r' ? label.toUpperCase() : 'N');
      void index;
      return { seal, name: ability.name, ability: mapped, rank: 1 };
    });
  }
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
    const level = stackOptions?.level ?? 1;
    // Bonus fijos (aprendida, alcance por nivel, acumulaciones permanentes): los mismos que suma la ficha fuera de combate.
    const learned: EffectRule[] = abilityPassiveBonuses(entry.ability, entry.name, entry.rank, { level, playerStacks: stackOptions?.playerStacks, bonuses: stackOptions?.bonuses })
      .map((bonus): EffectRule => ({ trigger: 'always', kind: 'stat', stat: bonus.stat, flat: bonus.amount }));
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
