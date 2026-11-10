import type { Ability, AbilityDamage, AbilityEffect, DamageScalingSource } from '../../data/champions';
import { isResourceId } from '../../data/resources';

export type EffectDraft = {
  name: string;
  values: string;
  duration: string;
};

export type AbilityDraft = {
  name: string;
  description: string;
  learned: boolean;
  cost: string;
  damageType: string;
  ap: string;
  ad: string;
  adSource: DamageScalingSource;
  apSource: DamageScalingSource;
  damageBonus: string;
  effects: EffectDraft[];
  hasStacks: boolean;
  maxStacks: string;
  cooldown: string;
  effectDuration: string;
  effectTarget: 'self' | 'enemy';
  effectName: string;
  resource: string;
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
    learned: ability?.learned === true,
    cost: ability?.cost ?? '',
    damageType: ability?.damage?.type ?? '',
    ap: formatRatioList(ability?.damage?.ap),
    ad: formatRatioList(ability?.damage?.ad),
    adSource: ability?.damage?.adSource ?? 'total',
    apSource: ability?.damage?.apSource ?? 'total',
    damageBonus: bonus === undefined ? '' : String(bonus),
    hasStacks: ability?.hasStacks === true,
    maxStacks: typeof ability?.maxStacks === 'number' ? String(ability.maxStacks) : '',
    cooldown: typeof ability?.cooldown === 'number' ? String(ability.cooldown) : '',
    effectDuration: typeof ability?.effectDuration === 'number' ? String(ability.effectDuration) : '',
    effectTarget: ability?.effectTarget === 'enemy' ? 'enemy' : 'self',
    effectName: ability?.effectName ?? '',
    resource: ability?.resource ?? '',
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

  const ability: Ability = { name, learned: draft.learned };
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
  for (const key of ['adSource', 'apSource'] as const) {
    if (draft[key] !== 'total' && draft[key] !== 'bonus') throw new Error('El origen del escalado debe ser Total o Bonus');
    // Only persist a source for a defined scaling.
    if (key === 'adSource' ? ad : ap) damage[key] = draft[key];
  }
  if (damageBonus !== undefined) damage.damageBonus = damageBonus;
  if (Object.keys(damage).length) ability.damage = damage;

  const effect = parseEffects(draft.effects);
  if (effect) ability.effect = effect;
  if (draft.hasStacks) {
    ability.hasStacks = true;
    const trimmed = draft.maxStacks.trim();
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error('maxStacks tiene que ser un entero entre 1 y 999');
      ability.maxStacks = n;
    }
  }
  const cdText = draft.cooldown.trim();
  if (cdText) {
    const n = Number(cdText);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error('cooldown tiene que ser un entero entre 1 y 999');
    ability.cooldown = n;
  }
  const edText = draft.effectDuration.trim();
  if (edText) {
    const n = Number(edText);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error('efecto tiene que ser un entero entre 1 y 999');
    ability.effectDuration = n;
  }
  if (draft.effectTarget === 'enemy') ability.effectTarget = 'enemy';
  const effectName = draft.effectName.trim();
  if (effectName.length > 80) throw new Error('El nombre del efecto no puede superar 80 caracteres');
  if (effectName) ability.effectName = effectName;
  const resource = draft.resource.trim();
  if (resource) {
    if (!isResourceId(resource)) throw new Error('El recurso no es válido');
    ability.resource = resource;
  }
  return ability;
}

export const blankEffect = (): EffectDraft => ({ ...EMPTY_EFFECT });
