import type { Champion } from '../../data/champions';
import type { CombatState } from '../../data/combat';
import { npcKindLabel, type Npc } from '../../data/npcs';

export type AddMode = 'player' | 'npc' | 'champion' | 'custom';

export type SearchOption = {
  id: string;
  name: string;
  image?: string;
  hint?: string;
  badge: string;
};

export function emptyCombatState(): CombatState {
  return { active: false, round: 1, turnIndex: 0, participants: [] };
}

/** Sin tildes ni mayúsculas. */
export const foldText = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function npcOption(npc: Npc): SearchOption {
  const bits = [npcKindLabel(npc.kind), npc.type, npc.region].filter(Boolean);
  return {
    id: npc.id,
    name: npc.name,
    image: npc.image || undefined,
    hint: bits.join(' · ') || undefined,
    badge: 'NPC',
  };
}

export function championOption(champion: Champion): SearchOption {
  const bits = [champion.role, champion.region].filter(Boolean);
  return {
    id: champion.champion,
    name: champion.champion,
    image: champion.image || undefined,
    hint: bits.join(' · ') || undefined,
    badge: 'Campeón',
  };
}

export function kindTag(kind: string): string {
  if (kind === 'player') return 'player';
  if (kind === 'champion') return 'campeón';
  if (kind === 'npc') return 'npc';
  return 'custom';
}

/** Icono compacto por nombre de estado (fallback ✦). */
export function effectIcon(name: string): string {
  const key = foldText(name);
  const map: Record<string, string> = {
    aturdido: '💫',
    envenenado: '☠️',
    ralentizado: '🐌',
    quemado: '🔥',
    silenciado: '🔇',
    enraizado: '🌿',
    cegado: '👁',
    invisible: '👻',
    escudo: '🛡',
    sangrado: '🩸',
    'heridas graves': '💔',
    'mr reducido': '🔷',
    'ac reducido': '🔶',
  };
  return map[key] ?? '✦';
}

/** MR/AC reducido admiten un valor numérico en el chip. */
export function effectNeedsValue(name: string): boolean {
  const key = foldText(name);
  return key === 'mr reducido' || key === 'ac reducido';
}

export function effectToneClass(name: string): string {
  const key = foldText(name);
  if (key === 'heridas graves' || key === 'sangrado' || key === 'quemado') return 'combat-effect--red';
  if (key === 'mr reducido') return 'combat-effect--blue';
  if (key === 'ac reducido') return 'combat-effect--amber';
  if (key === 'envenenado' || key === 'enraizado') return 'combat-effect--green';
  if (key === 'escudo' || key === 'invisible') return 'combat-effect--silver';
  return '';
}

/** Etiqueta del chip: «AC −2» / «MR −1» si hay valor, y «×N» si hay stacks. */
export function formatEffectLabel(effect: { name: string; value?: number; stacks?: number }): string {
  let label = effect.name;
  if (typeof effect.value === 'number' && effect.value > 0 && effectNeedsValue(effect.name)) {
    const abbr = foldText(effect.name).startsWith('ac') ? 'AC' : 'MR';
    label = `${abbr} −${effect.value}`;
  }
  if (typeof effect.stacks === 'number' && effect.stacks > 0) label = `${label} ×${effect.stacks}`;
  return label;
}
