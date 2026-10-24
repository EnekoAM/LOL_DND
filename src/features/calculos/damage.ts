import type { AbilityDamage } from '../../data/champions';

export type DamageInputs = {
  ap: number;
  level: number;
  singleTarget: boolean;
};

export const DEFAULT_DAMAGE_INPUTS: DamageInputs = {
  ap: 0,
  level: 1,
  singleTarget: false,
};

/** El nivel elegido se conserva al cambiar de habilidad, pero no todas tienen los mismos niveles. */
export const clampLevel = (level: number, levelCount: number): number => Math.min(level, Math.max(levelCount, 1));

export const calculateDamage = (damage: AbilityDamage | undefined, { ap, level, singleTarget }: DamageInputs) => {
  const scaling = damage?.ap?.[level - 1] ?? 0;
  const base = ap * scaling;
  const multiplier = singleTarget ? damage?.damageBonus ?? 1 : 1;
  return { scaling, base, final: base * multiplier };
};
