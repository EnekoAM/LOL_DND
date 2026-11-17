import type { CombatParticipant } from '../../data/combat';
import { rollAmpRound, rollAmpsFor, type RollAmp } from '../../data/rollAmps';
import { participantContext } from './effectRules';
import { rollAbilityDamage } from '../players/abilityDamage';
import { participantHp } from './combatHp';
import { participantItems } from './itemCombatHooks';

export { setRollAmpRound } from '../../data/rollAmps';

/** "% a la tirada" de los items del participante (Rabadon, Sangria, Liandry...), con su vida actual y la ronda del combate. */
export function participantRollAmps(participant: CombatParticipant): RollAmp[] {
  const melee = participantContext(participant, 1)?.ctx.melee;
  return rollAmpsFor(participantItems(participant), participantHp(participant), rollAmpRound(), melee);
}

/** Tirada de dano de habilidad del participante con sus "% a la tirada" aplicados a la tirada de AD/AP. */
export function rollAbilityDamageFor(
  participant: CombatParticipant,
  damage: Parameters<typeof rollAbilityDamage>[0],
  stats: Parameters<typeof rollAbilityDamage>[1],
  rank: number,
) {
  return rollAbilityDamage(damage, stats, rank, Math.random, participantRollAmps(participant));
}
