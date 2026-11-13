import { isAreaEmpty, normalizeArea, type AreaPattern } from '../../data/areaPattern';
import type { Ability, AbilityDamage, AbilityEffect, AbilityVariant, DamageScalingSource } from '../../data/champions';
import { type AbilityCastPool, type AbilityLevelThreshold, type AbilityMechanics, type CastPoolStat } from '../../data/abilityMechanics';
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
  hp: string;
  hpSource: 'max' | 'current' | 'missing' | 'bonus' | '';
  hpFrom: 'target' | 'self' | '';
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

/** Un umbral de nivel de campeón en el formulario (mejoras que se acumulan). */
export type LevelThresholdDraft = {
  level: string;
  name: string;
  rangeBonus: string;
  permanentMaxStacks: boolean;
  waveType: '' | 'magic' | 'true' | 'physical';
  waveAd: string;
  waveAdSource: 'total' | 'bonus';
  waveAp: string;
  waveApSource: 'total' | 'bonus';
  waveRequiresMaxStacks: boolean;
};

export const blankLevelThreshold = (): LevelThresholdDraft => ({
  level: '',
  name: '',
  rangeBonus: '',
  permanentMaxStacks: false,
  waveType: '',
  waveAd: '',
  waveAdSource: 'total',
  waveAp: '',
  waveApSource: 'total',
  waveRequiresMaxStacks: false,
});

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
  /** Cargas necesarias para activar ESTA habilidad (vacío = no bloquea). */
  stacksRequired: string;
  stacksOnAa: boolean;
  stacksOnAbilityHit: boolean;
  stacksStat: string;
  stacksPerStack: string;
  stacksPerTarget: boolean;
  stacksRequiresDamage: boolean;
  stacksOnChampionCc: boolean;
  stacksOnNonChampionKill: boolean;
  stacksConsumeAtMax: boolean;
  stacksOnMaxCooldown: string;
  stacksOnMaxHealSelf: string;
  stacksOnMaxHealAlly: string;
  stacksOnMaxHealAlliesToo: boolean;
  stacksOnMaxHealFlat: string;
  stacksOnMaxHealFlatByLevel: boolean;
  stacksArmArmedAaAtMax: boolean;
  stacksArmArmedAaTurns: string;
  cleanse: boolean;
  mark: boolean;
  markTurns: string;
  markDetonate: 'aa' | 'ability' | 'both';
  markDamageOnDetonate: boolean;
  markRefundFlat: string;
  markRefundCost: boolean;
  requireStacks: boolean;
  requireStacksFrom: string;
  requireStacksCount: string;
  requireStacksConsume: boolean;
  lifeSteal: boolean;
  /** % de eficacia (vacío = 100). */
  lifeStealEfficacy: string;
  permanentStacks: boolean;
  permanentOnChampionHit: boolean;
  grantPermanent: boolean;
  grantPermanentFrom: string;
  grantPermanentMax: string;
  grantPermanentOnKill: boolean;
  stackDamage: boolean;
  stackDamageFrom: string;
  stackDamagePct: string;
  stackDamageType: 'physical' | 'magic' | 'true';
  stackDamageByLevel: boolean;
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
  poolStat2: CastPoolStat;
  poolValues2: string;
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
  selfStatusStat: string;
  selfStatusAmount: string;
  selfStatusPct: string;
  selfStatusFixedAttacks: string;
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
  sectorShots: boolean;
  sectorShotsCount: string;
  sectorShotsCooldown: string;
  sectorShotsByLevel: boolean;
  toggle: boolean;
  toggleTurns: string;
  toggleFixedAttacks: string;
  execute: boolean;
  executeHpPct: string;
  executeFear: boolean;
  executeFearName: string;
  executeFearTurns: string;
  executeFearValue: string;
  empoweredAa: boolean;
  empoweredHeal: string;
  empoweredCd: string;
  empoweredByLevel: boolean;
  empoweredReduceAbility: string;
  empoweredReduceStruck: string;
  empoweredSkipHp: string;
  trap: boolean;
  trapTurns: string;
  trapName: string;
  reduceEmpoweredOnHit: string;
  selfStatusPctValues: string;
  selfStatusAmountValues: string;
  selfStatusRequiresChampionHit: boolean;
  trapApplyOnPlace: boolean;
  trapEruptName: string;
  trapEruptDuration: string;
  costHpMaxPct: string;
  costHpMinCurrentPct: string;
  poolRequiresChampionHit: boolean;
  poolAllAllies: boolean;
  poolLowHpPct: string;
  poolLowHpMult: string;
  poolRequiresSelfInArea: boolean;
  isolated: boolean;
  isolatedMultiplier: string;
  isolatedSlowPct: string;
  evolutions: boolean;
  evolutionsSlots: string;
  evolve: boolean;
  evolveName: string;
  evolveEffectName: string;
  evolveEffectValues: string;
  evolveEffectDuration: string;
  evolveEffectTarget: 'self' | 'enemy';
  evolveRecastTimes: string;
  evolveRecastTurns: string;
  evolveIsolatedMultiplier: string;
  evolveIsolatedSlowPct: string;
  evolveRecastOnTakedownTimes: string;
  evolveRecastOnTakedownTurns: string;
  recastOnTakedown: boolean;
  recastOnTakedownTimes: string;
  recastOnTakedownTurns: string;
  recastOnTakedownMax: string;
  recastOnTakedownChampion: boolean;
  returnStrike: boolean;
  returnStrikeType: 'true' | 'magic' | 'physical';
  takedownHeal: boolean;
  takedownHealFlat: string;
  takedownHealFlatByLevel: boolean;
  takedownHealAp: string;
  takedownHealChampion: boolean;
  armedAa: boolean;
  armedAaType: string;
  armedAaAd: string;
  armedAaAp: string;
  armedAaAdSource: 'total' | 'bonus';
  armedAaEffectName: string;
  armedAaEffectDuration: string;
  armedAaEffectValues: string;
  armedAaEndsSelfStatus: boolean;
  armArmedAa: boolean;
  selfStatusBlocksRecast: boolean;
  resistShred: boolean;
  resistShredPct: string;
  resistShredTurns: string;
  aaOnHit: boolean;
  aaOnHitHp: string;
  aaOnHitApPer100: string;
  costStacks: boolean;
  costStacksAmount: string;
  costStacksTurns: string;
  costStacksMax: string;
  deathBurst: boolean;
  deathBurstTurns: string;
  deathBurstName: string;
  deathBurstPct: string;
  damageLowHp: boolean;
  damageLowHpPct: string;
  damageLowHpMult: string;
  damageMissingMaxBonus: string;
  stacksOnChampionTakedown: boolean;
  permanentOnTakedown: boolean;
  permanentTakedownChampion: string;
  permanentTakedownOther: string;
  permanentStat: string;
  permanentPerStack: string;
  permanentByLevel: boolean;
  grantPermanentPerConsumed: boolean;
  sectorShotsTrigger: 'aa' | 'cast' | 'both';
  sectorShotsGap: string;
  sectorShotsLabels: string;
  onAbilityUse: boolean;
  onAbilityUseTurns: string;
  onAbilityUseAttackSpeed: string;
  resetSectorShots: boolean;
  resetSectorShotsFrom: string;
  resetSectorShotsCount: string;
  resetSectorShotsChampionHit: boolean;
  strikes: boolean;
  strikesCount: string;
  strikesPerBonusAtkSpe: string;
  selfStatusCancelable: boolean;
  selfStatusBlocksAbility: boolean;
  selfStatusDamageReduction: string;
  selfStatusDurationFrom: string;
  selfStatusDurationThresholds: string;
  selfStatusExtraStats: string;
  aaOnHitAd: string;
  aaOnHitAdSource: 'total' | 'bonus';
  aaOnHitAlways: boolean;
  aaOnHitStackTurns: string;
  aaOnHitStackMax: string;
  poolRequiresSelfStatus: boolean;
  stacksOnMaxHealSelfStat: string;
  stacksOnMaxHealAllyStat: string;
  stacksOnMaxStatus: boolean;
  stacksOnMaxStatusName: string;
  stacksOnMaxStatusStat: string;
  stacksOnMaxStatusAmount: string;
  stacksOnMaxStatusPct: string;
  aaOnHitAp: string;
  aaOnHitApSource: 'total' | 'bonus';
  aaOnHitType: string;
  aaOnHitHpSource: 'max' | 'current' | 'missing' | 'bonus' | '';
  armedAaApSource: 'total' | 'bonus';
  armedAaHp: string;
  armedAaHpSource: 'max' | 'current' | 'missing' | 'bonus' | '';
  armedAaApPer100: string;
  armedAaExplodeFromLevel: string;
  armedAaTurns: string;
  levelThresholds: boolean;
  levelThresholdRows: LevelThresholdDraft[];
  protect: boolean;
  protectName: string;
  protectTurns: string;
  protectPct: string;
  protectTarget: 'self' | 'ally' | 'allyOrSelf';
  /** Instantánea al cargar; no se edita en el formulario. Conserva claves desconocidas al guardar. */
  sourceMechanics?: AbilityMechanics;
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
    stacksOnAa: mechanics?.stacks ? mechanics.stacks.onAa !== false : true,
    stacksOnAbilityHit: mechanics?.stacks?.onAbilityHit === true,
    stacksStat: mechanics?.stacks?.stat ?? '',
    stacksPerStack: list(mechanics?.stacks?.perStack),
    stacksPerTarget: mechanics?.stacks?.perTarget === true,
    stacksRequiresDamage: mechanics?.stacks ? mechanics.stacks.requiresDamage !== false : true,
    stacksOnChampionCc: mechanics?.stacks?.onChampionCc === true,
    stacksOnNonChampionKill: mechanics?.stacks?.onNonChampionKill === true,
    stacksConsumeAtMax: mechanics?.stacks?.consumeAtMax === true,
    stacksOnMaxCooldown: mechanics?.stacks?.onMaxCooldown != null ? String(mechanics.stacks.onMaxCooldown) : '',
    stacksOnMaxHealSelf: list(mechanics?.stacks?.onMaxHeal?.selfRatios?.[0]?.values),
    stacksOnMaxHealSelfStat: mechanics?.stacks?.onMaxHeal?.selfRatios?.[0]?.stat ?? 'hp',
    stacksOnMaxHealAlly: list(mechanics?.stacks?.onMaxHeal?.allyRatios?.[0]?.values),
    stacksOnMaxHealAllyStat: mechanics?.stacks?.onMaxHeal?.allyRatios?.[0]?.stat ?? 'hp',
    stacksOnMaxHealAlliesToo: mechanics?.stacks?.onMaxHeal?.alliesToo === true,
    stacksOnMaxHealFlat: list(mechanics?.stacks?.onMaxHeal?.flat),
    stacksOnMaxHealFlatByLevel: mechanics?.stacks?.onMaxHeal?.flatByLevel === true,
    stacksArmArmedAaAtMax: mechanics?.stacks?.armArmedAaAtMax === true,
    stacksArmArmedAaTurns: mechanics?.stacks?.armArmedAaTurns != null ? String(mechanics.stacks.armArmedAaTurns) : '',
    stacksOnMaxStatus: !!mechanics?.stacks?.onMaxStatus,
    stacksOnMaxStatusName: mechanics?.stacks?.onMaxStatus?.name ?? '',
    stacksOnMaxStatusStat: mechanics?.stacks?.onMaxStatus?.stat ?? '',
    stacksOnMaxStatusAmount: mechanics?.stacks?.onMaxStatus?.amount != null ? String(mechanics.stacks.onMaxStatus.amount) : '',
    stacksOnMaxStatusPct: mechanics?.stacks?.onMaxStatus?.pct != null ? String(mechanics.stacks.onMaxStatus.pct) : '',
    cleanse: mechanics?.cleanse === true,
    mark: !!mechanics?.mark,
    markTurns: mechanics?.mark ? String(mechanics.mark.turns) : '2',
    markDetonate: mechanics?.mark?.detonateOn ?? 'both',
    markDamageOnDetonate: mechanics?.mark ? mechanics.mark.damageOnDetonate !== false : true,
    markRefundFlat: list(mechanics?.mark?.refundMana?.flat),
    markRefundCost: mechanics?.mark?.refundMana?.refundCost === true,
    requireStacks: !!mechanics?.requireStacks,
    requireStacksFrom: mechanics?.requireStacks?.from ?? '',
    requireStacksCount: mechanics?.requireStacks ? String(mechanics.requireStacks.count) : '',
    requireStacksConsume: mechanics?.requireStacks ? mechanics.requireStacks.consume !== false : true,
    lifeSteal: !!mechanics?.lifeSteal,
    lifeStealEfficacy: mechanics?.lifeSteal ? String(mechanics.lifeSteal.efficacy) : '100',
    permanentStacks: !!mechanics?.permanentStacks,
    permanentOnChampionHit: mechanics?.permanentStacks ? mechanics.permanentStacks.onAbilityChampionHit !== false : true,
    grantPermanent: !!mechanics?.grantPermanent,
    grantPermanentFrom: mechanics?.grantPermanent?.from ?? '',
    grantPermanentMax: mechanics?.grantPermanent?.maxPerCast ? String(mechanics.grantPermanent.maxPerCast) : '',
    grantPermanentOnKill: mechanics?.grantPermanent?.onKill === true,
    stackDamage: !!mechanics?.stackDamage,
    stackDamageFrom: mechanics?.stackDamage?.from ?? '',
    stackDamagePct: list(mechanics?.stackDamage?.pct),
    stackDamageType: mechanics?.stackDamage?.type ?? 'magic',
    stackDamageByLevel: mechanics?.stackDamage?.byLevel === true,
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
    poolStat2: mechanics?.castPool?.ratios[1]?.stat ?? 'ap',
    poolValues2: list(mechanics?.castPool?.ratios[1]?.values),
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
    selfStatusStat: mechanics?.selfStatus?.stat ?? '',
    selfStatusAmount: mechanics?.selfStatus?.amount != null ? String(mechanics.selfStatus.amount) : '',
    selfStatusPct: mechanics?.selfStatus?.pct != null ? String(mechanics.selfStatus.pct) : '',
    selfStatusPctValues: list(mechanics?.selfStatus?.pctValues),
    selfStatusAmountValues: list(mechanics?.selfStatus?.amountValues),
    selfStatusRequiresChampionHit: mechanics?.selfStatus?.requiresChampionHit === true,
    selfStatusFixedAttacks: mechanics?.selfStatus?.fixedAttacks ? String(mechanics.selfStatus.fixedAttacks) : '',
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
    sectorShots: !!mechanics?.sectorShots,
    sectorShotsCount: mechanics?.sectorShots ? String(mechanics.sectorShots.count) : '6',
    sectorShotsCooldown: list(mechanics?.sectorShots?.cooldown),
    sectorShotsByLevel: mechanics?.sectorShots?.byLevel === true,
    toggle: !!mechanics?.toggle,
    toggleTurns: list(mechanics?.toggle?.turns),
    toggleFixedAttacks: mechanics?.toggle?.fixedAttacks ? String(mechanics.toggle.fixedAttacks) : '',
    execute: !!mechanics?.execute,
    executeHpPct: mechanics?.execute ? String(mechanics.execute.hpPct) : '',
    executeFear: !!mechanics?.execute?.fear,
    executeFearName: mechanics?.execute?.fear?.name ?? '',
    executeFearTurns: mechanics?.execute?.fear ? String(mechanics.execute.fear.turns) : '',
    executeFearValue: mechanics?.execute?.fear?.value ? String(mechanics.execute.fear.value) : '',
    empoweredAa: !!mechanics?.empoweredAa,
    empoweredHeal: list(mechanics?.empoweredAa?.healHpPct),
    empoweredCd: list(mechanics?.empoweredAa?.cooldown),
    empoweredByLevel: mechanics?.empoweredAa?.byLevel === true,
    empoweredReduceAbility: mechanics?.empoweredAa?.reduceOnAbility ? String(mechanics.empoweredAa.reduceOnAbility) : '',
    empoweredReduceStruck: mechanics?.empoweredAa?.reduceOnStruck ? String(mechanics.empoweredAa.reduceOnStruck) : '',
    empoweredSkipHp: mechanics?.empoweredAa?.skipAboveHpPct ? String(mechanics.empoweredAa.skipAboveHpPct) : '',
    trap: !!mechanics?.trap,
    trapTurns: mechanics?.trap ? String(mechanics.trap.turns) : '15',
    trapName: mechanics?.trap?.name ?? '',
    trapApplyOnPlace: mechanics?.trap?.applyOnPlace === true,
    trapEruptName: mechanics?.trap?.eruptEffectName ?? mechanics?.trap?.eruptEffect?.[0]?.name ?? '',
    trapEruptDuration: mechanics?.trap?.eruptEffectDuration ? String(mechanics.trap.eruptEffectDuration) : (mechanics?.trap?.eruptEffect?.[0]?.duration?.[0] != null ? String(mechanics.trap.eruptEffect[0].duration![0]) : ''),
    costHpMaxPct: mechanics?.costHpMaxPct ? String(mechanics.costHpMaxPct) : '',
    costHpMinCurrentPct: mechanics?.costHpMinCurrentPct ? String(mechanics.costHpMinCurrentPct) : '',
    poolRequiresChampionHit: mechanics?.castPool?.requiresChampionHit === true,
    poolAllAllies: mechanics?.castPool?.allAllies === true,
    poolLowHpPct: mechanics?.castPool?.lowHpBonus ? String(mechanics.castPool.lowHpBonus.belowHpPct) : '',
    poolLowHpMult: mechanics?.castPool?.lowHpBonus ? String(mechanics.castPool.lowHpBonus.multiplier) : '',
    reduceEmpoweredOnHit: mechanics?.reduceEmpoweredAaOnHit ? String(mechanics.reduceEmpoweredAaOnHit) : '',
    poolRequiresSelfInArea: mechanics?.castPool?.requiresSelfInArea === true,
    isolated: !!mechanics?.isolated,
    isolatedMultiplier: mechanics?.isolated?.multiplier != null ? String(mechanics.isolated.multiplier) : '',
    isolatedSlowPct: mechanics?.isolated?.slowPct != null ? String(mechanics.isolated.slowPct) : '',
    evolutions: !!mechanics?.evolutions,
    evolutionsSlots: list(mechanics?.evolutions?.slots),
    evolve: !!mechanics?.evolve,
    evolveName: mechanics?.evolve?.name ?? '',
    evolveEffectName: mechanics?.evolve?.effectName ?? mechanics?.evolve?.effect?.[0]?.name ?? '',
    evolveEffectValues: list(mechanics?.evolve?.effect?.[0]?.values),
    evolveEffectDuration: mechanics?.evolve?.effectDuration != null ? String(mechanics.evolve.effectDuration) : list(mechanics?.evolve?.effect?.[0]?.duration),
    evolveEffectTarget: mechanics?.evolve?.effectTarget === 'self' ? 'self' : 'enemy',
    evolveRecastTimes: mechanics?.evolve?.recast ? String(mechanics.evolve.recast.times) : '',
    evolveRecastTurns: mechanics?.evolve?.recast ? String(mechanics.evolve.recast.turns) : '',
    evolveIsolatedMultiplier: mechanics?.evolve?.isolated?.multiplier != null ? String(mechanics.evolve.isolated.multiplier) : '',
    evolveIsolatedSlowPct: mechanics?.evolve?.isolated?.slowPct != null ? String(mechanics.evolve.isolated.slowPct) : '',
    evolveRecastOnTakedownTimes: mechanics?.evolve?.recastOnTakedown ? String(mechanics.evolve.recastOnTakedown.times) : '',
    evolveRecastOnTakedownTurns: mechanics?.evolve?.recastOnTakedown ? String(mechanics.evolve.recastOnTakedown.turns) : '',
    recastOnTakedown: !!mechanics?.recastOnTakedown,
    recastOnTakedownTimes: mechanics?.recastOnTakedown ? String(mechanics.recastOnTakedown.times) : '1',
    recastOnTakedownTurns: mechanics?.recastOnTakedown ? String(mechanics.recastOnTakedown.turns) : '0',
    recastOnTakedownMax: mechanics?.recastOnTakedown?.max != null ? String(mechanics.recastOnTakedown.max) : '',
    recastOnTakedownChampion: mechanics?.recastOnTakedown?.champion === true,
    returnStrike: !!mechanics?.returnStrike,
    returnStrikeType: mechanics?.returnStrike?.type ?? 'true',
    takedownHeal: !!mechanics?.takedownHeal,
    takedownHealFlat: list(mechanics?.takedownHeal?.flat),
    takedownHealFlatByLevel: mechanics?.takedownHeal?.flatByLevel === true,
    takedownHealAp: list(mechanics?.takedownHeal?.ratios?.find(ratio => ratio.stat === 'ap')?.values),
    takedownHealChampion: mechanics?.takedownHeal?.champion === true,
    armedAa: !!mechanics?.armedAa,
    armedAaType: mechanics?.armedAa?.type ?? 'magic',
    armedAaAd: list(mechanics?.armedAa?.ad),
    armedAaAp: list(mechanics?.armedAa?.ap),
    armedAaAdSource: mechanics?.armedAa?.adSource === 'total' ? 'total' : (mechanics?.armedAa?.adSource === 'bonus' ? 'bonus' : 'bonus'),
    armedAaApSource: mechanics?.armedAa?.apSource === 'bonus' ? 'bonus' : 'total',
    armedAaHp: list(mechanics?.armedAa?.hp),
    armedAaHpSource: mechanics?.armedAa?.hpSource ?? '',
    armedAaApPer100: mechanics?.armedAa?.apPer100 != null ? String(mechanics.armedAa.apPer100) : '',
    armedAaExplodeFromLevel: mechanics?.armedAa?.explodeFromLevel != null ? String(mechanics.armedAa.explodeFromLevel) : '',
    armedAaTurns: mechanics?.armedAa?.turns != null ? String(mechanics.armedAa.turns) : '',
    armedAaEffectName: mechanics?.armedAa?.effectName ?? mechanics?.armedAa?.effect?.[0]?.name ?? '',
    armedAaEffectDuration: mechanics?.armedAa?.effectDuration != null ? String(mechanics.armedAa.effectDuration) : '',
    armedAaEffectValues: list(mechanics?.armedAa?.effect?.[0]?.values),
    armedAaEndsSelfStatus: mechanics?.armedAa?.endsSelfStatus === true,
    armArmedAa: mechanics?.armArmedAa === true,
    selfStatusBlocksRecast: mechanics?.selfStatus?.blocksRecast === true,
    resistShred: !!mechanics?.resistShred,
    resistShredPct: list(mechanics?.resistShred?.pct),
    resistShredTurns: mechanics?.resistShred ? String(mechanics.resistShred.turns) : '2',
    aaOnHit: !!mechanics?.aaOnHit,
    aaOnHitHp: list(mechanics?.aaOnHit?.hp),
    aaOnHitHpSource: mechanics?.aaOnHit?.hpSource ?? '',
    aaOnHitType: mechanics?.aaOnHit?.type ?? '',
    aaOnHitAp: list(mechanics?.aaOnHit?.ap),
    aaOnHitApSource: mechanics?.aaOnHit?.apSource === 'bonus' ? 'bonus' : 'total',
    aaOnHitApPer100: mechanics?.aaOnHit?.apPer100 != null ? String(mechanics.aaOnHit.apPer100) : '',
    costStacks: !!mechanics?.costStacks,
    costStacksAmount: mechanics?.costStacks ? String(mechanics.costStacks.amount) : '',
    costStacksTurns: mechanics?.costStacks ? String(mechanics.costStacks.turns) : '4',
    costStacksMax: mechanics?.costStacks ? String(mechanics.costStacks.max) : '9',
    deathBurst: !!mechanics?.deathBurst,
    deathBurstTurns: mechanics?.deathBurst ? String(mechanics.deathBurst.turns) : '2',
    deathBurstName: mechanics?.deathBurst?.name ?? '',
    deathBurstPct: mechanics?.deathBurst?.pct != null ? String(mechanics.deathBurst.pct) : '',
    damageLowHp: !!mechanics?.damageLowHp,
    damageLowHpPct: mechanics?.damageLowHp ? String(mechanics.damageLowHp.belowHpPct) : '40',
    damageLowHpMult: mechanics?.damageLowHp ? String(mechanics.damageLowHp.multiplier) : '2',
    damageMissingMaxBonus: mechanics?.damageLowHp?.missingMaxBonusPct != null ? String(mechanics.damageLowHp.missingMaxBonusPct) : '',
    stacksOnChampionTakedown: mechanics?.stacks?.onChampionTakedown === true,
    permanentOnTakedown: mechanics?.permanentStacks?.onTakedown === true,
    permanentTakedownChampion: mechanics?.permanentStacks?.takedownChampion != null ? String(mechanics.permanentStacks.takedownChampion) : '',
    permanentTakedownOther: mechanics?.permanentStacks?.takedownOther != null ? String(mechanics.permanentStacks.takedownOther) : '',
    permanentStat: mechanics?.permanentStacks?.stat ?? '',
    permanentPerStack: list(mechanics?.permanentStacks?.perStack),
    permanentByLevel: mechanics?.permanentStacks?.byLevel === true,
    grantPermanentPerConsumed: mechanics?.grantPermanent?.perConsumedStack === true,
    sectorShotsTrigger: mechanics?.sectorShots?.trigger === 'cast' || mechanics?.sectorShots?.trigger === 'both' ? mechanics.sectorShots.trigger : 'aa',
    sectorShotsGap: list(mechanics?.sectorShots?.gap),
    sectorShotsLabels: (mechanics?.sectorShots?.labels ?? []).join(', '),
    onAbilityUse: !!mechanics?.onAbilityUse,
    onAbilityUseTurns: mechanics?.onAbilityUse ? String(mechanics.onAbilityUse.turns) : '2',
    onAbilityUseAttackSpeed: list(mechanics?.onAbilityUse?.attackSpeed),
    resetSectorShots: !!mechanics?.resetSectorShots,
    resetSectorShotsFrom: mechanics?.resetSectorShots?.from ?? '',
    resetSectorShotsCount: mechanics?.resetSectorShots ? String(mechanics.resetSectorShots.count) : '1',
    resetSectorShotsChampionHit: mechanics?.resetSectorShots?.requiresChampionHit === true,
    strikes: !!mechanics?.strikes,
    strikesCount: list(mechanics?.strikes?.count),
    strikesPerBonusAtkSpe: mechanics?.strikes?.perBonusAtkSpe != null ? String(mechanics.strikes.perBonusAtkSpe) : '',
    selfStatusCancelable: mechanics?.selfStatus?.cancelable === true,
    selfStatusBlocksAbility: mechanics?.selfStatus?.blocksAbility !== false,
    selfStatusDamageReduction: list(mechanics?.selfStatus?.damageReductionValues),
    selfStatusDurationFrom: mechanics?.selfStatus?.durationByStacks?.from ?? '',
    selfStatusDurationThresholds: (mechanics?.selfStatus?.durationByStacks?.thresholds ?? []).map(entry => `${entry.stacks}:${entry.turns}`).join(', '),
    selfStatusExtraStats: mechanics?.selfStatus?.stats?.length ? JSON.stringify(mechanics.selfStatus.stats) : '',
    aaOnHitAd: list(mechanics?.aaOnHit?.ad),
    aaOnHitAdSource: mechanics?.aaOnHit?.adSource === 'bonus' ? 'bonus' : 'total',
    aaOnHitAlways: mechanics?.aaOnHit?.always === true,
    aaOnHitStackTurns: mechanics?.aaOnHit?.perTargetStacks ? String(mechanics.aaOnHit.perTargetStacks.turns) : '',
    aaOnHitStackMax: mechanics?.aaOnHit?.perTargetStacks?.max != null ? String(mechanics.aaOnHit.perTargetStacks.max) : '',
    poolRequiresSelfStatus: mechanics?.castPool?.requiresSelfStatus === true,
    levelThresholds: !!mechanics?.levelThresholds?.length,
    levelThresholdRows: thresholdsToDraft(mechanics?.levelThresholds, list),
    protect: !!mechanics?.protect,
    protectName: mechanics?.protect?.name ?? '',
    protectTurns: mechanics?.protect ? String(mechanics.protect.turns) : '1',
    protectPct: list(mechanics?.protect?.damageReductionPct),
    protectTarget: mechanics?.protect?.target ?? 'self',
    sourceMechanics: mechanics,
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

function thresholdsToDraft(list: AbilityLevelThreshold[] | undefined, format: (values: number[] | undefined) => string): LevelThresholdDraft[] {
  const rows = (list ?? []).map(entry => ({
    level: String(entry.level),
    name: entry.name ?? '',
    rangeBonus: entry.rangeBonus != null ? String(entry.rangeBonus) : '',
    permanentMaxStacks: entry.permanentMaxStacks === true,
    waveType: entry.aaWave?.type === 'magic' || entry.aaWave?.type === 'true' || entry.aaWave?.type === 'physical' ? entry.aaWave.type : '' as const,
    waveAd: format(entry.aaWave?.ad),
    waveAdSource: entry.aaWave?.adSource === 'bonus' ? 'bonus' as const : 'total' as const,
    waveAp: format(entry.aaWave?.ap),
    waveApSource: entry.aaWave?.apSource === 'bonus' ? 'bonus' as const : 'total' as const,
    waveRequiresMaxStacks: entry.aaWave?.requiresMaxStacks === true,
  }));
  const padded = rows.length >= 4 ? rows : [...rows, ...Array.from({ length: 4 - rows.length }, blankLevelThreshold)];
  return padded;
}

function parseRatioList(text: string): number[] | undefined {
  const values = text.split(/[,\s]+/).filter(Boolean).map(item => Number(String(item).replace(',', '.')));
  if (!values.length || values.some(value => !Number.isFinite(value))) return undefined;
  return values;
}

function assignScalingSource<T extends { adSource?: 'total' | 'bonus'; apSource?: 'total' | 'bonus' }>(
  target: T,
  kind: 'ad' | 'ap',
  hasRatio: boolean,
  source: 'total' | 'bonus',
): void {
  if (!hasRatio) return;
  if (kind === 'ad') target.adSource = source;
  else target.apSource = source;
}

const KNOWN_MECHANICS_KEYS = [
  'charges', 'stacks', 'requireStacks', 'permanentStacks', 'grantPermanent', 'stackDamage',
  'sectorShots', 'toggle', 'execute', 'lifeSteal', 'buff', 'appliesPassive', 'aaCritBonus',
  'critNoDamage', 'critDoublesPassive', 'effectRules', 'learnedStats', 'castPool', 'allEnemies',
  'spellShield', 'recast', 'selfStatus', 'noAction', 'innateShield', 'empoweredAa', 'trap',
  'reduceEmpoweredAaOnHit', 'costHpMaxPct', 'costHpMinCurrentPct', 'isolated', 'evolutions',
  'evolve', 'recastOnTakedown', 'armedAa', 'armArmedAa', 'resistShred', 'aaOnHit', 'costStacks',
  'deathBurst', 'damageLowHp', 'onAbilityUse', 'resetSectorShots', 'strikes', 'mark', 'cleanse',
  'returnStrike', 'takedownHeal', 'levelThresholds', 'protect',
] as const;

function preserveUnknownKeys<T extends object>(next: T, prev: object | undefined, known: readonly string[]): T {
  if (!prev) return next;
  const knownSet = new Set(known);
  const out = next as Record<string, unknown>;
  for (const [key, value] of Object.entries(prev)) {
    if (knownSet.has(key) || value === undefined) continue;
    if (!(key in out)) out[key] = value;
  }
  return next;
}

function preserveExtraRatios<T extends { stat: string; values: number[] }>(
  next: T[] | undefined,
  prev: T[] | undefined,
): T[] | undefined {
  const keep = next?.length ?? 0;
  if (!prev || prev.length <= keep) return next;
  const extra = prev.slice(keep);
  return next?.length ? [...next, ...extra] : extra;
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
    const max = mechInt(draft.stacksMax, 'Cargas: máximo', 1, 99);
    out.stacks = { turns: mechInt(draft.stacksTurns, 'Cargas: duración', 1, 99), max };
    if (draft.stacksOnAa === false) out.stacks.onAa = false;
    if (draft.stacksOnAbilityHit) out.stacks.onAbilityHit = true;
    if (draft.stacksOnChampionTakedown) out.stacks.onChampionTakedown = true;
    if (draft.stacksRequired.trim()) out.stacks.required = mechInt(draft.stacksRequired, 'Cargas: para activar esta habilidad', 1, max);
    if (draft.stacksStat.trim()) out.stacks.stat = draft.stacksStat.trim().slice(0, 40);
    if (draft.stacksPerStack.trim()) out.stacks.perStack = mechList(draft.stacksPerStack, 'Cargas: valor de stat por carga', false);
    if (draft.stacksPerTarget) out.stacks.perTarget = true;
    if (draft.stacksRequiresDamage === false) out.stacks.requiresDamage = false;
    if (draft.stacksOnChampionCc) out.stacks.onChampionCc = true;
    if (draft.stacksOnNonChampionKill) out.stacks.onNonChampionKill = true;
    if (draft.stacksConsumeAtMax) out.stacks.consumeAtMax = true;
    if (draft.stacksOnMaxCooldown.trim()) out.stacks.onMaxCooldown = mechInt(draft.stacksOnMaxCooldown, 'Cargas: intervalo tras la cura al máximo', 1, 99);
    if (draft.stacksArmArmedAaAtMax) out.stacks.armArmedAaAtMax = true;
    if (draft.stacksArmArmedAaTurns.trim()) out.stacks.armArmedAaTurns = mechInt(draft.stacksArmArmedAaTurns, 'Cargas: duración del AA armado al máximo', 1, 99);
    if (draft.stacksOnMaxHealSelf.trim() || draft.stacksOnMaxHealAlly.trim() || draft.stacksOnMaxHealFlat.trim() || draft.stacksOnMaxHealAlliesToo || draft.stacksOnMaxHealFlatByLevel) {
      const heal: NonNullable<NonNullable<AbilityMechanics['stacks']>['onMaxHeal']> = {};
      const selfHeal = draft.stacksOnMaxHealSelf.trim() ? mechList(draft.stacksOnMaxHealSelf, 'Cargas: cura propia al máximo', false) : undefined;
      const allyHeal = draft.stacksOnMaxHealAlly.trim() ? mechList(draft.stacksOnMaxHealAlly, 'Cargas: cura a aliados al máximo', false) : undefined;
      if (selfHeal) heal.selfRatios = [{ stat: (draft.stacksOnMaxHealSelfStat.trim() || 'hp').slice(0, 40), values: selfHeal }];
      if (allyHeal) heal.allyRatios = [{ stat: (draft.stacksOnMaxHealAllyStat.trim() || 'hp').slice(0, 40), values: allyHeal }];
      if (draft.stacksOnMaxHealAlliesToo) heal.alliesToo = true;
      if (draft.stacksOnMaxHealFlat.trim()) {
        const maxFlat = mechList(draft.stacksOnMaxHealFlat, 'Cargas: cura plana al máximo', false);
        if (maxFlat) heal.flat = maxFlat;
      }
      if (draft.stacksOnMaxHealFlatByLevel) heal.flatByLevel = true;
      out.stacks.onMaxHeal = heal;
    }
    if (draft.stacksOnMaxStatus) {
      const status: NonNullable<NonNullable<AbilityMechanics['stacks']>['onMaxStatus']> = {};
      if (draft.stacksOnMaxStatusName.trim()) status.name = draft.stacksOnMaxStatusName.trim().slice(0, 80);
      if (draft.stacksOnMaxStatusStat.trim()) status.stat = draft.stacksOnMaxStatusStat.trim().slice(0, 40);
      if (draft.stacksOnMaxStatusAmount.trim()) {
        const amount = Number(String(draft.stacksOnMaxStatusAmount).replace(',', '.'));
        if (!Number.isFinite(amount)) throw new Error('Cargas al máximo: la cantidad tiene que ser un número');
        status.amount = amount;
      }
      if (draft.stacksOnMaxStatusPct.trim()) {
        const pct = Number(String(draft.stacksOnMaxStatusPct).replace(',', '.'));
        if (!Number.isFinite(pct)) throw new Error('Cargas al máximo: el % tiene que ser un número');
        status.pct = pct;
      }
      out.stacks.onMaxStatus = status;
    }
  }
  if (draft.mark) {
    const mark: NonNullable<import('../../data/abilityMechanics').AbilityMechanics['mark']> = {
      turns: mechInt(draft.markTurns || '2', 'Marca: duración', 1, 99),
      detonateOn: draft.markDetonate,
      damageOnDetonate: draft.markDamageOnDetonate !== false,
    };
    if (draft.markRefundFlat.trim() || draft.markRefundCost) {
      mark.refundMana = {};
      if (draft.markRefundFlat.trim()) mark.refundMana.flat = mechList(draft.markRefundFlat, 'Marca: maná plano al detonar', false);
      if (draft.markRefundCost) mark.refundMana.refundCost = true;
    }
    out.mark = mark;
  }
  if (draft.cleanse) out.cleanse = true;
  if (draft.requireStacks) {
    const from = draft.requireStacksFrom.trim();
    if (!from) throw new Error('Requiere cargas: pon el nombre de la habilidad que tiene el contador');
    if (from.length > 80) throw new Error('Requiere cargas: el nombre no puede superar 80 caracteres');
    out.requireStacks = { from, count: mechInt(draft.requireStacksCount, 'Requiere cargas: cantidad', 1, 999) };
    if (draft.requireStacksConsume === false) out.requireStacks.consume = false;
  }
  if (draft.lifeSteal) {
    const text = draft.lifeStealEfficacy.trim() || '100';
    const efficacy = Number(text.replace(',', '.'));
    if (!Number.isFinite(efficacy) || efficacy < 0 || efficacy > 200) throw new Error('Aplica robo de vida: eficacia entre 0 y 200 %');
    out.lifeSteal = { efficacy };
  }
  if (draft.permanentStacks) {
    out.permanentStacks = {};
    if (draft.permanentOnChampionHit === false) out.permanentStacks.onAbilityChampionHit = false;
    if (draft.permanentOnTakedown) out.permanentStacks.onTakedown = true;
    if (draft.permanentTakedownChampion.trim()) out.permanentStacks.takedownChampion = mechInt(draft.permanentTakedownChampion, 'Cargas permanentes: derribo de campeón', 1, 9);
    if (draft.permanentTakedownOther.trim()) out.permanentStacks.takedownOther = mechInt(draft.permanentTakedownOther, 'Cargas permanentes: derribo no campeón', 0, 9);
    if (draft.permanentStat.trim()) out.permanentStacks.stat = draft.permanentStat.trim();
    if (draft.permanentPerStack.trim()) out.permanentStacks.perStack = mechList(draft.permanentPerStack, 'Cargas permanentes: valor por acumulación', false);
    if (draft.permanentByLevel) out.permanentStacks.byLevel = true;
  }
  if (draft.grantPermanent) {
    const from = draft.grantPermanentFrom.trim();
    if (!from) throw new Error('Concede cargas permanentes: pon el nombre de la habilidad que tiene el contador');
    if (from.length > 80) throw new Error('Concede cargas permanentes: el nombre no puede superar 80 caracteres');
    out.grantPermanent = { from };
    if (draft.grantPermanentMax.trim()) out.grantPermanent.maxPerCast = mechInt(draft.grantPermanentMax, 'Concede cargas permanentes: máximo por lanzamiento', 1, 99);
    if (draft.grantPermanentOnKill) out.grantPermanent.onKill = true;
    if (draft.grantPermanentPerConsumed) out.grantPermanent.perConsumedStack = true;
  }
  if (draft.stackDamage) {
    const from = draft.stackDamageFrom.trim();
    if (!from) throw new Error('Daño por cargas: pon el nombre de la habilidad que tiene el contador');
    if (from.length > 80) throw new Error('Daño por cargas: el nombre no puede superar 80 caracteres');
    const pct = mechList(draft.stackDamagePct, 'Daño por cargas: % por rango', false);
    if (!pct) throw new Error('Daño por cargas: pon el % por rango (25 = 25 % de las cargas)');
    if (pct.some(value => value < 0 || value > 999)) throw new Error('Daño por cargas: % entre 0 y 999');
    out.stackDamage = { from, pct };
    if (draft.stackDamageType && draft.stackDamageType !== 'magic') out.stackDamage.type = draft.stackDamageType;
    if (draft.stackDamageByLevel) out.stackDamage.byLevel = true;
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
    const values2 = mechList(draft.poolValues2, 'Escudo / cura al usarla: segundo ratio % por rango', false);
    if (values2) pool.ratios.push({ stat: draft.poolStat2, values: values2 });
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
    if (draft.poolRequiresChampionHit) pool.requiresChampionHit = true;
    if (draft.poolRequiresSelfInArea) pool.requiresSelfInArea = true;
    if (draft.poolRequiresSelfStatus) pool.requiresSelfStatus = true;
    if (draft.poolAlliesToo) pool.alliesToo = true;
    if (draft.poolAllAllies) pool.allAllies = true;
    if (draft.poolLowHpPct.trim() && draft.poolLowHpMult.trim()) {
      pool.lowHpBonus = {
        belowHpPct: mechInt(draft.poolLowHpPct, 'Escudo / cura: % de vida baja', 1, 100),
        multiplier: Number(String(draft.poolLowHpMult).replace(',', '.')),
      };
      if (!Number.isFinite(pool.lowHpBonus.multiplier) || pool.lowHpBonus.multiplier <= 0 || pool.lowHpBonus.multiplier > 10) {
        throw new Error('Escudo / cura: el multiplicador por vida baja tiene que ser un número entre 0 (no incluido) y 10');
      }
    }
    out.castPool = pool;
  }
  if (draft.recast) out.recast = { times: mechInt(draft.recastTimes, 'Recast: veces', 1, 9), turns: mechInt(draft.recastTurns, 'Recast: turnos', 0, 99) };
  if (draft.selfStatus) {
    const name = draft.selfStatusName.trim();
    if (!name) throw new Error('Estado propio: pon el nombre');
    out.selfStatus = { name, turns: mechInt(draft.selfStatusTurns, 'Estado propio: turnos', 1, 99) };
    if (draft.selfStatusValue.trim()) out.selfStatus.value = mechInt(draft.selfStatusValue, 'Estado propio: valor', 1, 999);
    const stat = draft.selfStatusStat.trim();
    if (stat) {
      out.selfStatus.stat = stat;
      const amountText = draft.selfStatusAmount.trim();
      const pctText = draft.selfStatusPct.trim();
      if (amountText) {
        const amount = Number(amountText.replace(',', '.'));
        if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 999) throw new Error('Estado propio: cantidad distinta de 0 (máx. 999)');
        out.selfStatus.amount = amount;
      }
      if (pctText) {
        const pct = Number(pctText.replace(',', '.'));
        if (!Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 999) throw new Error('Estado propio: % distinto de 0 (máx. 999)');
        out.selfStatus.pct = pct;
      }
      if (!out.selfStatus.amount && !out.selfStatus.pct && !draft.selfStatusPctValues.trim() && !draft.selfStatusAmountValues.trim()) throw new Error('Estado propio: pon la cantidad, el % o los valores por rango de la stat');
    }
    if (draft.selfStatusFixedAttacks.trim()) out.selfStatus.fixedAttacks = mechInt(draft.selfStatusFixedAttacks, 'Estado propio: número de ataques fijo', 1, 99);
    const pctValues = draft.selfStatusPctValues.trim() ? mechList(draft.selfStatusPctValues, 'Estado propio: % por rango', false) : undefined;
    if (pctValues) out.selfStatus.pctValues = pctValues;
    const amountValues = draft.selfStatusAmountValues.trim() ? mechList(draft.selfStatusAmountValues, 'Estado propio: cantidad por rango', false) : undefined;
    if (amountValues) out.selfStatus.amountValues = amountValues;
    if (draft.selfStatusRequiresChampionHit) out.selfStatus.requiresChampionHit = true;
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
  if (draft.sectorShots) {
    const cooldown = mechList(draft.sectorShotsCooldown, 'Disparos por sector: CD (turnos)', true);
    if (!cooldown) throw new Error('Disparos por sector: pon los turnos de CD (por rango o tramo)');
    out.sectorShots = { count: mechInt(draft.sectorShotsCount, 'Disparos por sector: número', 2, 8), cooldown };
    if (draft.sectorShotsByLevel) out.sectorShots.byLevel = true;
    if (draft.sectorShotsTrigger === 'cast' || draft.sectorShotsTrigger === 'both') out.sectorShots.trigger = draft.sectorShotsTrigger;
    if (draft.sectorShotsGap.trim()) out.sectorShots.gap = mechList(draft.sectorShotsGap, 'Disparos por sector: t. entre usos', true);
    const labels = draft.sectorShotsLabels.split(/[,/]/).map(item => item.trim()).filter(Boolean);
    if (labels.length) out.sectorShots.labels = labels;
  }
  if (draft.toggle) {
    const turns = parseNumberList(draft.toggleTurns, 'Interruptor: duración (turnos)');
    if (!turns) throw new Error('Interruptor: pon la duración por rango (0 = hasta desactivar)');
    if (turns.length > 5) throw new Error('Interruptor: como máximo 5 valores (uno por rango)');
    if (turns.some(value => !Number.isInteger(value) || value < 0 || value > 99)) throw new Error('Interruptor: enteros entre 0 y 99 (0 = hasta desactivar)');
    out.toggle = { turns };
    if (draft.toggleFixedAttacks.trim()) out.toggle.fixedAttacks = mechInt(draft.toggleFixedAttacks, 'Interruptor: número de ataques fijo', 1, 99);
  }
  if (draft.execute) {
    out.execute = { hpPct: mechInt(draft.executeHpPct, 'Execute: % de vida máx.', 1, 99) };
    if (draft.executeFear) {
      const name = draft.executeFearName.trim();
      if (!name) throw new Error('Execute: pon el nombre del estado (miedo)');
      if (name.length > 80) throw new Error('Execute: el nombre del estado no puede superar 80 caracteres');
      out.execute.fear = { name, turns: mechInt(draft.executeFearTurns, 'Execute: duración del miedo', 1, 99) };
      if (draft.executeFearValue.trim()) out.execute.fear.value = mechInt(draft.executeFearValue, 'Execute: valor del miedo', 1, 99);
    }
  }
  if (draft.empoweredAa) {
    const healHpPct = mechList(draft.empoweredHeal, 'AA potenciado: % de cura', false);
    const cooldown = mechList(draft.empoweredCd, 'AA potenciado: CD (turnos)', true);
    if (!healHpPct) throw new Error('AA potenciado: pon el % de cura por tramo o rango');
    if (!cooldown) throw new Error('AA potenciado: pon el CD por tramo o rango');
    out.empoweredAa = { healHpPct, cooldown };
    if (draft.empoweredByLevel) out.empoweredAa.byLevel = true;
    if (draft.empoweredReduceAbility.trim()) out.empoweredAa.reduceOnAbility = mechInt(draft.empoweredReduceAbility, 'AA potenciado: menos CD al usar una habilidad', 1, 99);
    if (draft.empoweredReduceStruck.trim()) out.empoweredAa.reduceOnStruck = mechInt(draft.empoweredReduceStruck, 'AA potenciado: menos CD al recibir una habilidad', 1, 99);
    if (draft.empoweredSkipHp.trim()) out.empoweredAa.skipAboveHpPct = mechInt(draft.empoweredSkipHp, 'AA potenciado: no por encima de este % de vida', 1, 100);
  }
  if (draft.trap) {
    out.trap = { turns: mechInt(draft.trapTurns, 'Efecto retrasado: turnos', 1, 99) };
    const trapName = draft.trapName.trim();
    if (trapName) out.trap.name = trapName;
    if (draft.trapApplyOnPlace) out.trap.applyOnPlace = true;
    const eruptName = draft.trapEruptName.trim();
    if (eruptName) {
      out.trap.eruptEffectName = eruptName;
      const eruptDuration = draft.trapEruptDuration.trim() ? mechInt(draft.trapEruptDuration, 'Efecto al detonar: duración', 1, 99) : 1;
      out.trap.eruptEffectDuration = eruptDuration;
      out.trap.eruptEffect = [{ name: eruptName, duration: [eruptDuration] }];
    } else if (draft.trapEruptDuration.trim()) {
      out.trap.eruptEffectDuration = mechInt(draft.trapEruptDuration, 'Efecto al detonar: duración', 1, 99);
    }
  }
  if (draft.costHpMaxPct.trim()) out.costHpMaxPct = mechInt(draft.costHpMaxPct, 'Coste de vida máx. (%)', 1, 100);
  if (draft.costHpMinCurrentPct.trim()) out.costHpMinCurrentPct = mechInt(draft.costHpMinCurrentPct, 'No usar por debajo de este % de vida', 1, 100);
  if (draft.selfStatus && draft.selfStatusBlocksRecast && out.selfStatus) out.selfStatus.blocksRecast = true;
  if (draft.selfStatus && out.selfStatus) {
    if (draft.selfStatusCancelable) out.selfStatus.cancelable = true;
    if (draft.selfStatusBlocksAbility === false) out.selfStatus.blocksAbility = false;
    if (draft.selfStatusDamageReduction.trim()) out.selfStatus.damageReductionValues = mechList(draft.selfStatusDamageReduction, 'Estado propio: reducción de daño %', false);
    if (draft.selfStatusDurationFrom.trim() && draft.selfStatusDurationThresholds.trim()) {
      const thresholds = draft.selfStatusDurationThresholds.split(/[;,]/).map(item => item.trim()).filter(Boolean).map(item => {
        const [stacks, turns] = item.split(':');
        return { stacks: mechInt(stacks ?? '', 'Estado propio: umbral de cargas', 0, 999), turns: mechInt(turns ?? '', 'Estado propio: duración por umbral', 0, 99) };
      });
      if (thresholds.length) out.selfStatus.durationByStacks = { from: draft.selfStatusDurationFrom.trim(), thresholds };
    }
    if (draft.selfStatusExtraStats.trim()) {
      try {
        const parsed = JSON.parse(draft.selfStatusExtraStats);
        if (!Array.isArray(parsed)) throw new Error('no es una lista');
        out.selfStatus.stats = parsed as NonNullable<AbilityMechanics['selfStatus']>['stats'];
      } catch {
        throw new Error('Estado propio: stats extra tiene que ser JSON de una lista');
      }
    }
  }
  if (draft.isolated) {
    const isolated: NonNullable<AbilityMechanics['isolated']> = {};
    if (draft.isolatedMultiplier.trim()) isolated.multiplier = Number(String(draft.isolatedMultiplier).replace(',', '.'));
    if (draft.isolatedSlowPct.trim()) isolated.slowPct = mechInt(draft.isolatedSlowPct, 'Aislado: ralentización %', 1, 99);
    if (isolated.multiplier != null || isolated.slowPct != null) out.isolated = isolated;
  }
  if (draft.evolutions && draft.evolutionsSlots.trim()) {
    const slots = draft.evolutionsSlots.split(/[,\s]+/).filter(Boolean).map(item => mechInt(item, 'Evoluciones: huecos', 0, 9));
    if (slots.length) out.evolutions = { slots };
  }
  if (draft.evolve && draft.evolveName.trim()) {
    const ev: NonNullable<AbilityMechanics['evolve']> = { name: draft.evolveName.trim() };
    if (draft.evolveEffectName.trim()) {
      ev.effectName = draft.evolveEffectName.trim();
      ev.effect = [{ name: ev.effectName, ...(draft.evolveEffectValues.trim() ? { values: draft.evolveEffectValues.split(/[,\s]+/).filter(Boolean).map(item => Number(String(item).replace(',', '.'))) } : {}), ...(draft.evolveEffectDuration.trim() ? { duration: [mechInt(draft.evolveEffectDuration, 'Evolución: duración', 0, 99)] } : {}) }];
      ev.effectDuration = draft.evolveEffectDuration.trim() ? mechInt(draft.evolveEffectDuration, 'Evolución: duración', 0, 99) : undefined;
      ev.effectTarget = draft.evolveEffectTarget;
    }
    if (draft.evolveRecastTimes.trim()) ev.recast = { times: mechInt(draft.evolveRecastTimes, 'Evolución recast: veces', 1, 9), turns: mechInt(draft.evolveRecastTurns || '0', 'Evolución recast: turnos', 0, 99) };
    const evIso: NonNullable<AbilityMechanics['isolated']> = {};
    if (draft.evolveIsolatedMultiplier.trim()) evIso.multiplier = Number(String(draft.evolveIsolatedMultiplier).replace(',', '.'));
    if (draft.evolveIsolatedSlowPct.trim()) evIso.slowPct = mechInt(draft.evolveIsolatedSlowPct, 'Evolución aislado: ralentización %', 1, 99);
    if (evIso.multiplier != null || evIso.slowPct != null) ev.isolated = evIso;
    if (draft.evolveRecastOnTakedownTimes.trim()) ev.recastOnTakedown = { times: mechInt(draft.evolveRecastOnTakedownTimes, 'Evolución recast al matar: veces', 1, 9), turns: mechInt(draft.evolveRecastOnTakedownTurns || '0', 'Evolución recast al matar: turnos', 0, 99) };
    out.evolve = ev;
  }
  if (draft.recastOnTakedown) {
    const rec: NonNullable<AbilityMechanics['recastOnTakedown']> = { times: mechInt(draft.recastOnTakedownTimes, 'Recast al matar: veces', 1, 9), turns: mechInt(draft.recastOnTakedownTurns || '0', 'Recast al matar: turnos', 0, 99) };
    if (draft.recastOnTakedownMax.trim()) rec.max = mechInt(draft.recastOnTakedownMax, 'Recast al matar: máximo almacenado', 1, 99);
    if (draft.recastOnTakedownChampion) rec.champion = true;
    out.recastOnTakedown = rec;
  }
  if (draft.returnStrike) out.returnStrike = { type: draft.returnStrikeType };
  if (draft.takedownHeal) {
    const heal: NonNullable<AbilityMechanics['takedownHeal']> = {};
    if (draft.takedownHealFlat.trim()) {
      const flat = mechList(draft.takedownHealFlat, 'Cura al derribar: base plana', false);
      if (flat) heal.flat = flat;
    }
    if (draft.takedownHealFlatByLevel) heal.flatByLevel = true;
    if (draft.takedownHealAp.trim()) {
      const ap = mechList(draft.takedownHealAp, 'Cura al derribar: % AP', false);
      if (ap) heal.ratios = [{ stat: 'ap', values: ap }];
    }
    if (draft.takedownHealChampion) heal.champion = true;
    out.takedownHeal = heal;
  }
  if (draft.armedAa) {
    const aa: NonNullable<AbilityMechanics['armedAa']> = { type: draft.armedAaType.trim() || 'magic' };
    if (draft.armedAaAd.trim()) {
      const ad = parseRatioList(draft.armedAaAd);
      if (ad) aa.ad = ad;
    }
    if (draft.armedAaAp.trim()) {
      const ap = parseRatioList(draft.armedAaAp);
      if (ap) aa.ap = ap;
    }
    assignScalingSource(aa, 'ad', !!aa.ad, draft.armedAaAdSource);
    assignScalingSource(aa, 'ap', !!aa.ap, draft.armedAaApSource);
    if (draft.armedAaHp.trim()) {
      const hp = parseRatioList(draft.armedAaHp);
      if (hp) aa.hp = hp;
    }
    if (draft.armedAaHpSource === 'max' || draft.armedAaHpSource === 'current' || draft.armedAaHpSource === 'missing' || draft.armedAaHpSource === 'bonus') {
      aa.hpSource = draft.armedAaHpSource;
    }
    if (draft.armedAaApPer100.trim()) {
      const apPer100 = Number(String(draft.armedAaApPer100).replace(',', '.'));
      if (!Number.isFinite(apPer100)) throw new Error('AA armado: el % adicional por 100 AP tiene que ser un número');
      aa.apPer100 = apPer100;
    }
    if (draft.armedAaExplodeFromLevel.trim()) aa.explodeFromLevel = mechInt(draft.armedAaExplodeFromLevel, 'AA armado: explota desde el nivel', 1, 18);
    if (draft.armedAaTurns.trim()) aa.turns = mechInt(draft.armedAaTurns, 'AA armado: duración (turnos)', 1, 99);
    if (draft.armedAaEndsSelfStatus) aa.endsSelfStatus = true;
    if (draft.armedAaEffectName.trim()) {
      aa.effectName = draft.armedAaEffectName.trim();
      if (draft.armedAaEffectDuration.trim()) aa.effectDuration = mechInt(draft.armedAaEffectDuration, 'AA armado: duración', 1, 99);
      aa.effect = [{ name: aa.effectName, ...(draft.armedAaEffectValues.trim() ? { values: draft.armedAaEffectValues.split(/[,\s]+/).filter(Boolean).map(item => Number(String(item).replace(',', '.'))) } : {}), ...(aa.effectDuration ? { duration: [aa.effectDuration] } : {}) }];
    }
    out.armedAa = aa;
  }
  if (draft.armArmedAa) out.armArmedAa = true;
  if (draft.resistShred && draft.resistShredPct.trim()) {
    const pct = draft.resistShredPct.split(/[,\s]+/).filter(Boolean).map(item => Number(String(item).replace(',', '.')));
    out.resistShred = { pct, turns: mechInt(draft.resistShredTurns || '2', 'Reducción de resistencias: turnos', 1, 99) };
  }
  if (draft.aaOnHit) {
    const onHit: NonNullable<AbilityMechanics['aaOnHit']> = {};
    if (draft.aaOnHitHp.trim()) onHit.hp = draft.aaOnHitHp.split(/[,\s]+/).filter(Boolean).map(item => Number(String(item).replace(',', '.')));
    if (draft.aaOnHitApPer100.trim()) onHit.apPer100 = Number(String(draft.aaOnHitApPer100).replace(',', '.'));
    if (draft.aaOnHitAd.trim()) onHit.ad = draft.aaOnHitAd.split(/[,\s]+/).filter(Boolean).map(item => Number(String(item).replace(',', '.')));
    if (draft.aaOnHitAp.trim()) onHit.ap = draft.aaOnHitAp.split(/[,\s]+/).filter(Boolean).map(item => Number(String(item).replace(',', '.')));
    assignScalingSource(onHit, 'ad', !!onHit.ad, draft.aaOnHitAdSource);
    assignScalingSource(onHit, 'ap', !!onHit.ap, draft.aaOnHitApSource);
    if (draft.aaOnHitHpSource === 'max' || draft.aaOnHitHpSource === 'current' || draft.aaOnHitHpSource === 'missing' || draft.aaOnHitHpSource === 'bonus') {
      onHit.hpSource = draft.aaOnHitHpSource;
    }
    if (draft.aaOnHitType.trim()) onHit.type = draft.aaOnHitType.trim();
    if (draft.aaOnHitAlways) onHit.always = true;
    if (draft.aaOnHitStackTurns.trim()) {
      onHit.perTargetStacks = { turns: mechInt(draft.aaOnHitStackTurns, 'AA al impactar: duración de acumulaciones', 1, 99) };
      if (draft.aaOnHitStackMax.trim()) onHit.perTargetStacks.max = mechInt(draft.aaOnHitStackMax, 'AA al impactar: tope de acumulaciones', 1, 99);
    }
    out.aaOnHit = onHit;
  }
  if (draft.costStacks) {
    out.costStacks = {
      amount: mechInt(draft.costStacksAmount, 'Acumulaciones de coste: cantidad', 1, 999),
      turns: mechInt(draft.costStacksTurns || '4', 'Acumulaciones de coste: turnos', 1, 99),
      max: mechInt(draft.costStacksMax || '9', 'Acumulaciones de coste: máximo', 1, 99),
    };
  }
  if (draft.deathBurst) {
    const burst: NonNullable<AbilityMechanics['deathBurst']> = { turns: mechInt(draft.deathBurstTurns || '2', 'Explosión al morir: turnos', 1, 99) };
    if (draft.deathBurstName.trim()) burst.name = draft.deathBurstName.trim();
    if (draft.deathBurstPct.trim()) {
      burst.stat = 'spe';
      burst.pct = Number(String(draft.deathBurstPct).replace(',', '.'));
    }
    out.deathBurst = burst;
  }
  if (draft.damageLowHp) {
    const damageLowHp: NonNullable<AbilityMechanics['damageLowHp']> = {
      belowHpPct: mechInt(draft.damageLowHpPct || '40', 'Daño por vida baja: %', 1, 100),
      multiplier: Number(String(draft.damageLowHpMult || '2').replace(',', '.')),
    };
    if (draft.damageMissingMaxBonus.trim()) damageLowHp.missingMaxBonusPct = mechInt(draft.damageMissingMaxBonus, 'Daño por vida faltante: % máx.', 1, 200);
    out.damageLowHp = damageLowHp;
  }
  if (draft.onAbilityUse) {
    out.onAbilityUse = { turns: mechInt(draft.onAbilityUseTurns || '2', 'Al usar una habilidad: turnos', 1, 99) };
    if (draft.onAbilityUseAttackSpeed.trim()) out.onAbilityUse.attackSpeed = mechList(draft.onAbilityUseAttackSpeed, 'Al usar una habilidad: vel. ataque %', false);
  }
  if (draft.resetSectorShots) {
    const from = draft.resetSectorShotsFrom.trim();
    if (!from) throw new Error('Reiniciar disparos: pon el nombre de la habilidad');
    out.resetSectorShots = { from, count: mechInt(draft.resetSectorShotsCount || '1', 'Reiniciar disparos: cantidad', 1, 8) };
    if (draft.resetSectorShotsChampionHit) out.resetSectorShots.requiresChampionHit = true;
  }
  if (draft.strikes) {
    const count = mechList(draft.strikesCount, 'Golpes: número', true);
    if (!count) throw new Error('Golpes: pon el número por rango');
    out.strikes = { count };
    if (draft.strikesPerBonusAtkSpe.trim()) out.strikes.perBonusAtkSpe = mechInt(draft.strikesPerBonusAtkSpe, 'Golpes: % vel. ataque bonus', 1, 200);
  }
  if (draft.reduceEmpoweredOnHit.trim()) out.reduceEmpoweredAaOnHit = mechInt(draft.reduceEmpoweredOnHit, 'Al acertar, menos CD del AA potenciado', 1, 99);
  if (draft.protect) {
    const pct = mechList(draft.protectPct, 'Protección: % de reducción de daño', false);
    if (!pct) throw new Error('Protección: pon el % de reducción de daño por rango (100 = invulnerable)');
    const protect: NonNullable<AbilityMechanics['protect']> = {
      turns: mechInt(draft.protectTurns, 'Protección: turnos', 1, 99),
      damageReductionPct: pct,
    };
    if (draft.protectName.trim()) protect.name = draft.protectName.trim().slice(0, 80);
    if (draft.protectTarget === 'ally' || draft.protectTarget === 'allyOrSelf') protect.target = draft.protectTarget;
    out.protect = protect;
  }
  if (draft.levelThresholds) {
    const thresholds: AbilityLevelThreshold[] = [];
    for (const [index, row] of (draft.levelThresholdRows ?? []).entries()) {
      if (!row.level.trim()) continue;
      const label = `Umbral ${index + 1}`;
      const entry: AbilityLevelThreshold = { level: mechInt(row.level, `${label}: nivel de campeón`, 1, 18) };
      if (row.name.trim()) entry.name = row.name.trim().slice(0, 80);
      if (row.rangeBonus.trim()) entry.rangeBonus = mechInt(row.rangeBonus, `${label}: casillas de alcance`, 0, 20);
      if (row.permanentMaxStacks) entry.permanentMaxStacks = true;
      if (row.waveType || row.waveAd.trim() || row.waveAp.trim() || row.waveRequiresMaxStacks) {
        const wave: NonNullable<AbilityLevelThreshold['aaWave']> = {};
        if (row.waveType === 'magic' || row.waveType === 'true' || row.waveType === 'physical') wave.type = row.waveType;
        if (row.waveAd.trim()) {
          const ad = parseRatioList(row.waveAd);
          if (ad) wave.ad = ad;
        }
        if (row.waveAp.trim()) {
          const ap = parseRatioList(row.waveAp);
          if (ap) wave.ap = ap;
        }
        assignScalingSource(wave, 'ad', !!wave.ad, row.waveAdSource);
        assignScalingSource(wave, 'ap', !!wave.ap, row.waveApSource);
        if (row.waveRequiresMaxStacks) wave.requiresMaxStacks = true;
        entry.aaWave = wave;
      }
      thresholds.push(entry);
    }
    if (thresholds.length) out.levelThresholds = thresholds;
  }
  const src = draft.sourceMechanics;
  if (src) {
    preserveUnknownKeys(out, src, KNOWN_MECHANICS_KEYS);
    if (out.stacks && src.stacks) {
      preserveUnknownKeys(out.stacks, src.stacks, [
        'turns', 'max', 'required', 'onAa', 'onAbilityHit', 'onChampionTakedown', 'onNonChampionKill',
        'stat', 'perStack', 'perTarget', 'requiresDamage', 'onChampionCc', 'consumeAtMax', 'onMaxCooldown',
        'onMaxHeal', 'armArmedAaAtMax', 'armArmedAaTurns', 'onMaxStatus',
      ]);
      if (out.stacks.onMaxHeal && src.stacks.onMaxHeal) {
        preserveUnknownKeys(out.stacks.onMaxHeal, src.stacks.onMaxHeal, ['selfRatios', 'allyRatios', 'alliesToo', 'flat', 'flatByLevel']);
        const selfRatios = preserveExtraRatios(out.stacks.onMaxHeal.selfRatios, src.stacks.onMaxHeal.selfRatios);
        const allyRatios = preserveExtraRatios(out.stacks.onMaxHeal.allyRatios, src.stacks.onMaxHeal.allyRatios);
        if (selfRatios) out.stacks.onMaxHeal.selfRatios = selfRatios;
        if (allyRatios) out.stacks.onMaxHeal.allyRatios = allyRatios;
      }
      if (out.stacks.onMaxStatus && src.stacks.onMaxStatus) {
        preserveUnknownKeys(out.stacks.onMaxStatus, src.stacks.onMaxStatus, ['name', 'stat', 'amount', 'pct']);
      }
    }
    if (out.armedAa && src.armedAa) {
      preserveUnknownKeys(out.armedAa, src.armedAa, [
        'type', 'ad', 'ap', 'adSource', 'apSource', 'effectName', 'effectDuration', 'effect',
        'endsSelfStatus', 'hp', 'hpSource', 'apPer100', 'explodeFromLevel', 'turns',
      ]);
    }
    if (out.aaOnHit && src.aaOnHit) {
      preserveUnknownKeys(out.aaOnHit, src.aaOnHit, [
        'hp', 'hpSource', 'apPer100', 'type', 'ad', 'adSource', 'always', 'perTargetStacks', 'ap', 'apSource',
      ]);
    }
    if (out.protect && src.protect) preserveUnknownKeys(out.protect, src.protect, ['name', 'turns', 'damageReductionPct', 'target']);
    if (out.levelThresholds && src.levelThresholds) {
      out.levelThresholds = out.levelThresholds.map((row, index) => {
        const prev = src.levelThresholds?.[index];
        if (!prev) return row;
        const merged = preserveUnknownKeys(row, prev, ['level', 'name', 'rangeBonus', 'aaWave', 'permanentMaxStacks']);
        if (merged.aaWave && prev.aaWave) {
          merged.aaWave = preserveUnknownKeys(merged.aaWave, prev.aaWave, ['type', 'ad', 'adSource', 'ap', 'apSource', 'requiresMaxStacks']);
        }
        return merged;
      });
      if (src.levelThresholds.length > out.levelThresholds.length) {
        out.levelThresholds = [...out.levelThresholds, ...src.levelThresholds.slice(out.levelThresholds.length)];
      }
    }
    if (out.takedownHeal && src.takedownHeal) {
      preserveUnknownKeys(out.takedownHeal, src.takedownHeal, ['flat', 'flatByLevel', 'ratios', 'champion']);
      const ratios = preserveExtraRatios(out.takedownHeal.ratios, src.takedownHeal.ratios);
      if (ratios) out.takedownHeal.ratios = ratios;
    }
    if (out.recastOnTakedown && src.recastOnTakedown) {
      preserveUnknownKeys(out.recastOnTakedown, src.recastOnTakedown, ['times', 'turns', 'max', 'champion']);
    }
    if (out.returnStrike && src.returnStrike) preserveUnknownKeys(out.returnStrike, src.returnStrike, ['type']);
    if (out.resistShred && src.resistShred) preserveUnknownKeys(out.resistShred, src.resistShred, ['pct', 'turns', 'armor', 'mr']);
    if (out.castPool && src.castPool) {
      preserveUnknownKeys(out.castPool, src.castPool, [
        'kind', 'stat', 'values', 'turns', 'hitStat', 'hitPct', 'target', 'requiresHit', 'alliesToo',
        'flat', 'flatByLevel', 'delayTurns', 'requiresChampionHit', 'allAllies', 'lowHpBonus',
        'requiresSelfInArea', 'requiresSelfStatus', 'ratios', 'perChampionHit',
      ]);
      const ratios = preserveExtraRatios(out.castPool.ratios, src.castPool.ratios);
      if (ratios) out.castPool.ratios = ratios;
    }
    if (out.selfStatus && src.selfStatus) preserveUnknownKeys(out.selfStatus, src.selfStatus, [
      'name', 'turns', 'value', 'stat', 'amount', 'pct', 'fixedAttacks', 'pctValues', 'amountValues',
      'requiresChampionHit', 'blocksRecast', 'cancelable', 'blocksAbility', 'damageReductionValues',
      'durationByStacks', 'stats',
    ]);
    if (out.evolve && src.evolve) {
      preserveUnknownKeys(out.evolve, src.evolve, [
        'name', 'effectName', 'effect', 'effectDuration', 'effectTarget', 'recast', 'isolated', 'recastOnTakedown',
      ]);
      if (out.evolve.recastOnTakedown && src.evolve.recastOnTakedown) {
        preserveUnknownKeys(out.evolve.recastOnTakedown, src.evolve.recastOnTakedown, ['times', 'turns', 'max', 'champion']);
      }
    }
    if (out.trap && src.trap) preserveUnknownKeys(out.trap, src.trap, ['turns', 'name', 'applyOnPlace', 'eruptName', 'eruptDuration']);
    if (out.empoweredAa && src.empoweredAa) preserveUnknownKeys(out.empoweredAa, src.empoweredAa, [
      'healHpPct', 'cooldown', 'byLevel', 'reduceOnAbility', 'reduceOnStruck', 'skipAboveHpPct',
    ]);
    if (out.mark && src.mark) preserveUnknownKeys(out.mark, src.mark, ['turns', 'detonateOn', 'damageOnDetonate', 'refundMana']);
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
  hp: string;
  hpSource: 'max' | 'current' | 'missing' | 'bonus' | '';
  hpFrom: 'target' | 'self' | '';
  effects: EffectDraft[];
  cooldown: string;
  effectDuration: string;
  effectTarget: 'self' | 'enemy' | '';
  effectName: string;
  area: AreaPattern | null;
  requiresStacks: boolean;
  requiresStacksFrom: string;
  requiresStacksCount: string;
  requiresStacksConsume: boolean;
  stackDamage: boolean;
  stackDamageFrom: string;
  stackDamagePct: string;
  stackDamageType: 'physical' | 'magic' | 'true';
  stackDamageByLevel: boolean;
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
    hp: formatRatioList(ability?.damage?.hp),
    hpSource: ability?.damage?.hpSource ?? '',
    hpFrom: ability?.damage?.hpFrom ?? '',
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
    hp: formatRatioList(variant.damage?.hp),
    hpSource: variant.damage?.hpSource ?? '',
    hpFrom: variant.damage?.hpFrom ?? '',
    effects: effectsToDraft(variant.effect),
    cooldown: typeof variant.cooldown === 'number' ? String(variant.cooldown) : '',
    effectDuration: typeof variant.effectDuration === 'number' ? String(variant.effectDuration) : '',
    effectTarget: variant.effectTarget ?? '',
    effectName: variant.effectName ?? '',
    area: variant.area ? (normalizeArea(variant.area) ?? null) : null,
    requiresStacks: !!variant.requiresStacks,
    requiresStacksFrom: variant.requiresStacks?.from ?? '',
    requiresStacksCount: variant.requiresStacks ? String(variant.requiresStacks.count) : '',
    requiresStacksConsume: variant.requiresStacks?.consume === true,
    stackDamage: !!variant.stackDamage,
    stackDamageFrom: variant.stackDamage?.from ?? '',
    stackDamagePct: formatNumberList(variant.stackDamage?.pct),
    stackDamageType: variant.stackDamage?.type ?? 'magic',
    stackDamageByLevel: variant.stackDamage?.byLevel === true,
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
  hp: '',
  hpSource: '',
    hpFrom: '',
  effects: [],
  cooldown: '',
  effectDuration: '',
  effectTarget: '',
  effectName: '',
  area: null,
  requiresStacks: false,
  requiresStacksFrom: '',
  requiresStacksCount: '',
  requiresStacksConsume: false,
  stackDamage: false,
  stackDamageFrom: '',
  stackDamagePct: '',
  stackDamageType: 'magic',
  stackDamageByLevel: false,
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
  const hp = parsePercentList(draft.hp, `${label}: el escalado de vida`);
  if (hp) damage.hp = hp;
  if (draft.hpSource === 'max' || draft.hpSource === 'current' || draft.hpSource === 'missing' || draft.hpSource === 'bonus') {
    damage.hpSource = draft.hpSource;
  }
  if (draft.hpFrom === 'self' || draft.hpFrom === 'target') damage.hpFrom = draft.hpFrom;
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
  if (draft.area && !isAreaEmpty(draft.area)) {
    const area = normalizeArea(draft.area);
    if (area) variant.area = area;
  }
  if (draft.requiresStacks) {
    const from = draft.requiresStacksFrom.trim();
    if (!from) throw new Error(`${label}: requiere cargas: pon el nombre de la habilidad que tiene el contador`);
    if (from.length > 80) throw new Error(`${label}: requiere cargas: el nombre no puede superar 80 caracteres`);
    variant.requiresStacks = { from, count: parseTurns(draft.requiresStacksCount, `${label}: cargas necesarias`) ?? 0 };
    if (!variant.requiresStacks.count) throw new Error(`${label}: requiere cargas: pon un entero entre 1 y 999`);
    if (variant.requiresStacks.count > 999) throw new Error(`${label}: requiere cargas: máximo 999`);
    if (draft.requiresStacksConsume === true) variant.requiresStacks.consume = true;
  }
  if (draft.stackDamage) {
    const from = draft.stackDamageFrom.trim();
    if (!from) throw new Error(`${label}: daño por cargas: pon el nombre de la habilidad que tiene el contador`);
    if (from.length > 80) throw new Error(`${label}: daño por cargas: el nombre no puede superar 80 caracteres`);
    const pct = parseNumberList(draft.stackDamagePct, `${label}: daño por cargas (% por rango)`);
    if (!pct) throw new Error(`${label}: daño por cargas: pon el % por rango`);
    if (pct.some(value => value < 0 || value > 999)) throw new Error(`${label}: daño por cargas: % entre 0 y 999`);
    variant.stackDamage = { from, pct };
    if (draft.stackDamageType && draft.stackDamageType !== 'magic') variant.stackDamage.type = draft.stackDamageType;
    if (draft.stackDamageByLevel) variant.stackDamage.byLevel = true;
  }
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
  const hp = parsePercentList(draft.hp, 'El escalado de vida');
  if (hp) damage.hp = hp;
  if (draft.hpSource === 'max' || draft.hpSource === 'current' || draft.hpSource === 'missing' || draft.hpSource === 'bonus') {
    damage.hpSource = draft.hpSource;
  }
  if (draft.hpFrom === 'self' || draft.hpFrom === 'target') damage.hpFrom = draft.hpFrom;
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
