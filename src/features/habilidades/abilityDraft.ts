import { isAreaEmpty, normalizeArea, type AreaPattern } from '../../data/areaPattern';
import type { Ability, AbilityDamage, AbilityEffect, AbilityVariant, DamageScalingSource } from '../../data/champions';
import { type AbilityCastPool, type AbilityMechanics, type CastPoolStat } from '../../data/abilityMechanics';
import type { EffectBonusConfig } from '../../data/effectBonus';
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
  /** Aplica efectos de impacto (reglas «Al aplicar efecto de impacto»). */
  appliesOnHit: boolean;
  maxStacks: string;
  cooldown: string;
  effectDuration: string;
  effectTarget: 'self' | 'enemy';
  effectName: string;
  resource: string;
  /** Fases 2, 3… En blanco = igual que la fase 1. */
  variants: VariantDraft[];
  phaseMode: 'sequential' | 'choose';
  /** Tablero de área (null = sin área). */
  area: AreaPattern | null;
  /** Mecánicas de combate (cargas, cargas por impacto, buff al activar, estado de la pasiva…). */
  mechanics: MechanicsDraft;
};

/** Mecánicas de combate en el formulario: cada bloque con su interruptor; los números como texto. */
export type MechanicsDraft = {
  charges: boolean;
  chargesStart: string;
  chargesMax: string;
  /** Turnos de recarga por rango: «45, 40, 35, 30, 25». */
  chargesRecharge: string;
  /** Turnos que quita a la recarga cada campeón enemigo alcanzado (vacío = nada). */
  chargesReduce: string;
  stacks: boolean;
  stacksTurns: string;
  stacksMax: string;
  /** Cargas necesarias para activar (vacío = no bloquea). */
  stacksRequired: string;
  buff: boolean;
  buffTurns: string;
  /** % velocidad de ataque por rango. */
  buffAttackSpeed: string;
  /** % AD de los AA por rango. */
  buffAaAd: string;
  buffAaPassive: boolean;
  appliesPassive: boolean;
  critBonus: boolean;
  /** % de daño extra del AA por cada cara de prob. de crítico. */
  critPctPerFace: string;
  critNoDamage: boolean;
  critDoublesPassive: boolean;
  /** Reglas de efecto (el mismo configurador que los ítems); null = ninguna. */
  effectRules: EffectBonusConfig | null;
  learned: boolean;
  learnedStat: string;
  /** Valor por rango: «20, 22, 25, 27, 30». */
  learnedValues: string;
  pool: boolean;
  poolKind: 'shield' | 'heal';
  poolStat: CastPoolStat;
  /** % de la stat por rango: «60, 65, 70, 75, 80». */
  poolValues: string;
  poolTurns: string;
  poolHitStat: CastPoolStat;
  /** % por campeón enemigo alcanzado (vacío = nada). */
  poolHitPct: string;
  allEnemies: boolean;
  shield: boolean;
  shieldStatus: string;
  shieldTurns: string;
  shieldBreakTurns: string;
  shieldMultiplier: string;
  poolTarget: 'self' | 'ally';
  poolRequiresHit: boolean;
  poolAlliesToo: boolean;
  recast: boolean;
  recastTimes: string;
  recastTurns: string;
  selfStatus: boolean;
  selfStatusName: string;
  selfStatusTurns: string;
  selfStatusValue: string;
  noAction: boolean;
  poolFlat: string;
  poolFlatByLevel: boolean;
  poolDelay: string;
  innate: boolean;
  innateFlat: string;
  innateStat: CastPoolStat;
  innateValues: string;
  innateCd: string;
  innateReduce: string;
};

export function mechanicsToDraft(mechanics: AbilityMechanics | undefined): MechanicsDraft {
  const list = (values: number[] | undefined) => (values ?? []).join(', ');
  return {
    charges: !!mechanics?.charges,
    chargesStart: mechanics?.charges ? String(mechanics.charges.start) : '',
    chargesMax: mechanics?.charges ? String(mechanics.charges.max) : '',
    chargesRecharge: list(mechanics?.charges?.recharge),
    chargesReduce: mechanics?.charges?.reducePerChampionHit ? String(mechanics.charges.reducePerChampionHit) : '',
    stacks: !!mechanics?.stacks,
    stacksTurns: mechanics?.stacks ? String(mechanics.stacks.turns) : '',
    stacksMax: mechanics?.stacks ? String(mechanics.stacks.max) : '',
    stacksRequired: mechanics?.stacks?.required ? String(mechanics.stacks.required) : '',
    buff: !!mechanics?.buff,
    buffTurns: mechanics?.buff ? String(mechanics.buff.turns) : '',
    buffAttackSpeed: list(mechanics?.buff?.attackSpeed),
    buffAaAd: list(mechanics?.buff?.aaAd),
    buffAaPassive: mechanics?.buff?.aaAppliesPassive === true,
    appliesPassive: mechanics?.appliesPassive === true,
    critBonus: !!mechanics?.aaCritBonus,
    critPctPerFace: mechanics?.aaCritBonus ? String(mechanics.aaCritBonus.pctPerFace) : '',
    critNoDamage: mechanics?.critNoDamage === true,
    critDoublesPassive: mechanics?.critDoublesPassive === true,
    effectRules: mechanics?.effectRules ?? null,
    learned: !!mechanics?.learnedStats?.length,
    learnedStat: mechanics?.learnedStats?.[0]?.stat ?? 'atkSpePct',
    learnedValues: list(mechanics?.learnedStats?.[0]?.values),
    pool: !!mechanics?.castPool,
    poolKind: mechanics?.castPool?.kind ?? 'shield',
    poolStat: mechanics?.castPool?.ratios[0]?.stat ?? 'bonusAd',
    poolValues: list(mechanics?.castPool?.ratios[0]?.values),
    poolTurns: mechanics?.castPool?.turns ? String(mechanics.castPool.turns) : '',
    poolHitStat: mechanics?.castPool?.perChampionHit?.stat ?? 'hp',
    poolHitPct: mechanics?.castPool?.perChampionHit ? String(mechanics.castPool.perChampionHit.pct) : '',
    allEnemies: mechanics?.allEnemies === true,
    shield: !!mechanics?.spellShield,
    shieldStatus: mechanics?.spellShield?.status ?? 'Escudo de hechizos',
    shieldTurns: mechanics?.spellShield ? String(mechanics.spellShield.turns) : '1',
    shieldBreakTurns: mechanics?.spellShield ? String(mechanics.spellShield.breakTurns) : '3',
    shieldMultiplier: mechanics?.spellShield ? String(mechanics.spellShield.learnedMultiplier) : '2',
    poolTarget: mechanics?.castPool?.target === 'ally' ? 'ally' : 'self',
    poolRequiresHit: mechanics?.castPool?.requiresHit === true,
    poolAlliesToo: mechanics?.castPool?.alliesToo === true,
    recast: !!mechanics?.recast,
    recastTimes: mechanics?.recast ? String(mechanics.recast.times) : '1',
    recastTurns: mechanics?.recast ? String(mechanics.recast.turns) : '3',
    selfStatus: !!mechanics?.selfStatus,
    selfStatusName: mechanics?.selfStatus?.name ?? '',
    selfStatusTurns: mechanics?.selfStatus ? String(mechanics.selfStatus.turns) : '1',
    selfStatusValue: mechanics?.selfStatus?.value ? String(mechanics.selfStatus.value) : '',
    noAction: mechanics?.noAction === true,
    poolFlat: list(mechanics?.castPool?.flat),
    poolFlatByLevel: mechanics?.castPool?.flatByLevel === true,
    poolDelay: mechanics?.castPool?.delayTurns ? String(mechanics.castPool.delayTurns) : '',
    innate: !!mechanics?.innateShield,
    innateFlat: list(mechanics?.innateShield?.flat),
    innateStat: mechanics?.innateShield?.ratios[0]?.stat ?? 'ap',
    innateValues: list(mechanics?.innateShield?.ratios[0]?.values),
    innateCd: list(mechanics?.innateShield?.cooldown),
    innateReduce: mechanics?.innateShield?.reducePerHit ? String(mechanics.innateShield.reducePerHit) : '',
  };
}

function mechInt(text: string, field: string, min: number, max: number, fallback?: number): number {
  const trimmed = text.trim();
  if (!trimmed && fallback !== undefined) return fallback;
  const n = Number(trimmed);
  if (!trimmed || !Number.isInteger(n) || n < min || n > max) throw new Error(`${field} tiene que ser un entero entre ${min} y ${max}`);
  return n;
}

function mechList(text: string, field: string, integer: boolean): number[] | undefined {
  const values = parseNumberList(text, field);
  if (!values) return undefined;
  if (values.length > 5) throw new Error(`${field}: como máximo 5 valores (uno por rango)`);
  if (integer && values.some(value => !Number.isInteger(value) || value < 1 || value > 99)) throw new Error(`${field}: enteros entre 1 y 99`);
  return values;
}

export function draftToMechanics(draft: MechanicsDraft): AbilityMechanics | undefined {
  const out: AbilityMechanics = {};
  if (draft.charges) {
    const max = mechInt(draft.chargesMax, 'Cargas: máximo', 1, 99);
    const start = mechInt(draft.chargesStart, 'Cargas: al empezar', 0, max, max);
    const recharge = mechList(draft.chargesRecharge, 'Cargas: recarga (turnos)', true);
    if (!recharge) throw new Error('Cargas: pon los turnos de recarga (por rango)');
    out.charges = { start, max, recharge };
    if (draft.chargesReduce.trim()) out.charges.reducePerChampionHit = mechInt(draft.chargesReduce, 'Cargas: turnos menos por campeón alcanzado', 1, 99);
  }
  if (draft.stacks) {
    const max = mechInt(draft.stacksMax, 'Cargas por impacto: máximo', 1, 99);
    out.stacks = { turns: mechInt(draft.stacksTurns, 'Cargas por impacto: duración', 1, 99), max };
    if (draft.stacksRequired.trim()) out.stacks.required = mechInt(draft.stacksRequired, 'Cargas por impacto: para activar', 1, max);
  }
  if (draft.buff) {
    out.buff = { turns: mechInt(draft.buffTurns, 'Al activar: duración', 1, 99) };
    const speed = mechList(draft.buffAttackSpeed, 'Al activar: % vel. ataque', false);
    if (speed) out.buff.attackSpeed = speed;
    const aaAd = mechList(draft.buffAaAd, 'Al activar: % AD de los AA', false);
    if (aaAd) out.buff.aaAd = aaAd;
    if (draft.buffAaPassive) out.buff.aaAppliesPassive = true;
  }
  if (draft.appliesPassive) out.appliesPassive = true;
  if (draft.critBonus) {
    const text = draft.critPctPerFace.trim();
    const pct = text ? Number(text.replace(',', '.')) : 0;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Daño por prob. de crítico: % por cara entre 0 y 100');
    out.aaCritBonus = { pctPerFace: pct };
  }
  if (draft.critNoDamage) out.critNoDamage = true;
  if (draft.critDoublesPassive) out.critDoublesPassive = true;
  if (draft.effectRules?.rules.length) out.effectRules = draft.effectRules;
  if (draft.learned) {
    const values = mechList(draft.learnedValues, 'Por tenerla aprendida: valor por rango', false);
    if (!values) throw new Error('Por tenerla aprendida: pon el valor por rango');
    out.learnedStats = [{ stat: draft.learnedStat, values }];
  }
  if (draft.pool) {
    const values = mechList(draft.poolValues, 'Escudo / cura al usarla: % por rango', false);
    const pool: AbilityCastPool = { kind: draft.poolKind, ratios: values ? [{ stat: draft.poolStat, values }] : [] };
    if (draft.poolTurns.trim()) pool.turns = mechInt(draft.poolTurns, 'Escudo / cura: turnos', 1, 99);
    const hit = draft.poolHitPct.trim() ? Number(draft.poolHitPct.replace(',', '.')) : 0;
    if (!Number.isFinite(hit) || hit < 0 || hit > 100) throw new Error('Escudo / cura: % por campeón alcanzado entre 0 y 100');
    if (hit > 0) pool.perChampionHit = { stat: draft.poolHitStat, pct: hit };
    const flat = mechList(draft.poolFlat, 'Escudo / cura: base por rango', false);
    if (flat) pool.flat = flat;
    if (draft.poolFlatByLevel) pool.flatByLevel = true;
    if (draft.poolDelay.trim()) pool.delayTurns = mechInt(draft.poolDelay, 'Cura retrasada: turnos', 1, 99);
    if (!pool.ratios.length && !pool.perChampionHit && !pool.flat) throw new Error('Escudo / cura al usarla: pon el % por rango');
    if (draft.poolTarget === 'ally') pool.target = 'ally';
    if (draft.poolRequiresHit) pool.requiresHit = true;
    if (draft.poolAlliesToo) pool.alliesToo = true;
    out.castPool = pool;
  }
  if (draft.recast) out.recast = { times: mechInt(draft.recastTimes, 'Recast: veces', 1, 9), turns: mechInt(draft.recastTurns, 'Recast: turnos', 1, 99) };
  if (draft.selfStatus) {
    const name = draft.selfStatusName.trim();
    if (!name) throw new Error('Estado propio: pon el nombre');
    out.selfStatus = { name, turns: mechInt(draft.selfStatusTurns, 'Estado propio: turnos', 1, 99) };
    if (draft.selfStatusValue.trim()) out.selfStatus.value = mechInt(draft.selfStatusValue, 'Estado propio: valor', 1, 999);
  }
  if (draft.noAction) out.noAction = true;
  if (draft.innate) {
    const values = mechList(draft.innateValues, 'Escudo automático: % por rango', false);
    const flat = mechList(draft.innateFlat, 'Escudo automático: base por rango', false);
    const cooldown = mechList(draft.innateCd, 'Escudo automático: CD (turnos)', true);
    if (!cooldown) throw new Error('Escudo automático: pon el CD por rango');
    if (!values && !flat) throw new Error('Escudo automático: pon base o %');
    out.innateShield = { ratios: values ? [{ stat: draft.innateStat, values }] : [], cooldown, ...(flat ? { flat } : {}) };
    if (draft.innateReduce.trim()) {
      const per = Number(draft.innateReduce.replace(',', '.'));
      if (!Number.isFinite(per) || per <= 0 || per > 99) throw new Error('Escudo automático: CD menos por enemigo entre 0 y 99');
      out.innateShield.reducePerHit = per;
    }
  }
  if (draft.allEnemies) out.allEnemies = true;
  if (draft.shield) {
    const status = draft.shieldStatus.trim();
    if (!status) throw new Error('Escudo de hechizos: pon el nombre del estado');
    const multiplier = Number(draft.shieldMultiplier.replace(',', '.'));
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) throw new Error('Escudo de hechizos: multiplicador entre 1 y 10');
    out.spellShield = { status, turns: mechInt(draft.shieldTurns, 'Escudo de hechizos: turnos', 1, 99), breakTurns: mechInt(draft.shieldBreakTurns, 'Escudo de hechizos: turnos tras romperse', 1, 99), learnedMultiplier: multiplier };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Fase alternativa. Los textos vacíos y '' heredan de la base. */
export type VariantDraft = {
  name: string;
  description: string;
  cost: string;
  resource: string;
  damageType: string;
  ap: string;
  ad: string;
  adSource: DamageScalingSource | '';
  apSource: DamageScalingSource | '';
  damageBonus: string;
  effects: EffectDraft[];
  cooldown: string;
  effectDuration: string;
  effectTarget: 'self' | 'enemy' | '';
  effectName: string;
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
    appliesOnHit: ability?.appliesOnHit === true,
    maxStacks: typeof ability?.maxStacks === 'number' ? String(ability.maxStacks) : '',
    cooldown: typeof ability?.cooldown === 'number' ? String(ability.cooldown) : '',
    effectDuration: typeof ability?.effectDuration === 'number' ? String(ability.effectDuration) : '',
    effectTarget: ability?.effectTarget === 'enemy' ? 'enemy' : 'self',
    effectName: ability?.effectName ?? '',
    resource: ability?.resource ?? '',
    effects: effectsToDraft(ability?.effect),
    variants: (ability?.variants ?? []).map(variantToDraft),
    phaseMode: ability?.phaseMode === 'choose' ? 'choose' : 'sequential',
    area: normalizeArea(ability?.area) ?? null,
    mechanics: mechanicsToDraft(ability?.mechanics),
  };
}

function effectsToDraft(effects: AbilityEffect[] | undefined): EffectDraft[] {
  return (effects ?? []).map(effect => ({
    name: effect.name,
    values: formatNumberList(effect.values),
    duration: formatNumberList(effect.duration),
  }));
}

export function variantToDraft(variant: AbilityVariant): VariantDraft {
  const bonus = damageBonusOf(variant.damage);
  return {
    name: variant.name ?? '',
    description: variant.description ?? '',
    cost: variant.cost ?? '',
    resource: variant.resource ?? '',
    damageType: variant.damage?.type ?? '',
    ap: formatRatioList(variant.damage?.ap),
    ad: formatRatioList(variant.damage?.ad),
    adSource: variant.damage?.adSource ?? '',
    apSource: variant.damage?.apSource ?? '',
    damageBonus: bonus === undefined ? '' : String(bonus),
    effects: effectsToDraft(variant.effect),
    cooldown: typeof variant.cooldown === 'number' ? String(variant.cooldown) : '',
    effectDuration: typeof variant.effectDuration === 'number' ? String(variant.effectDuration) : '',
    effectTarget: variant.effectTarget ?? '',
    effectName: variant.effectName ?? '',
  };
}

export const blankVariant = (): VariantDraft => ({
  name: '',
  description: '',
  cost: '',
  resource: '',
  damageType: '',
  ap: '',
  ad: '',
  adSource: '',
  apSource: '',
  damageBonus: '',
  effects: [],
  cooldown: '',
  effectDuration: '',
  effectTarget: '',
  effectName: '',
});

function parseTurns(text: string, field: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error(`${field} tiene que ser un entero entre 1 y 999`);
  return n;
}

function draftToVariant(draft: VariantDraft, index: number): AbilityVariant {
  const label = `Fase ${index + 2}`;
  const variant: AbilityVariant = {};
  const name = draft.name.trim();
  if (name.length > 80) throw new Error(`${label}: el nombre no puede superar 80 caracteres`);
  if (name) variant.name = name;
  const description = draft.description.trim();
  if (description) variant.description = description;
  const cost = draft.cost.trim();
  if (cost) variant.cost = cost;
  const resource = draft.resource.trim();
  if (resource) {
    if (!isResourceId(resource)) throw new Error(`${label}: el recurso no es válido`);
    variant.resource = resource;
  }
  const damage: AbilityDamage = {};
  const type = draft.damageType.trim();
  if (type) damage.type = type;
  const ap = parsePercentList(draft.ap, `${label}: el escalado de AP`);
  const ad = parsePercentList(draft.ad, `${label}: el escalado de AD`);
  if (ap) damage.ap = ap;
  if (ad) damage.ad = ad;
  if (draft.adSource) damage.adSource = draft.adSource;
  if (draft.apSource) damage.apSource = draft.apSource;
  const damageBonus = parseBonus(draft.damageBonus);
  if (damageBonus !== undefined) damage.damageBonus = damageBonus;
  if (Object.keys(damage).length) variant.damage = damage;
  const effect = parseEffects(draft.effects);
  if (effect) variant.effect = effect;
  const cooldown = parseTurns(draft.cooldown, `${label}: el cooldown`);
  if (cooldown !== undefined) variant.cooldown = cooldown;
  const effectDuration = parseTurns(draft.effectDuration, `${label}: el efecto`);
  if (effectDuration !== undefined) variant.effectDuration = effectDuration;
  if (draft.effectTarget) variant.effectTarget = draft.effectTarget;
  const effectName = draft.effectName.trim();
  if (effectName.length > 80) throw new Error(`${label}: el nombre del efecto no puede superar 80 caracteres`);
  if (effectName) variant.effectName = effectName;
  return variant;
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
  if (draft.appliesOnHit) ability.appliesOnHit = true;
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
  if (draft.variants.length > 12) throw new Error('Como máximo 13 fases por habilidad');
  const variants = draft.variants.map(draftToVariant);
  if (variants.length) {
    ability.variants = variants;
    if (draft.phaseMode === 'choose') ability.phaseMode = 'choose';
  }
  if (draft.area && !isAreaEmpty(draft.area)) ability.area = draft.area;
  const mechanics = draftToMechanics(draft.mechanics);
  if (mechanics) ability.mechanics = mechanics;
  return ability;
}

export const blankEffect = (): EffectDraft => ({ ...EMPTY_EFFECT });
