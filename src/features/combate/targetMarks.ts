import type { CombatBonus, CombatParticipant } from '../../data/combat';
import { abilityStacksSource } from '../../data/abilityMechanics';
import { participantAbilities } from './abilityRules';

/**
 * Marcas / cargas por objetivo (Abolladuras de Vi, cargas de AA por objetivo...): el contador lo guarda
 * el portador en sus bonus (fuente «stacks:<hab>@<objetivo>» o «aahit:<hab>:<objetivo>»), pero son del
 * objetivo: se muestran y se gestionan en la ficha del objetivo, no en la del portador.
 */
export const isPerTargetMarker = (bonus: CombatBonus): boolean => {
  const source = bonus.source ?? '';
  return (bonus.stat === 'stacks' && source.startsWith('stacks:') && source.includes('@')) || source.startsWith('aahit:');
};

export type HeldMark = { key: string; bearerId: string; bearerName: string; bonusId: string; label: string; count: number; max?: number; turns?: number };

/** Marcas que otros participantes le tienen puestas a este objetivo. */
export function heldTargetMarks(target: CombatParticipant, participants: CombatParticipant[]): HeldMark[] {
  const out: HeldMark[] = [];
  for (const bearer of participants) {
    if (bearer.id === target.id) continue;
    for (const bonus of bearer.bonuses ?? []) {
      const source = bonus.source ?? '';
      const counter = bonus.stat === 'stacks' && source.startsWith('stacks:') && source.endsWith(`@${target.id}`);
      const aaHit = source.startsWith('aahit:') && source.endsWith(`:${target.id}`);
      if (!counter && !aaHit) continue;
      if (!(bonus.amount > 0) || (typeof bonus.turns === 'number' && bonus.turns <= 0)) continue;
      out.push({ key: `${bearer.id}:${bonus.id}`, bearerId: bearer.id, bearerName: bearer.name, bonusId: bonus.id, label: bonus.label || 'Marca', count: bonus.amount, max: bonus.maxStacks, turns: bonus.turns });
    }
  }
  return out;
}

export type MarkOption = { key: string; bearerId: string; bearerName: string; abilityName: string; kind: 'counter' | 'status'; max?: number; turns?: number; statusName?: string };

/** Marcas que se le pueden poner a mano: cargas por objetivo y marcas de estado de las habilidades de los demás. */
export function markOptions(target: CombatParticipant, participants: CombatParticipant[], level: number): MarkOption[] {
  const out: MarkOption[] = [];
  for (const bearer of participants) {
    if (bearer.id === target.id || bearer.defeated) continue;
    for (const row of participantAbilities(bearer, level)) {
      if (row.rank < 1) continue;
      const mechanics = row.ability.mechanics;
      if (mechanics?.stacks?.countersPerTarget) {
        out.push({ key: `${bearer.id}|c|${row.name}`, bearerId: bearer.id, bearerName: bearer.name, abilityName: row.name, kind: 'counter', max: mechanics.stacks.max, turns: mechanics.stacks.turns });
      }
      if (mechanics?.mark) {
        out.push({ key: `${bearer.id}|s|${row.name}`, bearerId: bearer.id, bearerName: bearer.name, abilityName: row.name, kind: 'status', turns: mechanics.mark.turns, statusName: (mechanics.mark.name || row.name).slice(0, 80) });
      }
    }
  }
  return out;
}

/** +delta a las cargas por objetivo de una habilidad del portador (0 = se quita el marcador). */
export function bumpCounter(bonuses: CombatBonus[], abilityName: string, targetId: string, delta: number, max: number, turns: number | undefined, newId: () => string): CombatBonus[] {
  const source = abilityStacksSource(abilityName, targetId);
  const current = bonuses.find(bonus => bonus.source === source);
  const next = Math.max(0, Math.min(max, (current?.amount ?? 0) + delta));
  const rest = bonuses.filter(bonus => bonus.source !== source);
  if (next <= 0) return rest;
  return [...rest, { id: current?.id ?? newId(), stat: 'stacks', amount: next, maxStacks: max, ...(turns ? { turns } : current?.turns ? { turns: current.turns } : {}), source, label: abilityName.slice(0, 80) }];
}

/** ±1 a un marcador ya puesto (por id), entre 1 y su máximo. */
export function adjustMarker(bonuses: CombatBonus[], bonusId: string, delta: number): CombatBonus[] {
  return bonuses.map(bonus => (bonus.id === bonusId
    ? { ...bonus, amount: Math.max(1, Math.min(bonus.maxStacks ?? 999, bonus.amount + delta)) }
    : bonus));
}
