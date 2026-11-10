/** Coste, recurso y texto de resultado al usar una habilidad en Combate. */

import type { ResourceId } from '../../data/resources';
import { resolveAbilityResource, resourceLabel } from '../../data/resources';
import type { AbilityDamageRoll } from '../players/abilityDamage';

/** Primer número, o el del rango si el coste es una lista 10/20/30. «1/día» no gasta reserva. */
export function parseAbilityCost(cost: string | undefined, rank: number): number | null {
  if (!cost?.trim()) return null;
  const text = cost.trim();
  const slash = text.match(/^(\d+(?:\s*\/\s*\d+)+)(?:\s+\S.*)?$/);
  if (slash) {
    const values = slash[1].split(/\s*\/\s*/).map(Number);
    const index = Math.min(Math.max(Math.floor(rank), 1), values.length) - 1;
    const value = values[index];
    return Number.isFinite(value) ? value : null;
  }
  const single = text.match(/^(\d+)\s*(.*)$/i);
  if (!single) return null;
  const rest = single[2].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^(por\s+)?(dia|dias|turno|turnos|uso|usos)\b/.test(rest)) return null;
  const value = Number(single[1]);
  return Number.isFinite(value) ? value : null;
}

export type ResourceSpendKind = 'none' | 'hp' | 'pool';

export function resourceSpendKind(resource: ResourceId | undefined): ResourceSpendKind {
  if (!resource || resource === 'ninguno') return 'none';
  if (resource === 'vida') return 'hp';
  return 'pool';
}

export function resolvedSpendKind(
  ability?: { resource?: ResourceId },
  owner?: { resource?: ResourceId },
): { id: ResourceId | undefined; inherited: boolean; kind: ResourceSpendKind; label: string } {
  const resolved = resolveAbilityResource(ability, owner);
  const id = resolved?.id;
  return {
    id,
    inherited: resolved?.inherited === true,
    kind: resourceSpendKind(id),
    label: id ? resourceLabel(id) : 'Recurso',
  };
}

export function numericStat(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.').replace(/[^\d.+-]/g, ''));
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

export function formatDamageType(type?: string): string {
  const key = (type ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!key) return 'daño';
  if (key === 'magic' || key === 'magico' || key === 'ap' || key === 'magico') return 'daño mágico';
  if (key === 'fisico' || key === 'physical' || key === 'ad' || key === 'phys') return 'daño físico';
  if (key === 'true' || key === 'verdadero') return 'daño verdadero';
  if (key === 'mixto' || key === 'mixed' || key === 'hybrid') return 'daño mixto';
  return `daño ${type!.trim()}`;
}

export function formatDamageAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

export function formatUseHeadline(seal: string, input: {
  kind: 'none' | 'roll' | 'error';
  total?: number;
  type?: string;
  error?: string;
}): string {
  const label = `«${seal}»`;
  if (input.kind === 'error') return `${label} ${input.error ?? 'No se pudo calcular el daño'}`;
  if (input.kind === 'none') return `${label} sin daño`;
  return `${label} ${formatDamageAmount(input.total ?? 0)} de ${formatDamageType(input.type)}`;
}

export function formatSpendLine(cost: number, label: string): string {
  return `−${cost} ${label}`;
}

export function formatDiceBreakdown(roll: AbilityDamageRoll): string | undefined {
  const parts: string[] = [];
  for (const entry of roll.contributions) {
    for (const group of entry.roll.groups) {
      const sign = group.sign < 0 ? '−' : '';
      parts.push(`${sign}${group.count}d${group.sides}: [${group.rolls.join(', ')}]`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
