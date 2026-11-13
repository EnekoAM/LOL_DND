import type { Ability, AbilityDamage } from './champions';
import { hasDamageScaling } from '../features/players/abilityDamage';

/** Número de fases: la base (fase 1) más sus variantes. */
export function abilityPhaseCount(ability: Ability | null | undefined): number {
  return 1 + (ability?.variants?.length ?? 0);
}

/** Máximo de variantes (fases 2+). Con la base dan 13 fases. */
export const MAX_ABILITY_VARIANTS = 12;

/** Las fases se eligen al usar (combos) en vez de ir en orden. */
export function isChoosePhases(ability: Ability | null | undefined): boolean {
  return ability?.phaseMode === 'choose' && hasVariants(ability);
}

export function hasVariants(ability: Ability | null | undefined): boolean {
  return abilityPhaseCount(ability) > 1;
}

/** Índice válido (0 = base), envolviendo si se sale de rango. */
export function clampPhase(ability: Ability | null | undefined, index: number | undefined): number {
  const count = abilityPhaseCount(ability);
  if (typeof index !== 'number' || !Number.isFinite(index)) return 0;
  return ((Math.floor(index) % count) + count) % count;
}

export function phaseLabel(ability: Ability | null | undefined, index: number): string {
  if (index <= 0) return 'Fase 1';
  return ability?.variants?.[index - 1]?.name?.trim() || `Fase ${index + 1}`;
}

export function phaseLabels(ability: Ability | null | undefined): string[] {
  return Array.from({ length: abilityPhaseCount(ability) }, (_, index) => phaseLabel(ability, index));
}

function mergeDamage(base: AbilityDamage | undefined, override: AbilityDamage | undefined): AbilityDamage | undefined {
  if (!override) return base;
  const merged: AbilityDamage = { ...base };
  for (const [key, value] of Object.entries(override) as [keyof AbilityDamage, unknown][]) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return Object.keys(merged).length ? merged : undefined;
}

/**
 * Habilidad tal como es en la fase indicada. Conserva el nombre de la base
 * (los cooldowns y stacks van por nombre) y quita la lista de variantes.
 */
export function abilityPhase(ability: Ability, index: number): Ability {
  const { variants, phaseMode: _phaseMode, ...base } = ability;
  const phase = clampPhase(ability, index);
  if (phase === 0 || !variants) return base;
  const variant = variants[phase - 1];
  const resolved: Ability = { ...base };
  if (variant.description) resolved.description = variant.description;
  if (variant.cost) resolved.cost = variant.cost;
  if (variant.resource) resolved.resource = variant.resource;
  resolved.damage = mergeDamage(base.damage, variant.damage);
  if (!resolved.damage) delete resolved.damage;
  if (variant.effect?.length) resolved.effect = variant.effect;
  if (typeof variant.cooldown === 'number') resolved.cooldown = variant.cooldown;
  if (typeof variant.effectDuration === 'number') resolved.effectDuration = variant.effectDuration;
  if (variant.effectTarget === 'enemy') resolved.effectTarget = 'enemy';
  else if (variant.effectTarget === 'self') delete resolved.effectTarget;
  if (variant.effectName) resolved.effectName = variant.effectName;
  if (variant.area) resolved.area = variant.area;
  if (variant.requiresStacks || variant.stackDamage) {
    resolved.mechanics = { ...(base.mechanics ?? {}) };
    if (variant.requiresStacks) resolved.mechanics.requireStacks = variant.requiresStacks;
    if (variant.stackDamage) resolved.mechanics.stackDamage = variant.stackDamage;
  }
  return resolved;
}

/** Alguna fase tiene escalado de daño (para abrir la tirada aunque la base no tenga). */
export function anyPhaseHasDamage(ability: Ability | null | undefined): boolean {
  if (!ability) return false;
  return Array.from({ length: abilityPhaseCount(ability) }, (_, index) => abilityPhase(ability, index))
    .some(phase => hasDamageScaling(phase.damage));
}

export const abilityPhaseKey = (name: string) => `ability:${name}`;
