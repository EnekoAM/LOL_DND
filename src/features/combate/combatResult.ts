import { formatStat } from '../calculos/statLine';

/**
 * Resultado de una acción de combate: en pantalla, chips compactos (uno por efecto, con color por tipo);
 * en la consola del navegador, líneas con el desarrollo completo (fórmulas, tiradas, vida antes → después, CDs…).
 */
export type ChipKind =
  | 'damage-physical' | 'damage-magic' | 'damage-true'
  | 'heal' | 'shield' | 'mana'
  | 'debuff' | 'buff' | 'cd' | 'mark' | 'vigor' | 'manual' | 'info' | 'error' | 'crit';

export type ResultChip = { kind: ChipKind; text: string; title?: string };

/** Número legible: 2 decimales máx., coma decimal. */
export const fmt = (value: number): string => formatStat(Math.round(value * 100) / 100);
export const signed = (value: number): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt(Math.abs(value))}`;

const STAT_SHORT: Record<string, string> = {
  hp: 'PV', ac: 'CA', mr: 'RM', mana: 'Maná', ad: 'AD', ap: 'AP', critChance: 'caras crít.', critDamage: 'daño crít.',
  spe: 'Vel.', atkSpePct: '% vel. at.', abSpePct: '% vel. hab.', lethality: 'Letal.', magicPen: 'Pen. mág.',
  armorPenPct: '% pen. arm.', magicPenPct: '% pen. mág.', healShieldPct: '% cur./esc.', tenacityPct: '% tenac.',
  lifeStealPct: '% robo vida', omnivampPct: '% omnisucc.', healthRegen: 'Regen. PV', manaRegen: 'Regen. maná',
};
export const statShort = (stat: string): string => STAT_SHORT[stat] ?? stat;

export type DamageWordType = 'physical' | 'magic' | 'true';
export const damageChipKind = (type: DamageWordType | undefined): ChipKind =>
  type === 'magic' ? 'damage-magic' : type === 'true' ? 'damage-true' : 'damage-physical';

export const CHIP_ICON: Record<ChipKind, string> = {
  'damage-physical': '⚔', 'damage-magic': '✦', 'damage-true': '◆',
  heal: '✚', shield: '⛨', mana: '💧', debuff: '▼', buff: '▲', cd: '⏳', mark: '◈', vigor: '⚡', manual: '✎', info: '•', error: '⚠', crit: '✸',
};

/** «2d6 [3, 5] + 30 = 38» a partir de una tirada de stat. */
export function rollText(roll: { groups: { sign: number; count: number; sides: number; rolls: number[] }[]; flat: number; total: number }): string {
  const parts = roll.groups.map(group => `${group.sign < 0 ? '−' : ''}${group.count}d${group.sides} [${group.rolls.join(', ')}]`);
  if (roll.flat) parts.push(fmt(roll.flat));
  if (parts.length <= 1 && roll.groups.length === 0) return fmt(roll.total);
  return `${parts.join(' + ').replace(/\+ −/g, '− ')} = ${fmt(roll.total)}`;
}
