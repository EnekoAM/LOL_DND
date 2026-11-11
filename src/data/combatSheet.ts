import { CHAMPIONS, type Champion } from './champions';
import type { CombatParticipant, CombatSheet } from './combat';
import type { Npc } from './npcs';

/** Lo que se copia de un NPC al combate (sin lore ni encuadres). */
export type CombatNpcSheet = Pick<Npc, 'id' | 'name' | 'kind' | 'type' | 'level' | 'image' | 'stats' | 'abilities'>;

/** Copia profunda en JSON plano (sin undefined ni referencias compartidas). */
const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function snapshotChampion(champion: Champion): CombatSheet {
  return { kind: 'champion', capturedAt: new Date().toISOString(), data: cloneJson(champion) as unknown as Record<string, unknown> };
}

export function snapshotNpc(npc: Npc): CombatSheet {
  const { id, name, kind, type, level, image, stats, abilities } = npc;
  const data: CombatNpcSheet = { id, name, kind, type, level, image, stats, abilities };
  return { kind: 'npc', capturedAt: new Date().toISOString(), data: cloneJson(data) as unknown as Record<string, unknown> };
}

/** Ficha del campeón de este participante: su copia; si no tiene (combates viejos), la base. */
export function participantChampion(participant: CombatParticipant): Champion | null {
  if (participant.kind !== 'champion') return null;
  if (participant.sheet?.kind === 'champion') {
    const data = participant.sheet.data as unknown as Champion;
    if (data && typeof data === 'object' && data.abilities) return data;
  }
  return participant.sourceId ? CHAMPIONS.find(entry => entry.champion === participant.sourceId) ?? null : null;
}

/** Ficha del NPC: su copia; si no, la base de la lista cargada (solo admin la tiene entera). */
export function participantNpc(participant: CombatParticipant, npcs: readonly Npc[] = []): CombatNpcSheet | null {
  if (participant.kind !== 'npc') return null;
  if (participant.sheet?.kind === 'npc') return participant.sheet.data as unknown as CombatNpcSheet;
  return participant.sourceId ? npcs.find(npc => npc.id === participant.sourceId) ?? null : null;
}

/** Rellena la copia que falte (combates creados antes de existir). Devuelve el mismo objeto si no cambia. */
export function withSheet(participant: CombatParticipant, npcs: readonly Npc[]): CombatParticipant {
  if (participant.sheet || !participant.sourceId) return participant;
  if (participant.kind === 'champion') {
    const champion = CHAMPIONS.find(entry => entry.champion === participant.sourceId);
    return champion ? { ...participant, sheet: snapshotChampion(champion) } : participant;
  }
  if (participant.kind === 'npc') {
    const npc = npcs.find(entry => entry.id === participant.sourceId);
    return npc ? { ...participant, sheet: snapshotNpc(npc) } : participant;
  }
  return participant;
}

export const needsSheet = (participant: CombatParticipant): boolean =>
  (participant.kind === 'champion' || participant.kind === 'npc') && !participant.sheet && !!participant.sourceId;
