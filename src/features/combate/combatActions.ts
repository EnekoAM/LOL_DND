import type { Champion } from '../../data/champions';
import type { CombatBonus, CombatParticipant } from '../../data/combat';
import type { Player } from '../../data/players';
import { milestoneRank } from '../../data/abilityRanks';
import { championDamageContext } from '../calculos/championDamage';
import { playerTotalLine } from '../calculos/playerTotals';
import { numericStat } from './combatAbilityUse';
import type { StatLine } from '../calculos/statLine';

export type ActionLimits = { attacks?: number; abilities?: number };

const positive = (value: unknown): number | undefined => {
  const n = numericStat(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};

/**
 * Ataques / habilidades por turno = columnas Attacks / Abilities del TOTAL de la ficha
 * (tabla de rol al nivel + equipo + extra), igual que en Cálculos. NPCs/custom: sin dato.
 */
export function actionLimits(player: Player | null, champion: Champion | null, level: number, extra: StatLine[] = []): ActionLimits {
  if (player) {
    const total = playerTotalLine(player.sheet, player.equipamiento, level, extra);
    return { attacks: positive(total.atkSpe), abilities: positive(total.abSpe) };
  }
  if (champion) {
    const { stats } = championDamageContext(champion, extra);
    return { attacks: positive(stats.atkSpe), abilities: positive(stats.abSpe) };
  }
  return {};
}

/** Lo que le queda este turno: guardado en el combate o, si no, el máximo. */
export function actionsLeft(participant: CombatParticipant, limits: ActionLimits): ActionLimits {
  return {
    attacks: participant.actionsLeft?.attacks ?? limits.attacks,
    abilities: participant.actionsLeft?.abilities ?? limits.abilities,
  };
}

/** Ataque básico AP: % del AP total por tramo de nivel (1-5 / 6-10 / 11-15 / 16+). */
export const AP_BASIC_ATTACK_SCALING = [0.05, 0.1, 0.15, 0.2] as const;

/**
 * Multiplicador del ataque básico. AD: el AD total (×1). AP: el escalado guardado en el ataque básico del player
 * (basicAttack.scaling, por tramo de milestoneRank) y, si no llega a ese tramo, AP_BASIC_ATTACK_SCALING.
 */
export function basicAttackPct(type: 'AD' | 'AP', level: number, stored?: readonly number[]): number {
  if (type === 'AD') return 1;
  const tier = milestoneRank(level) - 1;
  const value = stored?.[tier];
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : AP_BASIC_ATTACK_SCALING[Math.min(tier, AP_BASIC_ATTACK_SCALING.length - 1)];
}

/** Stat marcador: no es una columna de la ficha; sustituye el máximo de ataques del turno. */
export const FIXED_ATTACKS_STAT = 'fixedAttacks';

/** El mayor «número de ataques fijo» activo en los bonus. */
export function fixedAttacksOverride(bonuses: CombatBonus[] | undefined): number | undefined {
  let best: number | undefined;
  for (const bonus of bonuses ?? []) {
    if (bonus.stat !== FIXED_ATTACKS_STAT) continue;
    const value = Math.floor(bonus.amount);
    if (value > 0 && (best === undefined || value > best)) best = value;
  }
  return best;
}

/** Sustituye Attacks de la ficha mientras hay un override activo (no lo suma). */
export function withFixedAttacks(limits: ActionLimits, bonuses: CombatBonus[] | undefined): ActionLimits {
  const override = fixedAttacksOverride(bonuses);
  if (!override) return limits;
  return { ...limits, attacks: override };
}

/**
 * Conserva los ataques ya gastados este turno al cambiar el máximo
 * (p. ej. al encender o apagar un interruptor a mitad de turno).
 */
export function leftoverAfterAttackLimitChange(
  prevMax: number | undefined,
  prevLeft: number | undefined,
  nextMax: number | undefined,
): number | undefined {
  if (nextMax === undefined) return prevLeft;
  const spent = prevMax !== undefined && prevLeft !== undefined ? Math.max(0, prevMax - prevLeft) : 0;
  return Math.max(0, nextMax - spent);
}
