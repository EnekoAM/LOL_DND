import type { Item } from '../../data/items';
import { milestoneRank } from '../../data/abilityRanks';
import { rollAbilityDamage, rollDamageStat, type DamageStats } from '../players/abilityDamage';
import { formatDamageAmount, formatDamageType } from './combatAbilityUse';

/**
 * Daño de la activa de un ítem, leído del texto (los ítems no tienen campos de daño):
 * «Inflige un 75% de AD como daño físico», «(3d10+9/4d8+10/…) + 30% de AP como daño mágico».
 * Solo cuenta si la activa inflige daño (inflige / infligen). % de vida u otros no se tiran.
 */
export type ItemActiveDamage = {
  /** 0.75 = 75% del AD total. */
  ad?: number;
  ap?: number;
  /** Base en dados por tramo de nivel (1/6/11/16), p. ej. ['3d10+9', '4d8+10', …]. */
  base?: string[];
  type?: string;
};

const DICE_TERM = String.raw`\d*d\d+(?:\s*[+-]\s*\d+)?|\d+`;

export function itemActiveDamage(item: Item | undefined): ItemActiveDamage | null {
  const text = item?.efecto?.activa?.trim();
  if (!text || text === '-' || !/infli[gj]/i.test(text)) return null;
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pct = (stat: 'AD' | 'AP'): number | undefined => {
    const match = plain.match(new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s+)?(?:tu\s+)?${stat}\b`, 'i'));
    return match ? Number(match[1].replace(',', '.')) / 100 : undefined;
  };
  const damage: ItemActiveDamage = {};
  const ad = pct('AD');
  const ap = pct('AP');
  if (ad) damage.ad = ad;
  if (ap) damage.ap = ap;
  const list = plain.match(new RegExp(String.raw`\(\s*((?:${DICE_TERM})(?:\s*/\s*(?:${DICE_TERM}))+)\s*\)`, 'i'));
  if (list && /d\d/i.test(list[1])) damage.base = list[1].split('/').map(part => part.replace(/\s+/g, ''));
  if (!damage.ad && !damage.ap && !damage.base) return null;
  if (/dano\s+fisico/i.test(plain)) damage.type = 'fisico';
  else if (/dano\s+magico/i.test(plain)) damage.type = 'magico';
  else if (/dano\s+verdadero/i.test(plain)) damage.type = 'verdadero';
  else if (damage.ad && !damage.ap) damage.type = 'fisico';
  else if (damage.ap && !damage.ad) damage.type = 'magico';
  return damage;
}

/** Ítem con algo que usar: daño, cooldown o efecto con duración. */
export function itemIsUsable(item: Item | undefined): boolean {
  if (!item) return false;
  return !!itemActiveDamage(item)
    || (typeof item.cooldown === 'number' && item.cooldown > 0)
    || (typeof item.effectDuration === 'number' && item.effectDuration > 0);
}

export type ItemDamageRoll = { total: number; type?: string; detail?: string };

/** Tira el daño: base por tramo de nivel + % de AD/AP (mismo dado que las habilidades). */
export function rollItemDamage(damage: ItemActiveDamage, stats: DamageStats, level: number, random = Math.random): ItemDamageRoll {
  const parts: string[] = [];
  let total = 0;
  if (damage.base?.length) {
    const tier = Math.min(damage.base.length, Math.max(1, milestoneRank(level))) - 1;
    const roll = rollDamageStat(damage.base[tier], random);
    total += roll.total;
    const dice = roll.groups.map(group => `${group.sign < 0 ? '−' : ''}${group.count}d${group.sides}: [${group.rolls.join(', ')}]`);
    parts.push(`Base ${damage.base[tier]} = ${formatDamageAmount(roll.total)}${dice.length ? ` (${dice.join(' · ')})` : ''}`);
  }
  if (damage.ad || damage.ap) {
    const scaled = rollAbilityDamage({ ad: damage.ad ? [damage.ad] : undefined, ap: damage.ap ? [damage.ap] : undefined }, stats, 1, random);
    total += scaled.total;
    for (const entry of scaled.contributions) {
      const dice = entry.roll.groups.map(group => `${group.sign < 0 ? '−' : ''}${group.count}d${group.sides}: [${group.rolls.join(', ')}]`);
      parts.push(`${Math.round(entry.scaling * 100)}% ${entry.stat.toUpperCase()} (${formatDamageAmount(entry.roll.total)}) = ${formatDamageAmount(entry.damage)}${dice.length ? ` · ${dice.join(' · ')}` : ''}`);
    }
  }
  return { total, type: damage.type, detail: parts.join(' · ') || undefined };
}

export const itemUseHeadline = (name: string, roll: ItemDamageRoll | null): string =>
  roll ? `«${name}» ${formatDamageAmount(roll.total)} de ${formatDamageType(roll.type)}` : `«${name}» activado`;
