/** Claves de players.stacks / players.cooldowns: ítems y habilidades. */

export function itemStackKey(nombre: string): string {
  return `item:${nombre.trim()}`;
}

export function abilityStackKey(abilityName: string): string {
  return `ability:${abilityName.trim()}`;
}

/** Alias semántico: mismas claves que stacks. */
export const itemCooldownKey = itemStackKey;
export const abilityCooldownKey = abilityStackKey;

export function readStack(stacks: Record<string, number> | undefined, key: string): number {
  const value = stacks?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export const readCooldown = readStack;

/** Baja todos los cooldowns en 1 (mín. 0). */
export function tickCooldowns(cooldowns: Record<string, number> | undefined): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(cooldowns ?? {})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    next[key] = Math.max(0, Math.trunc(value) - 1);
  }
  return next;
}

/** Alias: mismas claves item:<nombre>. */
export const itemActiveEffectKey = itemStackKey;
export const readActiveEffect = readStack;

/** Baja efectos activos en 1 (mín. 0). El merge del PATCH sobrescribe cada clave. */
export function tickActiveEffects(effects: Record<string, number> | undefined): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(effects ?? {})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    next[key] = Math.max(0, Math.trunc(value) - 1);
  }
  return next;
}
