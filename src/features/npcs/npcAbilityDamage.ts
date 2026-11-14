import type { AbilityDamage } from '../../data/champions';
import type { NpcAbility, NpcStats } from '../../data/npcs';
import { formatPercentList } from '../../lib/format';

/** El AD/AP del NPC es un texto de dados (4d4+2, 3d4+2d2…). */
const looksLikeDice = (value: unknown): value is string =>
  typeof value === 'string' && /\d+d\d+/i.test(value.trim());

/**
 * En el motor, 1 = 100 %. Algunas habilidades de NPC se guardaron con el
 * porcentaje literal (100, a veces 10 o 1000) en lugar del ratio.
 */
export function interpretNpcRatios(ratios: number[] | undefined): number[] | undefined {
  if (!ratios?.length) return undefined;
  if (ratios.length === 1 && (ratios[0] === 10 || ratios[0] === 100 || ratios[0] === 1000)) return [1];
  if (ratios.every(value => value >= 10)) return ratios.map(value => value / 100);
  return ratios;
}

const isFullRatio = (ratios: number[] | undefined): boolean =>
  !!ratios?.length && ratios.every(value => value === 1);

const statText = (value: unknown): string | undefined => {
  if (looksLikeDice(value)) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

/** Texto de daño para la tarjeta y el modal de una habilidad de NPC. */
export function formatNpcAbilityDamage(
  ability: Pick<NpcAbility, 'damage'>,
  stats: Pick<NpcStats, 'ad' | 'ap'>,
): string | undefined {
  const damage = ability.damage;
  if (!damage) return undefined;

  const type = damage.type?.trim();
  const adRatios = interpretNpcRatios(damage.ad);
  const apRatios = interpretNpcRatios(damage.ap);
  const lines: string[] = [];
  const adStat = statText(stats.ad);
  const apStat = statText(stats.ap);

  if (adRatios) {
    if (isFullRatio(adRatios) && adStat) {
      lines.push(`Daño: ${adStat}${type ? ` ${type}` : ''}`);
    } else if (adStat) {
      lines.push(`AD: ${formatPercentList(adRatios)} de ${adStat}${type ? ` ${type}` : ''}`);
    } else {
      lines.push(`AD: ${formatPercentList(adRatios)} (${damage.adSource ?? 'total'})`);
    }
  }

  if (apRatios) {
    if (isFullRatio(apRatios) && apStat && !adRatios) {
      lines.push(`Daño: ${apStat}${type ? ` ${type}` : ''}`);
    } else if (isFullRatio(apRatios) && apStat) {
      lines.push(`AP: ${apStat}`);
    } else {
      lines.push(`AP: ${formatPercentList(apRatios)}`);
    }
  }

  if (!lines.length && type) lines.push(`Daño: ${type}`);
  return lines.length ? lines.join(' · ') : undefined;
}

/** Copia con ratios interpretados, para el formulario de edición. */
export function withInterpretedNpcDamage(ability: NpcAbility): NpcAbility {
  if (!ability.damage) return ability;
  const ad = interpretNpcRatios(ability.damage.ad);
  const ap = interpretNpcRatios(ability.damage.ap);
  if (ad === ability.damage.ad && ap === ability.damage.ap) return ability;
  const damage: AbilityDamage = { ...ability.damage };
  if (ad) damage.ad = ad;
  else delete damage.ad;
  if (ap) damage.ap = ap;
  else delete damage.ap;
  return { ...ability, damage };
}
