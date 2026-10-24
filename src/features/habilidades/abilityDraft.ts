import type { Ability, AbilityDamage, AbilityEffect } from '../../data/champions';

export type EffectDraft = {
  name: string;
  values: string;
  duration: string;
};

export type AbilityDraft = {
  name: string;
  description: string;
  cost: string;
  damageType: string;
  ap: string;
  ad: string;
  damageBonus: string;
  effects: EffectDraft[];
};

const EMPTY_EFFECT: EffectDraft = { name: '', values: '', duration: '' };

const formatRatioList = (ratios: number[] | undefined): string =>
  (ratios ?? [])
    .map(ratio => String(Math.round(ratio * 10000) / 100))
    .join(', ');

const formatNumberList = (values: number[] | undefined): string => (values ?? []).join(', ');

/** Los datos viejos guardan el multiplicador como singleTargetMultiplier. */
export function damageBonusOf(damage: AbilityDamage | undefined): number | undefined {
  if (!damage) return undefined;
  if (typeof damage.damageBonus === 'number') return damage.damageBonus;
  const legacy = (damage as AbilityDamage & { singleTargetMultiplier?: unknown }).singleTargetMultiplier;
  return typeof legacy === 'number' && Number.isFinite(legacy) ? legacy : undefined;
}

export function abilityToDraft(ability: Ability | null): AbilityDraft {
  const bonus = damageBonusOf(ability?.damage);
  return {
    name: ability?.name ?? '',
    description: ability?.description ?? '',
    cost: ability?.cost ?? '',
    damageType: ability?.damage?.type ?? '',
    ap: formatRatioList(ability?.damage?.ap),
    ad: formatRatioList(ability?.damage?.ad),
    damageBonus: bonus === undefined ? '' : String(bonus),
    effects: (ability?.effect ?? []).map(effect => ({
      name: effect.name,
      values: formatNumberList(effect.values),
      duration: formatNumberList(effect.duration),
    })),
  };
}

function parseNumberList(text: string, field: string): number[] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(/[,/]+/).map(part => part.trim()).filter(Boolean);
  const numbers = parts.map(part => Number(part.replace('%', '')));
  if (numbers.some(number => !Number.isFinite(number))) {
    throw new Error(`${field} tiene que ser una lista de números. Por ejemplo: 30, 35, 40`);
  }
  return numbers;
}

function parsePercentList(text: string, field: string): number[] | undefined {
  return parseNumberList(text, field)?.map(percent => Math.round(percent * 100) / 10000);
}

function parseBonus(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) throw new Error('El multiplicador tiene que ser un número');
  return value;
}

function parseEffects(effects: EffectDraft[]): AbilityEffect[] | undefined {
  const parsed: AbilityEffect[] = [];
  for (const effect of effects) {
    const name = effect.name.trim();
    const hasDetails = effect.values.trim() !== '' || effect.duration.trim() !== '';
    if (!name && !hasDetails) continue;
    if (!name) throw new Error('Cada efecto necesita un nombre');
    const next: AbilityEffect = { name };
    const values = parseNumberList(effect.values, 'Los valores del efecto');
    const duration = parseNumberList(effect.duration, 'La duración del efecto');
    if (values) next.values = values;
    if (duration) next.duration = duration;
    parsed.push(next);
  }
  return parsed.length ? parsed : undefined;
}

export function draftToAbility(draft: AbilityDraft): Ability {
  const name = draft.name.trim();
  if (!name) throw new Error('La habilidad necesita un nombre');

  const ability: Ability = { name };
  const description = draft.description.trim();
  const cost = draft.cost.trim();
  if (description) ability.description = description;
  if (cost) ability.cost = cost;

  const damage: AbilityDamage = {};
  const type = draft.damageType.trim();
  if (type) damage.type = type;
  const ap = parsePercentList(draft.ap, 'El escalado de AP');
  const ad = parsePercentList(draft.ad, 'El escalado de AD');
  const damageBonus = parseBonus(draft.damageBonus);
  if (ap) damage.ap = ap;
  if (ad) damage.ad = ad;
  if (damageBonus !== undefined) damage.damageBonus = damageBonus;
  if (Object.keys(damage).length) ability.damage = damage;

  const effect = parseEffects(draft.effects);
  if (effect) ability.effect = effect;
  return ability;
}

export const blankEffect = (): EffectDraft => ({ ...EMPTY_EFFECT });
