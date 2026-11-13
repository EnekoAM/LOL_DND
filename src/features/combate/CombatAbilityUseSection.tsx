import { useEffect, useMemo, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { BASIC_MAX_RANK, MILESTONE_RANKS, ULT_MAX_RANK, milestoneRank, normalizeRanks, type RankedSlot } from '../../data/abilityRanks';
import { ABILITY_KEYS, findAbilityRef, type Ability, type Champion } from '../../data/champions';
import { participantChampion } from '../../data/combatSheet';
import type { CombatBonus, CombatEffect, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { firePassives, newBonusId, type PassiveResult } from './combatBonuses';
import { abilityBreakSource, abilityBuff, abilityBuffSource, abilityBuffStatSource, abilityCharges, abilityRecast, abilityRecastSource, abilitySelfStatSource, abilityShieldSource, abilityStacks, abilityStacksSource, abilityFixedAttacks, abilityFixedAttacksSource, abilityToggle, abilityToggleSource, abilityTrap, abilityTrapSource, empoweredAaState, startEmpoweredAaCooldown, reduceEmpoweredAaCooldown, gainAbilityStack, isCrowdControlEffectName, abilityStackHealCdSource, isBelowExecuteThreshold, passiveStatus, rankValue, reduceChargeRecharge, sectorShotState, selfStatusStatBonus, spendAbilityCharge, spendSectorShot, stacksRequirement, type AbilityExecute, readPermanentAbilityStacks, stackDamageAmount, permanentAbilityStackSource, sameAbilityName, applyEvolve, isAbilityEvolved, abilityEvolveSource, abilityArmedAaMarker, abilityArmedAaSource, armAbilityArmedAa, grantAbilityRecast, evolutionSlotCount, evolvedAbilityCount, stackedAbilityCost, gainAbilityCostStack, abilityCostStackCount, abilityDeathBurst, abilityDeathBurstSource, abilityResistShredSource, abilityAaOnHitActive, aaOnHitDamage, damageLowHpMultiplier, abilityStrikeCount, resolveSelfStatusTurns, sectorShotTrigger, sectorGapSource, resetSectorShots, incomingDamageReductionPct, abilitySelfDrSource, abilityAaOnHitStackSource, abilityStackMaxStatusSource, hasPermanentMaxStacks, mergedAaWave } from '../../data/abilityMechanics';
import { participantHp, participantHpPools } from './combatHp';
import { innateCdSource, innateShieldSource, pendingHealSource, reduceInnateCooldowns } from './innateShield';
import { CHIP_ICON, fmt, rollText, type ResultChip } from './combatResult';
import { logCombat } from './combatConsole';
import { critMultiplier, effectiveResistLine, hitRollLines } from './combatMitigation';
import { permanentStackSaver } from '../../data/permanentStacks';
import { useNamedEffectDescriptions } from '../../data/namedEffectDescriptions';
import { participantAbilities, stackGainOwners } from './abilityRules';
import { abilityDischargesVigor, vigorChainTargets, activeNamedEffects, armAfterAbility, combatExtraLines, fireEffectRules, hasVigorItem, participantContext, poolAmount, vampHeal, vigorEffects, type EffectCallbacks, type EffectTriggerName } from './effectRules';
import { VIGOR_MAX, VIGOR_PER_AA } from '../../data/combat';
import { partyLevel, subscribeParty } from '../../data/party';
import { PLAYERS, PLAYER_ABILITY_SLOTS, type Player, type PlayerListPatch } from '../../data/players';
import { championResourceBar, type ResourceId } from '../../data/resources';
import { abilityActiveEffectKey, abilityCooldownKey, abilityStackKey, readActiveEffect, readCooldown, readStack } from '../../data/stacks';
import { cx } from '../../lib/cx';
import { abilityPhase, abilityPhaseCount, abilityPhaseKey, clampPhase, hasVariants, isChoosePhases, phaseLabels } from '../../data/abilityVariants';
import PhaseTabs from '../habilidades/PhaseTabs';
import ResourceChip from '../../components/ResourceChip';
import { resolveAbilityResource } from '../../data/resources';
import { basicAttackEntries } from '../../data/players';
import SpellCard, { SPELL_TYPE_LABEL, type SpellTone } from '../players/SpellCard';
import StackCounter from '../players/StackCounter';
import CooldownControl from '../players/CooldownControl';
import { BarInputs } from './CombatBar';
import { actionLimits, actionsLeft, basicAttackPct, leftoverAfterAttackLimitChange, withFixedAttacks } from './combatActions';
import { consumeSpellShields, hasCinderbloom, healFromManaSpent, participantItems } from './itemCombatHooks';
import { damageTargets, targetHpLine, type TargetDamageFn } from './combatHp';
import CombatTargetPicker from './CombatTargetPicker';
import { hpDamageAmount, rollDamageStat } from '../players/abilityDamage';
import { formatDamageAmount, formatDamageType } from './combatAbilityUse';
import { championDamageContext } from '../calculos/championDamage';
import { playerBonusLine, playerMaxHp, playerTotalLine } from '../calculos/playerTotals';
import { hasDamageScaling, rollAbilityDamage } from '../players/abilityDamage';
import {
  formatDiceBreakdown,
  formatSpendLine,
  formatUseHeadline,
  numericStat,
  parseAbilityCost,
  resolvedSpendKind,
} from './combatAbilityUse';

type Props = {
  participant: CombatParticipant;
  isAdmin: boolean;
  /** Si no, la barra de Vida (recurso vida) se oculta. También permite editar la barra (admin o su propio player). */
  canSeeHp?: boolean;
  /** Guarda el valor de la barra escrito a mano o con ±. max solo para players (su ficha). */
  onBarSave?: (kind: 'hp' | 'pool', current: number, max?: number) => Promise<void>;
  saving: boolean;
  participants: CombatParticipant[];
  onApplySourcedEffect: (targetIds: string | string[], input: SourcedEffectInput) => void | Promise<void>;
  onPlayerPatch: (playerName: string, patch: PlayerListPatch) => Promise<void>;
  onCombatPatch: (patch: Partial<CombatParticipant>) => void | Promise<void>;
  /** Aplica daño a un objetivo (solo admin): escudo → temp → vida, con Deshacer. */
  onTargetDamage?: TargetDamageFn;
  /** Bonus temporales (pasivas de ítems): PATCH op bonuses. */
  onBonusesSave?: (bonuses: CombatBonus[]) => Promise<void>;
  onTargetBonuses?: EffectCallbacks['onTargetBonuses'];
  onPoolChange?: EffectCallbacks['onSelfPool'];
  /** Cura / escudo a otro participante (escudo de una habilidad a un aliado). */
  onTargetPool?: EffectCallbacks['onTargetPool'];
  /** Acciones del turno vía PATCH (admin o su propio player). */
  onActionsSave?: (kind: 'attacks' | 'abilities' | 'items', left: number, extra: number) => Promise<void>;
  /** panel: lista compacta con barra (Preparación); sheet: tarjetas de hechizo como la ficha (sin barra). */
  variant?: 'panel' | 'sheet';
};

type AbilityRow = {
  key: string;
  seal: string;
  name: string;
  ability: Ability;
  image?: string;
  rank: number;
  maxRank: number;
  rankAdjustable: boolean;
  ownerResource?: ResourceId;
};

/** Cambios de las mecánicas de habilidad que se guardan junto con los bonus de las pasivas (un guardado, un Deshacer). */
type MechanicsSeed = { bonuses: CombatBonus[]; log: string[]; chips: ResultChip[]; undos: (() => Promise<void>)[]; usedName?: string; usedRequires?: { name: string }; consumedStacks?: { from: string; count: number } };

type LastUse = {
  headline: string;
  detail?: string;
  undo?: () => void;
  /** En pantalla: un chip por efecto. */
  chips?: ResultChip[];
  /** Desarrollo completo (va a la consola del navegador). */
  log?: string[];
};

/** ¿La habilidad hace daño físico? (tipo físico o sin tipo, como en la consola). Mágico, verdadero y mixto no critean. */

function abilityIsPhysical(ability: Ability): boolean {
  const type = formatDamageType(ability.damage?.type);
  return type === 'daño físico' || type === 'daño';
}

function abilityDamageKind(ability: Ability): 'physical' | 'magic' | 'true' | undefined {
  const type = formatDamageType(ability.damage?.type);
  if (type === 'daño físico' || type === 'daño') return 'physical';
  if (type === 'daño mágico') return 'magic';
  if (type === 'daño verdadero') return 'true';
  return undefined;
}

const foldName = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const IMMOBILIZE_EFFECT_KEYS = [
  'aturdimiento', 'lanzado al aire', 'lanzado por los aires', 'levantado', 'enraizamiento',
  'encantado', 'encanto', 'miedo', 'provocacion', 'supresion',
  'stun', 'root', 'charm', 'fear', 'taunt', 'suppression', 'airborne', 'knock up', 'knockup',
  'inmovilizacion', 'inmovilizado', 'inmovil',
];

function isImmobilizeEffectName(name: string): boolean {
  const folded = foldName(name);
  if (folded.includes('ralent') || folded === 'slow' || folded.includes('slow ')) return false;
  return IMMOBILIZE_EFFECT_KEYS.some(key => folded === key || folded.includes(key));
}

function activeMandateAmp(bearer: CombatParticipant, data: ReturnType<typeof useNamedEffectDescriptions>): boolean {
  return activeNamedEffects(participantItems(bearer), data).some(effect => effect.config.rules.some(rule => !!rule.damageAmpPct));
}


function suggestedOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function playerRows(player: Player, level: number): AbilityRow[] {
  const ranks = normalizeRanks(player.abilityRanks, level);
  const autoRank = Math.max(1, milestoneRank(level));
  const rows: AbilityRow[] = [];
  for (const { slot, key } of PLAYER_ABILITY_SLOTS) {
    const abilityName = player.abilities[slot];
    if (!abilityName) continue;
    const ref = findAbilityRef(abilityName);
    if (!ref) continue;
    const ranked = slot === 'P' ? null : (slot as RankedSlot);
    const stored = ranked ? ranks[ranked] : autoRank;
    // Máximo fijo por hueco (como Players), no por cuántos valores tenga el escalado.
    const cap = ranked ? (ranked === 'R' ? ULT_MAX_RANK : BASIC_MAX_RANK) : MILESTONE_RANKS;
    rows.push({
      key,
      seal: key,
      name: ref.ability.name,
      ability: ref.ability,
      image: ref.image,
      rank: Math.max(0, stored),
      maxRank: cap,
      rankAdjustable: false,
      ownerResource: ref.championResource,
    });
  }
  return rows;
}

const championLevel = (champion: Champion): number =>
  typeof champion.level === 'number' && Number.isFinite(champion.level) ? Math.min(20, Math.max(1, Math.floor(champion.level))) : 1;

function championRows(champion: Champion, rankOverride: Record<string, number>): AbilityRow[] {
  const rows: AbilityRow[] = [];
  for (const slot of ABILITY_KEYS) {
    const ability = champion.abilities[slot];
    if (!ability?.name) continue;
    // El rango va por hueco (Q/W/E 1–5, R 1–3); el escalado/coste se queda en su último valor si tiene menos.
    const maxRank = slot === 'P' ? 1 : slot === 'R' ? ULT_MAX_RANK : BASIC_MAX_RANK;
    const override = rankOverride[slot];
    const rank = slot === 'P'
      ? Math.max(1, milestoneRank(championLevel(champion)))
      : typeof override === 'number' ? clampRank(override, maxRank) : 1;
    rows.push({
      key: slot,
      seal: slot,
      name: ability.name,
      ability,
      image: champion.image,
      rank,
      maxRank,
      rankAdjustable: slot !== 'P',
      ownerResource: champion.resource,
    });
  }
  return rows;
}

/** Rombos fijos por hueco, como en la ficha de Players: Q/W/E 5, R 3, pasiva por hitos de nivel (4). */
function slotPipCount(seal: string): number {
  if (seal === 'R') return ULT_MAX_RANK;
  if (seal === 'P') return MILESTONE_RANKS;
  return BASIC_MAX_RANK;
}

function clampRank(value: number, maxRank: number): number {
  return Math.min(maxRank, Math.max(0, Math.floor(value)));
}

export type PoolView = {
  kind: 'hp' | 'pool';
  label: string;
  current: number;
  max: number;
  /** Recurso de la barra (para el color). */
  resourceId?: ResourceId;
};

export function playerPool(player: Player, kind: 'hp' | 'pool'): PoolView {
  if (kind === 'hp') {
    const suggested = playerMaxHp(player.sheet, player.equipamiento) ?? 0;
    const max = suggestedOr(player.hp, Math.max(0, suggested));
    const current = suggestedOr(player.actualHp, max);
    return { kind, label: 'Vida', current, max };
  }
  const totals = playerTotalLine(player.sheet, player.equipamiento);
  const suggested = numericStat(totals.mana);
  const max = suggestedOr(player.mana, suggested);
  const current = suggestedOr(player.actualMana, max);
  return { kind, label: 'Maná', current, max };
}

export function championPool(champion: Champion, participant: CombatParticipant, kind: 'hp' | 'pool'): PoolView {
  const { stats } = championDamageContext(champion);
  if (kind === 'hp') {
    // Máximo propio del participante si se fijó en combate; si no, el de sus stats.
    const max = suggestedOr(participant.maxHp, numericStat(stats.hp));
    const current = Math.min(max, suggestedOr(participant.hp, max));
    return { kind, label: 'Vida', current, max };
  }
  const bar = championResourceBar(champion.resource, numericStat(stats.mana));
  const max = suggestedOr(participant.resourceMax, bar?.max ?? numericStat(stats.mana));
  const current = Math.min(max, suggestedOr(participant.currentResource, bar?.start === 'empty' ? 0 : max));
  return { kind, label: bar?.label ?? 'Maná', current, max, resourceId: bar?.id };
}

export default function CombatAbilityUseSection({
  participant,
  isAdmin,
  canSeeHp = true,
  onBarSave,
  saving,
  participants,
  onApplySourcedEffect,
  onPlayerPatch,
  onCombatPatch,
  onActionsSave,
  onTargetDamage,
  onBonusesSave,
  onTargetBonuses,
  onPoolChange,
  onTargetPool,
  variant = 'panel',
}: Props) {
  const level = useSyncExternalStore(subscribeParty, partyLevel);
  const effectData = useNamedEffectDescriptions();
  /** Bonus temporales del combate (manuales / pasivas) + reglas «Siempre» de sus efectos con nombre. */
  const extra = combatExtraLines(participant, level, effectData);
  const [rankOverride, setRankOverride] = useState<Record<string, number>>({});
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  /** Habilidad (ya en su fase) cuyo efecto se está aplicando a un objetivo. */
  const [pickingAbility, setPickingAbility] = useState<Ability | null>(null);
  /** Fase pulsada de la habilidad que espera objetivos (se elige antes de usarla). */
  const [pickingPhase, setPickingPhase] = useState<number | undefined>(undefined);
  /** Fase vista sin permiso para guardarla en el combate (solo pantalla). */
  const [localPhases, setLocalPhases] = useState<Record<string, number>>({});
  // El deshacer se ejecuta más tarde: usa siempre el último estado del combate.
  const combatPatchRef = useRef(onCombatPatch);
  combatPatchRef.current = onCombatPatch;
  const [lastUse, setLastUse] = useState<LastUse | null>(null);
  /** Ataque básico esperando objetivo. */
  const [attackPick, setAttackPick] = useState<'AD' | 'AP' | null>(null);
  const [trapPicking, setTrapPicking] = useState<AbilityRow | null>(null);
  /** «Crít.»: el player ha sacado crítico en su tirada; el daño físico base de la acción × DAÑO CRÍT. Se apaga tras usarlo. */
  const [crit, setCrit] = useState(false);
  const [isolated, setIsolated] = useState(false);
  const [selfInArea, setSelfInArea] = useState(false);
  const [busy, setBusy] = useState(false);
  /** «Vigor al máximo» que encadena: espera a que se elijan hasta N objetivos. */
  const [chainAsk, setChainAsk] = useState<{ title: string; max?: number; primary: string; candidates?: CombatParticipant[]; confirmLabel?: string; resolve: (ids: string[]) => void } | null>(null);
  const askTargets = (title: string, primary: string, max?: number, candidates?: CombatParticipant[], confirmLabel?: string): Promise<string[]> =>
    new Promise(resolve => setChainAsk({ title, max, primary, candidates, confirmLabel, resolve: ids => { setChainAsk(null); resolve(ids); } }));
  const askChainTargets = (max: number, primary: string) => askTargets('⚡ Vigor al máximo: encadena a', primary, max);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRankOverride({});
    setPickingKey(null);
    setPickingAbility(null);
    setLocalPhases({});
    setLastUse(null);
    setError(null);
    setAttackPick(null);
    setTrapPicking(null);
    setPickingPhase(undefined);
    setCrit(false);
  }, [participant.id]);

  const player = participant.kind === 'player' && participant.sourceId
    ? PLAYERS.find(entry => entry.name === participant.sourceId) ?? null
    : null;
  // Su propia copia de la ficha (o la base si el combate es anterior a las copias).
  const champion = participantChampion(participant);
  const savedRanks = participant.sheet?.abilityRanks;

  const rows = useMemo(() => {
    if (player) return playerRows(player, level);
    if (champion) return championRows(champion, { ...savedRanks, ...rankOverride });
    return [];
  }, [player, champion, level, rankOverride, savedRanks]);

  /** Rango de la copia: el admin lo guarda en el combate; el resto solo lo ve en pantalla. */
  const setRank = (key: string, rank: number) => {
    rank = Math.max(0, Math.min(20, Math.floor(rank)));
    setRankOverride(cur => ({ ...cur, [key]: rank }));
    if (isAdmin && participant.sheet?.kind === 'champion') {
      onCombatPatch({ sheet: { ...participant.sheet, abilityRanks: { ...participant.sheet.abilityRanks, [key]: rank } } });
    }
  };

  const [actionsBusy, setActionsBusy] = useState(false);
  if (participant.kind !== 'player' && participant.kind !== 'champion') return null;

  const ownerResource = player
    ? rows.find(row => row.ownerResource)?.ownerResource
    : champion?.resource;
  // Economía de acciones del turno (Attacks / Abilities de la ficha).
  const extras = { attacks: participant.actionsExtra?.attacks ?? 0, abilities: participant.actionsExtra?.abilities ?? 0 };
  const limitsFrom = (bonuses: typeof participant.bonuses) => {
    const base = withFixedAttacks(actionLimits(player, champion, level, extra), bonuses);
    return {
      attacks: base.attacks === undefined ? undefined : base.attacks + extras.attacks,
      abilities: base.abilities === undefined ? undefined : base.abilities + extras.abilities,
    };
  };
  // Máximo del turno = el de la ficha (o el número de ataques fijo del estado/interruptor) + los extra concedidos.
  const baseLimits = withFixedAttacks(actionLimits(player, champion, level, extra), participant.bonuses);
  const limits = limitsFrom(participant.bonuses);
  const left = actionsLeft(participant, limits);
  const hpForDamage = (damage: Ability['damage'] | undefined, target?: CombatParticipant | null) => {
    const who = damage?.hpFrom === 'self' ? participant : target ?? null;
    return who ? participantHp(who) : null;
  };
  const hpOrigin = (damage: Ability['damage'] | undefined) => {
    const origin = damage?.hpSource === 'current' ? 'vida actual' : damage?.hpSource === 'missing' ? 'vida faltante' : damage?.hpSource === 'bonus' ? 'vida bonus' : 'vida máx.';
    return damage?.hpFrom === 'self' ? `${origin} del portador` : origin;
  };
  const prevActions = participant.actionsLeft;
  const actionsAfterFixedAttacks = (bonuses: typeof participant.bonuses, spentAbilities = false) => {
    const nextLeft = leftoverAfterAttackLimitChange(limits.attacks, left.attacks, limitsFrom(bonuses).attacks);
    const abilities = spentAbilities ? Math.max(0, (left.abilities ?? 0) - 1) : left.abilities;
    if (nextLeft === left.attacks && !spentAbilities) return undefined;
    if (nextLeft === left.attacks && spentAbilities) {
      return { ...participant.actionsLeft, attacks: left.attacks, abilities };
    }
    return { ...participant.actionsLeft, attacks: nextLeft, abilities };
  };
  const spendAction = (kind: 'attacks' | 'abilities'): CombatParticipant['actionsLeft'] | undefined => {
    const current = left[kind];
    if (current === undefined) return undefined;
    return { ...participant.actionsLeft, attacks: left.attacks, abilities: left.abilities, [kind]: Math.max(0, current - 1) };
  };
  const saveActions = (kind: 'attacks' | 'abilities', nextLeft: number, nextExtra: number) => {
    if (!onActionsSave || actionsBusy) return;
    setActionsBusy(true);
    setError(null);
    void onActionsSave(kind, Math.max(0, Math.min(99, nextLeft)), Math.max(0, Math.min(99, nextExtra)))
      .catch(caught => setError(caught instanceof Error ? caught.message : 'No se pudieron guardar las acciones'))
      .finally(() => setActionsBusy(false));
  };
  const setActions = (kind: 'attacks' | 'abilities', value: number) => {
    if (!isAdmin || saving || busy) return;
    const max = limits[kind];
    const next = Math.max(0, Math.min(max ?? 99, Math.floor(value)));
    if (onActionsSave) saveActions(kind, next, extras[kind]);
    else onCombatPatch({ actionsLeft: { ...participant.actionsLeft, attacks: left.attacks, abilities: left.abilities, [kind]: next } });
  };
  /** + Extra: una acción más este turno (puede pasar del máximo de la ficha). */
  const addExtra = (kind: 'attacks' | 'abilities') => saveActions(kind, (left[kind] ?? 0) + 1, extras[kind] + 1);
  const removeExtra = (kind: 'attacks' | 'abilities') => {
    if (extras[kind] <= 0) return;
    saveActions(kind, (left[kind] ?? 0) - 1, extras[kind] - 1);
  };

  const primaryKind = resolvedSpendKind(undefined, ownerResource ? { resource: ownerResource } : undefined).kind;
  const showBar = primaryKind !== 'none';
  const barKind: 'hp' | 'pool' = primaryKind === 'hp' ? 'hp' : 'pool';
  const pool = player
    ? playerPool(player, barKind)
    : champion
      ? championPool(champion, participant, barKind)
      : null;

  const locked = !isAdmin || saving || busy || participant.defeated;

  const currentFor = (kind: 'hp' | 'pool'): PoolView | null => {
    if (player) return playerPool(player, kind);
    if (champion) return championPool(champion, participant, kind);
    return null;
  };

  const persistSpend = async (kind: 'hp' | 'pool', nextCurrent: number, combatExtra?: Partial<CombatParticipant>, playerExtra?: PlayerListPatch) => {
    if (player) {
      const patch: PlayerListPatch = { ...playerExtra };
      if (kind === 'hp') {
        const max = playerPool(player, 'hp').max;
        patch.hp = max;
        patch.actualHp = Math.max(0, Math.min(max, nextCurrent));
      } else {
        const max = playerPool(player, 'pool').max;
        patch.mana = max;
        patch.actualMana = Math.max(0, Math.min(max, nextCurrent));
      }
      await onPlayerPatch(player.name, patch);
      return;
    }
    const patch: Partial<CombatParticipant> = { ...combatExtra };
    if (kind === 'hp') patch.hp = Math.max(0, nextCurrent);
    else patch.currentResource = Math.max(0, nextCurrent);
    await onCombatPatch(patch);
  };

  const barLocked = !canSeeHp || saving || busy;
  const setBar = (current: number, max?: number) => {
    if (!pool || barLocked) return;
    const cap = max ?? pool.max;
    const next = Math.max(0, Math.min(cap, Math.floor(current)));
    if (next === pool.current && (max === undefined || max === pool.max)) return;
    const save = onBarSave
      ? onBarSave(pool.kind, next, player ? cap : undefined)
      : persistSpend(pool.kind, next);
    setBusy(true);
    void save
      .catch(err => { setError(err instanceof Error ? err.message : 'No se pudo ajustar el recurso'); })
      .finally(() => setBusy(false));
  };
  const adjustBar = (delta: number) => {
    if (!pool) return;
    setBar(pool.current + delta);
  };

  const phaseOf = (row: AbilityRow): number => {
    const key = abilityPhaseKey(row.name);
    const local = localPhases[key];
    return clampPhase(row.ability, typeof local === 'number' ? local : participant.abilityPhases?.[key]);
  };
  const activeAbility = (row: AbilityRow, phase = phaseOf(row)): Ability => abilityPhase(row.ability, phase);
  const selectPhase = (row: AbilityRow, index: number) => {
    if (saving || busy) return;
    const key = abilityPhaseKey(row.name);
    // Sin permiso de escritura en el combate, la elección solo cambia lo que se ve.
    if (!isAdmin) {
      setLocalPhases(cur => ({ ...cur, [key]: clampPhase(row.ability, index) }));
      return;
    }
    setLocalPhases(cur => {
      if (!(key in cur)) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
    onCombatPatch({ abilityPhases: { ...participant.abilityPhases, [abilityPhaseKey(row.name)]: clampPhase(row.ability, index) } });
  };

  /**
   * Usar: si hace daño o pone un efecto enemigo, primero se eligen los objetivos (nada se gasta hasta Atacar);
   * si no, se usa directamente.
   */
  const useAbility = (row: AbilityRow, chosenPhase?: number) => {
    if (locked) return;
    const phaseIndex = typeof chosenPhase === 'number' ? clampPhase(row.ability, chosenPhase) : phaseOf(row);
    const ability = applyEvolve(activeAbility(row, phaseIndex), isAbilityEvolved(participant.bonuses, row.name));
    const enemy = typeof ability.effectDuration === 'number' && ability.effectDuration > 0 && ability.effectTarget === 'enemy';
    const damaging = hasDamageScaling(ability.damage) && !!onTargetDamage;
    // «A todos los enemigos» sin daño: no hay que elegir objetivos.
    if (enemy && ability.mechanics?.allEnemies && !damaging) return runAbility(row, chosenPhase, []);
    const allyCast = ability.mechanics?.castPool?.target === 'ally';
    // Efecto retrasado sin golpe inicial: se coloca sin elegir objetivos; el daño va en Detonar.
    if (ability.mechanics?.trap && !ability.mechanics.trap.applyOnPlace) return runAbility(row, chosenPhase, []);
    if (enemy || damaging || allyCast) {
      setAttackPick(null);
      setPickingKey(row.key);
      setPickingAbility(ability);
      setPickingPhase(chosenPhase);
      return;
    }
    return runAbility(row, chosenPhase, []);
  };

  const cancelPicking = () => {
    setPickingKey(null);
    setPickingAbility(null);
    setPickingPhase(undefined);
    setCrit(false);
    setIsolated(false);
    setSelfInArea(false);
  };

  const toggleEvolve = async (row: AbilityRow) => {
    if (locked || !onBonusesSave) return;
    const source = abilityEvolveSource(row.name);
    const ev = row.ability.mechanics?.evolve;
    if (!ev) return;
    const prev = participant.bonuses ?? [];
    const already = isAbilityEvolved(prev, row.name);
    let next = prev.filter(bonus => bonus.source !== source);
    if (!already) {
      const slots = evolutionSlotCount(rows);
      if (evolvedAbilityCount(prev, rows) >= slots) return;
      next = [...next, { id: newBonusId(), stat: 'buff', amount: 1, source, label: ev.name.slice(0, 80) }];
    }
    setBusy(true);
    try {
      await onBonusesSave(next);
    } finally {
      setBusy(false);
    }
  };

  const armArmed = async (row: AbilityRow) => {
    if (locked || !onBonusesSave || row.rank < 1 || !row.ability.mechanics?.armedAa) return;
    const prev = participant.bonuses ?? [];
    if (abilityArmedAaMarker(prev, row.name)) return;
    setBusy(true);
    try {
      await onBonusesSave(armAbilityArmedAa(prev, row.name, newBonusId, row.name));
    } finally {
      setBusy(false);
    }
  };

  const startDeathBurst = async (row: AbilityRow) => {
    if (locked || !onBonusesSave || row.rank < 1) return;
    const burst = row.ability.mechanics?.deathBurst;
    if (!burst || abilityDeathBurst(participant.bonuses, row.name)) return;
    const prev = participant.bonuses ?? [];
    const source = abilityDeathBurstSource(row.name);
    const effectSource = `ability:${row.name}`;
    const statusName = burst.name ?? row.name;
    setBusy(true);
    try {
      const snapshot: Record<string, CombatEffect | null> = { [participant.id]: participant.effects.find(effect => effect.source === effectSource) ?? null };
      await onApplySourcedEffect([participant.id], { source: effectSource, name: statusName, duration: burst.turns });
      let bonuses = [...prev.filter(bonus => bonus.source !== source && bonus.source !== abilitySelfStatSource(row.name)), { id: newBonusId(), stat: 'buff', amount: 1, turns: burst.turns, source, label: statusName.slice(0, 80) }];
      if (burst.stat && (burst.pct != null || burst.amount != null)) {
        const context = participantContext(participant, level, extra);
        const current = context ? Number(context.ctx.stats[burst.stat] ?? 0) || 0 : 0;
        const bonus = selfStatusStatBonus({ name: statusName, turns: burst.turns, stat: burst.stat, pct: burst.pct, amount: burst.amount }, current);
        if (bonus) bonuses = [...bonuses, { id: newBonusId(), stat: burst.stat as CombatBonus['stat'], amount: bonus.amount, turns: burst.turns, source: abilitySelfStatSource(row.name), label: statusName.slice(0, 80) }];
      }
      await onBonusesSave(bonuses);
      const lines = [`${row.seal} «${row.name}»: ${statusName} ${burst.turns} t. (zombi: inobjetivo / no actúa, a mano)${burst.pct ? ` · +${burst.pct}% ${burst.stat ?? 'spe'}` : ''}. «Explotar» al acabar.`];
      setLastUse({ headline: `${row.seal} «${row.name}»: al morir`, log: lines, chips: [{ kind: 'buff', text: `${statusName} ${burst.turns}t`, title: lines[0] }], undo: () => { void (async () => { await onApplySourcedEffect([participant.id], { source: effectSource, name: statusName, duration: 1, restore: snapshot }); await onBonusesSave(prev); setLastUse(null); })(); } });
      logCombat({ title: `${row.seal} «${row.name}»: al morir`, lines, actor: participant.name });
    } finally {
      setBusy(false);
    }
  };

  const explodeDeathBurst = async (row: AbilityRow) => {
    if (locked || !onBonusesSave) return;
    const burst = row.ability.mechanics?.deathBurst;
    const marker = abilityDeathBurst(participant.bonuses, row.name);
    if (!burst || !marker) return;
    const prev = participant.bonuses ?? [];
    const source = abilityDeathBurstSource(row.name);
    const effectSource = `ability:${row.name}`;
    const statusName = burst.name ?? row.name;
    setBusy(true);
    try {
      const bonuses = prev.filter(bonus => bonus.source !== source && bonus.source !== abilitySelfStatSource(row.name));
      await onBonusesSave(bonuses);
      const snapshot: Record<string, CombatEffect | null> = { [participant.id]: participant.effects.find(effect => effect.source === effectSource) ?? null };
      await onApplySourcedEffect([participant.id], { source: effectSource, name: statusName, duration: 1, restore: { [participant.id]: null } });
      void snapshot;
      const lines = [`${row.seal} «${row.name}»: explota (radio del área de la habilidad). El daño verdadero de base plana se omite: va a mano.`];
      setLastUse({ headline: `${row.seal} «${row.name}»: explosión`, log: lines, chips: [{ kind: 'buff', text: 'Explosión', title: lines[0] }], undo: () => { void onBonusesSave(prev).then(() => setLastUse(null)); } });
      logCombat({ title: `${row.seal} «${row.name}»: explosión`, lines, actor: participant.name });
    } finally {
      setBusy(false);
    }
  };

  /** Gasta coste / CD / fase / acción, tira el daño una vez y lo aplica a los objetivos (vacío = a nadie). */
  const runAbility = async (row: AbilityRow, chosenPhase: number | undefined, targetIds: string[]) => {
    pendingCcGrants.length = 0;
    cancelPicking();
    if (locked) return;
    const phased = hasVariants(row.ability);
    // En modo «a elegir» se usa la fase pulsada y no se avanza.
    const choose = isChoosePhases(row.ability);
    const phaseIndex = typeof chosenPhase === 'number' ? clampPhase(row.ability, chosenPhase) : phaseOf(row);
    const ability = applyEvolve(activeAbility(row, phaseIndex), isAbilityEvolved(participant.bonuses, row.name));
    const prevPhases = participant.abilityPhases;
    const nextPhases = phased && !choose
      ? { ...prevPhases, [abilityPhaseKey(row.name)]: (phaseIndex + 1) % abilityPhaseCount(row.ability) }
      : undefined;
    const phaseNote = phased ? ` (${phaseLabels(row.ability)[phaseIndex]})` : '';
    const spend = resolvedSpendKind(ability, row.ownerResource ? { resource: row.ownerResource } : undefined);
    // Recast gratis (Danza de guerra): sin coste ni bloqueo por su efecto.
    const mechanics = row.ability.mechanics;
    const toggleOn = !!mechanics?.toggle && !!abilityToggle(participant.bonuses, row.name);
    const selfOn = !!(participant.effects.find(effect => effect.source === `ability:${row.name}`) || (participant.bonuses ?? []).some(bonus => bonus.source === abilitySelfStatSource(row.name) || (bonus.source ?? '').startsWith(`${abilitySelfStatSource(row.name)}:`) || bonus.source === abilitySelfDrSource(row.name)));
    const recastOn = !!abilityRecast(participant.bonuses, row.name);
    const noAction = row.ability.mechanics?.noAction === true;
    const cost = spend.kind === 'none' || recastOn || toggleOn ? 0 : stackedAbilityCost(parseAbilityCost(ability.cost, row.rank) ?? 0, participant.bonuses, row.name, ability.mechanics?.costStacks);
    const spendPool = spend.kind === 'none' ? null : currentFor(spend.kind === 'hp' ? 'hp' : 'pool');
    if (toggleOn || (mechanics?.selfStatus?.cancelable && selfOn)) {
      await endAbilityToggle(row);
      return;
    }
    if (spendPool && cost > spendPool.current) return;
    const hpPool = currentFor('hp');
    const hpPct = mechanics?.costHpMaxPct;
    const hpMinPct = mechanics?.costHpMinCurrentPct;
    let hpCost = 0;
    if (hpPct && !recastOn && !toggleOn && hpPool && hpPool.max) {
      if (hpMinPct && (hpPool.current / hpPool.max) * 100 < hpMinPct) return;
      hpCost = Math.round(hpPool.max * hpPct / 100);
    }
    if (row.rank < 1) return;
    const usesCharges = !!mechanics?.charges;
    if (usesCharges && (abilityCharges(row.ability, participant.bonuses, row.name)?.left ?? 0) <= 0) return;
    const need = stacksRequirement(ability.mechanics, row.name);
    if (need && stacksFor(need.name) < need.count) return;
    if (mechanics?.buff && abilityBuff(participant.bonuses, row.name) && !mechanics.toggle) return;
    const shots = mechanics?.sectorShots;
    if (shots && (sectorShotTrigger(shots) === 'cast' || sectorShotTrigger(shots) === 'both')) {
      const gap = (participant.bonuses ?? []).find(bonus => bonus.source === sectorGapSource(row.name) && (bonus.turns ?? 0) > 0);
      if (gap) return;
      if (sectorShotState(participant.bonuses, row.name, shots.count).ready <= 0) return;
    }
    // Sin CD: no se puede usar mientras su propio efecto siga activo.
    if ((!recastOn || ability.mechanics?.selfStatus?.blocksRecast) && mechanics?.selfStatus?.blocksAbility !== false && activeEffectOf(row)) return;

    let headline = `${row.seal} «${row.name}»`;
    let damageTotal = 0;
    let detail: string | undefined;
    const abilityLog: string[] = [`${row.seal} «${row.name}»${phaseNote} de ${participant.name}`];
    const critOn = crit;
    const isolatedOn = isolated;
    const inAreaOn = selfInArea;
    setCrit(false);
    setIsolated(false);
    setSelfInArea(false);
    let abilityCritical = false;
    const abilityChips: ResultChip[] = [];
    let abilityStats: Record<string, unknown> | null = null;
    const placingTrap = !!mechanics?.trap && !mechanics.trap.applyOnPlace;
    const placingMark = !!mechanics?.mark && mechanics.mark.damageOnDetonate !== false;
    if (hasDamageScaling(ability.damage) && !(recastOn && mechanics?.execute) && !placingTrap && !placingMark) {
      try {
        const stats = player
          ? { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) }
          : champion
            ? championDamageContext(champion, extra).stats
            : null;
        if (!stats) return;
        const result = rollAbilityDamage(ability.damage!, stats, row.rank);
        // Crítico: solo si la habilidad hace daño físico (el mágico / verdadero / mixto no critea).
        const critical = critOn && abilityIsPhysical(ability);
        abilityCritical = critical;
        const noCrit = critical ? critNoDamageOwner() : undefined;
        const mult = critical && !noCrit ? critMultiplier(stats as Record<string, unknown>) : 1;
        damageTotal = critical && !noCrit ? Math.ceil(result.total * mult) : result.total;
        if (isolatedOn && ability.mechanics?.isolated?.multiplier) {
          const before = damageTotal;
          damageTotal = Math.ceil(damageTotal * ability.mechanics.isolated.multiplier);
          abilityLog.push(`Objetivo aislado: ${fmt(before)} × ${ability.mechanics.isolated.multiplier} = ${fmt(damageTotal)}`);
          abilityChips.push({ kind: 'buff', text: `Aislado ×${ability.mechanics.isolated.multiplier}`, title: `Daño ${fmt(before)} × ${ability.mechanics.isolated.multiplier}` });
        }
        headline = formatUseHeadline(row.seal, { kind: 'roll', total: damageTotal, type: ability.damage?.type });
        if (critical) headline = headline.replace(/^(\S+)/, '$1 CRÍTICO');
        detail = formatDiceBreakdown(result);
        abilityLog.push(
          `Daño${ability.damage?.type ? ` ${ability.damage.type}` : ''} (rango ${row.rank}) = ${result.contributions.map(entry =>
            `${fmt(entry.scaling * 100)}% ${entry.stat.toUpperCase()} ${entry.source === 'bonus' ? 'bonus' : 'total'} (${rollText(entry.roll)}) = ${fmt(entry.damage)}`).join(' + ')} → ${fmt(result.total)}`,
          ...(critical && noCrit ? [`CRÍTICO sin daño extra (P «${noCrit}»: los críticos no hacen daño extra) → ${fmt(damageTotal)}`] : []),
          ...(critical && !noCrit ? [`CRÍTICO: ${fmt(result.total)} × DAÑO CRÍT ${fmt(mult)} = ${fmt(result.total * mult)}${damageTotal !== result.total * mult ? ` → ${fmt(damageTotal)} (redondeo ↑)` : ''}`] : []),
        );
        if (critical) abilityChips.push({ kind: 'crit', text: noCrit ? 'CRÍTICO sin daño' : 'CRÍTICO', title: noCrit ? `${noCrit}: los críticos no hacen daño extra` : `× ${fmt(mult)} (DAÑO CRÍT)` });
        abilityStats = stats as Record<string, unknown>;
      } catch (caught) {
        headline = formatUseHeadline(row.seal, {
          kind: 'error',
          error: caught instanceof Error ? caught.message : 'No se pudo calcular el daño',
        });
      }
    } else {
      headline = formatUseHeadline(row.seal, { kind: 'none' });
    }
    if (phaseNote) headline = headline.replace(`«${row.seal}»`, `«${row.seal}»${phaseNote}`);
    if (cost > 0 && spendPool) {
      headline = `${headline} · ${formatSpendLine(cost, spend.label)}`;
    } else if (ability.cost?.trim() && spend.kind !== 'none' && parseAbilityCost(ability.cost, row.rank) === null) {
      headline = `${headline} · coste: ${ability.cost.trim()}`;
    }
    if (hpCost > 0) headline = `${headline} · −${hpCost} PV (${hpPct}% vida máx.)`;

    const cooldownKey = abilityCooldownKey(row.name);
    const effectKey = abilityActiveEffectKey(row.name);
    // Las habilidades no tienen CD (se bloquean mientras dura su efecto); las de cargas usan su recarga.
    const cdDuration = 0 as number;
    const effectDuration = typeof ability.effectDuration === 'number' && ability.effectDuration > 0
      ? ability.effectDuration
      : 0;
    const enemyEffect = effectDuration > 0 && ability.effectTarget === 'enemy';
    const selfEffect = effectDuration > 0 && !enemyEffect;

    const prevPlayer = player;
    const prevCombat = {
      currentResource: participant.currentResource,
      hp: participant.hp,
      cooldowns: participant.cooldowns,
      activeEffects: participant.activeEffects,
    };

    setBusy(true);
    setError(null);
    try {
      const nextCurrent = spendPool ? Math.max(0, spendPool.current - cost) : 0;
      if (player) {
        const extra: PlayerListPatch = {};
        if (cdDuration > 0) extra.cooldowns = { [cooldownKey]: cdDuration };
        if (selfEffect) extra.activeEffects = { [effectKey]: effectDuration };
        if (spendPool && cost > 0) await persistSpend(spendPool.kind, nextCurrent, undefined, extra);
        else if (extra.cooldowns || extra.activeEffects) await onPlayerPatch(player.name, extra);
        const actions = noAction ? undefined : spendAction('abilities');
        if (nextPhases || actions) {
          await combatPatchRef.current({ ...(nextPhases ? { abilityPhases: nextPhases } : {}), ...(actions ? { actionsLeft: actions } : {}) });
        }
      } else {
        const extra: Partial<CombatParticipant> = {};
        if (cdDuration > 0) extra.cooldowns = { ...participant.cooldowns, [cooldownKey]: cdDuration };
        if (selfEffect) extra.activeEffects = { ...participant.activeEffects, [effectKey]: effectDuration };
        if (nextPhases) extra.abilityPhases = nextPhases;
        const actions = noAction ? undefined : spendAction('abilities');
        if (actions) extra.actionsLeft = actions;
        if (spendPool && cost > 0) await persistSpend(spendPool.kind, nextCurrent, extra);
        else if (Object.keys(extra).length > 0) await onCombatPatch(extra);
      }
      if (spendPool && spendPool.kind === 'pool' && cost > 0) {
        await healFromManaSpent(participant, cost, { level, effectData, callbacks: { onSelfPool: onPoolChange }, participants });
      }

      const undo = isAdmin
        ? () => {
            if (prevPlayer) {
              const patch: PlayerListPatch = {};
              if (spendPool && cost > 0) {
                if (spendPool.kind === 'hp') {
                  patch.hp = spendPool.max;
                  patch.actualHp = spendPool.current;
                } else {
                  patch.mana = spendPool.max;
                  patch.actualMana = spendPool.current;
                }
              }
              if (hpCost > 0 && hpPool) {
                patch.hp = hpPool.max;
                patch.actualHp = hpPool.current;
              }
              if (cdDuration > 0) {
                patch.cooldowns = { [cooldownKey]: readCooldown(prevPlayer.cooldowns, cooldownKey) };
              }
              if (selfEffect) {
                patch.activeEffects = { [effectKey]: readActiveEffect(prevPlayer.activeEffects, effectKey) };
              }
              if (Object.keys(patch).length > 0) void onPlayerPatch(prevPlayer.name, patch);
              combatPatchRef.current({ ...(nextPhases ? { abilityPhases: prevPhases ?? {} } : {}), actionsLeft: prevActions });
            } else {
              const patch: Partial<CombatParticipant> = {};
              if (spendPool && cost > 0) {
                if (spendPool.kind === 'hp') patch.hp = prevCombat.hp ?? spendPool.current;
                else patch.currentResource = prevCombat.currentResource ?? spendPool.current;
              }
              if (hpCost > 0) patch.hp = prevCombat.hp ?? hpPool?.current;
              if (cdDuration > 0) patch.cooldowns = prevCombat.cooldowns;
              if (selfEffect) patch.activeEffects = prevCombat.activeEffects;
              if (nextPhases) patch.abilityPhases = prevPhases ?? {};
              patch.actionsLeft = prevActions;
              combatPatchRef.current(patch);
            }
            setLastUse(null);
          }
        : undefined;

      if (cost > 0 && spendPool) abilityLog.push(`Coste: ${cost} ${spend.label} (${spendPool.current} → ${Math.max(0, spendPool.current - cost)})`);
      if (hpCost > 0 && hpPool) {
        const nextHp = Math.max(1, hpPool.current - hpCost);
        abilityLog.push(`Coste de vida: ${hpCost} PV (${hpPct}% vida máx.; ${hpPool.current} → ${nextHp}; no baja de 1)`);
        await persistSpend('hp', nextHp);
      }
      if (cdDuration > 0) abilityLog.push(`CD de la habilidad: ${cdDuration} t.`);
      let usedAbility = ability;
      if (isolatedOn && usedAbility.mechanics?.isolated?.slowPct != null && usedAbility.effect?.length) {
        const slow = usedAbility.mechanics.isolated.slowPct;
        usedAbility = { ...usedAbility, effect: usedAbility.effect.map((entry, index) => index === 0 ? { ...entry, values: [slow] } : entry) };
        abilityLog.push(`Objetivo aislado: ralentización ${slow}%`);
      }
      const allEnemies = enemyEffect && usedAbility.mechanics?.allEnemies === true;
      const effectIds = allEnemies ? enemiesOf().map(entry => entry.id) : targetIds;
      if (effectDuration > 0) abilityLog.push(`Efecto «${(ability.effectName ?? '').trim() || row.name}» ${effectDuration} t. ${enemyEffect ? `a ${targets.filter(t => effectIds.includes(t.id)).map(t => t.name).join(', ') || 'nadie'}${allEnemies ? ' (todos los enemigos)' : ''}` : `en ${participant.name}`}`);
      abilityLog.push(...shieldUpNotes(targetIds));
      if (ability.appliesOnHit) abilityLog.push('Aplica efectos de impacto');
      setLastUse({ headline, detail, undo, log: abilityLog, ...(abilityChips.length ? { chips: abilityChips } : {}) });
      const executeRecast = !!(recastOn && mechanics?.execute);
      let kills: string[] = [];
      if (!placingTrap && (targetIds.length > 0 || allEnemies)) {
        const lowHp = usedAbility.mechanics?.damageLowHp;
        const strikeCfg = usedAbility.mechanics?.strikes;
        const bonusAs = abilityStats ? Number((abilityStats as { atkSpePct?: number; bonus?: { atkSpePct?: number } }).atkSpePct ?? (abilityStats as { bonus?: { atkSpePct?: number } }).bonus?.atkSpePct ?? 0) || 0 : 0;
        const strikeCount = strikeCfg ? abilityStrikeCount(strikeCfg, row.rank, bonusAs) : 1;
        if (strikeCount > 1) abilityLog.push(`${strikeCount} golpes${strikeCfg?.perBonusAtkSpe ? ` (base ${rankValue(strikeCfg.count, row.rank) ?? strikeCfg.count[0]} + vel. ataque bonus ${fmt(bonusAs)}%)` : ''}`);
        for (let strike = 0; strike < strikeCount; strike++) {
          const skipFx = executeRecast || strike > 0;
        if (lowHp && damageTotal > 0 && !executeRecast) {
          for (const id of (allEnemies ? effectIds : targetIds)) {
            const who = participants.find(entry => entry.id === id);
            const hp = who ? participantHp(who) : null;
            let dealt = damageTotal;
            if (hp?.max) {
              const mult = damageLowHpMultiplier(lowHp, hp.current, hp.max);
              dealt = Math.ceil(damageTotal * mult);
              if (mult !== 1 && strike === 0) abilityLog.push(`${who?.name ?? id}: vida ${fmt(hp.current)}/${fmt(hp.max)} → daño ×${fmt(mult)} = ${fmt(dealt)}`);
            } else if (strike === 0) {
              abilityLog.push(`${who?.name ?? id}: bonus de vida baja a mano (no hay vida de combate)`);
            }
            const more = await applyToTargets(row, usedAbility, dealt, [id], skipFx ? [] : (effectIds.includes(id) ? [id] : []), abilityLog, skipFx ? { skipEffects: true, lifeSteal: false } : undefined);
            kills = [...new Set([...kills, ...more])];
          }
          // efectos a quienes no recibieron daño en el bucle (solo allEnemies sin estar en damage list)
        } else {
          kills = [...new Set([...kills, ...await applyToTargets(row, usedAbility, damageTotal, targetIds, skipFx ? [] : effectIds, abilityLog, skipFx ? { skipEffects: true, lifeSteal: false } : undefined)])];
        }
        }
      }
      if (executeRecast && !headline) headline = `${row.seal} «${row.name}» · Execute`;
      const stackCfg = ability.mechanics?.stackDamage;
      if (stackCfg && targetIds.length > 0 && !placingTrap) {
        const stacks = stacksFor(stackCfg.from);
        const dmgRank = stackCfg.byLevel ? milestoneRank(level) : row.rank;
        const extra = stackDamageAmount(stackCfg.pct, dmgRank, stacks);
        if (extra > 0) {
          const typ = stackCfg.type === 'physical' ? 'físico' : stackCfg.type === 'true' ? 'verdadero' : 'mágico';
          abilityLog.push(`Daño extra por cargas de «${stackCfg.from}»: ${extra} ${typ} a cada objetivo (${rankValue(stackCfg.pct, dmgRank)}% × ${stacks}${stackCfg.byLevel ? ', tramo de nivel' : ''})`);
          const more = await applyToTargets(row, ability, extra, targetIds, [], abilityLog, { skipEffects: true, lifeSteal: false });
          kills = [...new Set([...kills, ...more])];
        }
      }

      // Daño % de vida (por objetivo).
      if (ability.damage?.hp && targetIds.length && !(recastOn && mechanics?.execute) && !placingTrap) {
        for (const id of targetIds) {
          const who = participants.find(entry => entry.id === id);
          if (!who) continue;
          const hp = hpForDamage(ability.damage, who);
          const extra = hp ? hpDamageAmount(ability.damage, row.rank, hp) : 0;
          if (extra <= 0) continue;
          const origin = hpOrigin(ability.damage);
          abilityLog.push(`Daño de vida (${origin}): ${extra} a ${who.name}`);
          const more = await applyToTargets(row, ability, extra, [id], [], abilityLog, { skipEffects: true });
          kills = [...new Set([...kills, ...more])];
        }
      }
      if (mechanics?.returnStrike && targetIds.length && damageTotal > 0 && !placingTrap && !(recastOn && mechanics?.execute)) {
        const typ = mechanics.returnStrike.type;
        const typLabel = typ === 'physical' ? 'físico' : typ === 'true' ? 'verdadero' : 'mágico';
        const typeName = typ === 'true' ? 'verdadero' : typ === 'physical' ? 'físico' : 'mágico';
        const returned = { ...usedAbility, damage: { ...(usedAbility.damage ?? ability.damage), type: typeName } };
        abilityLog.push(`Vuelta: ${fmt(damageTotal)} ${typLabel} a cada objetivo (el mismo monto; si la trayectoria de vuelta no coincide, a mano)`);
        const more = await applyToTargets(row, returned, damageTotal, targetIds, [], abilityLog, { skipEffects: true, lifeSteal: false });
        kills = [...new Set([...kills, ...more])];
      }
      if (mechanics?.execute && recastOn) {
        const done = await applyExecute(row, mechanics.execute, targetIds, abilityLog);
        kills = [...new Set([...kills, ...done.kills])];
        if (done.headline) headline = done.headline;
        abilityChips.push(...done.chips);
      } else if (mechanics?.execute && targetIds.length && !placingTrap) {
        const ready = targetIds.filter(id => {
          const who = participants.find(entry => entry.id === id);
          const hp = who ? participantHp(who) : null;
          return hp && isBelowExecuteThreshold(hp, mechanics.execute!.hpPct);
        });
        if (ready.length) abilityLog.push(`Execute listo (≤ ${mechanics.execute.hpPct}% vida máx. en ${ready.map(id => participants.find(entry => entry.id === id)?.name).join(', ')}): usa Recast`);
      }
      if (abilityStats && targetIds.length > 0 && damageTotal > 0) {
        const kind = /m[aá]gic/i.test(ability.damage?.type ?? '') ? 'magic' : 'physical';
        const trueDamage = /verdader|\btrue\b/i.test(ability.damage?.type ?? '');
        abilityLog.push(
          `Objetivos: ${targets.filter(t => targetIds.includes(t.id)).map(t => t.name).join(', ')} (${fmt(damageTotal)} a cada uno)`,
          ...(trueDamage ? ['Daño verdadero: no necesita tirada contra resistencia (ignora CA / RM)'] : defenseLines(targetIds, abilityStats, kind)),
        );
      }
      // Mecánicas de la habilidad (cargas de uso, cargas por impacto gastadas, buff, estado de la pasiva): van con los bonus de las pasivas.
      if (recastOn) abilityLog.push('Recast: gratis (sin coste)');
      let seed = reduceEmpoweredOnAbilityUse(await abilityMechanicsSeed(row, targetIds, abilityCritical, usedAbility, { selfInArea: inAreaOn }));
      if (seed) seed.bonuses = await applyCcStackGrants(seed.bonuses, seed.log, seed.chips);
      if (kills.length && seed) {
        let nextBonuses = seed.bonuses;
        for (const entry of rows) {
          const resolved = applyEvolve(activeAbility(entry, phaseOf(entry)), isAbilityEvolved(nextBonuses, entry.name) || isAbilityEvolved(participant.bonuses, entry.name));
          const rec = resolved.mechanics?.recastOnTakedown;
          if (!rec || entry.rank < 1) continue;
          const takeIds = rec.champion ? championKillIds(kills) : [...new Set(kills)];
          if (!takeIds.length) continue;
          nextBonuses = grantAbilityRecast(nextBonuses, entry.name, rec, newBonusId, entry.name);
          seed.log.push(`${entry.seal} «${entry.name}»: recast por ${rec.champion ? 'derribo de campeón' : 'eliminación/asistencia'} ×${rec.times}${rec.turns ? ` ${rec.turns} t.` : ' hasta usarlo'}${rec.max ? ` (máx. ${rec.max})` : ''}`);
          seed.chips.push({ kind: 'buff', text: `Recast ${entry.name}`, title: rec.champion ? 'Al derribar campeón' : 'Al matar / asistir' });
        }
        seed.bonuses = nextBonuses;
      }
      const nextActions = actionsAfterFixedAttacks(seed?.bonuses ?? participant.bonuses, !noAction);
      if (nextActions) await combatPatchRef.current({ actionsLeft: nextActions });
      // Escudo / cura a un aliado: los objetivos son aliados, no cuentan como impactos.
      const hitIds = row.ability.mechanics?.castPool?.target === 'ally' ? [] : targetIds;
      if (hitIds.length) seed = await detonateMarks(hitIds, 'ability', row, seed);
      // Cargas de combate (Flujo de maná): solo si la habilidad ha hecho daño a algún objetivo (1 carga por uso).
      const passive = noAction ? await seedOnly(seed) : await passivesFor('on-ability', hitIds, kills, ability.appliesOnHit === true, damageTotal > 0, seed, { ultimate: row.seal === 'R' });
      setLastUse(current => (current ? withPassives({ ...current, log: abilityLog }, passive) : current));
      const targetNames = targets.filter(t => targetIds.includes(t.id)).map(t => t.name).join(', ');
      logCombat({
        title: `${headline}${targetNames ? ` → ${targetNames}` : ''}`,
        lines: [...abilityLog, ...(passive.log ?? [])],
        actor: participant.name,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo usar la habilidad');
    } finally {
      setBusy(false);
    }
  };

  /** Suma el daño al resultado y encadena su Deshacer (primero la vida del objetivo, luego lo demás). */
  /** Pasivas de ítems equipados (bonus al usuario + daño % a los objetivos). */
  /**
   * Efectos con nombre (configurador de bonus) + pasivas de ítems: on-hit gasta los «Tras habilidad» armados;
   * on-ability arma el siguiente AA y salta «Al acertar habilidad»; kills dispara «Al matar / asistir».
   * Un solo guardado de los bonus del usuario y un Deshacer que lo revierte todo.
   */
  const pendingCcGrants: { count: number; effectName: string }[] = [];

  const syncStackMaxStatus = (owner: { seal: string; name: string; rank: number; ability: Ability }, bonuses: CombatBonus[], log?: string[], chips?: ResultChip[]): CombatBonus[] => {
    const stacks = owner.ability.mechanics?.stacks;
    const source = abilityStackMaxStatusSource(owner.name);
    const without = bonuses.filter(bonus => bonus.source !== source);
    const status = stacks?.onMaxStatus;
    if (!stacks || !status || owner.rank < 1) return without;
    const permanent = hasPermanentMaxStacks(owner.ability.mechanics?.levelThresholds, level);
    const count = permanent ? stacks.max : abilityStacks(bonuses, owner.name).count;
    if (count < stacks.max) return without;
    const context = participantContext(participant, level, extra);
    const stats = context?.ctx.stats as Record<string, unknown> | undefined;
    const current = status.stat && stats ? (typeof stats[status.stat] === 'number' ? Number(stats[status.stat]) : 0) : 0;
    const raw = (status.amount ?? 0) + (status.pct && current ? (status.pct / 100) * current : 0);
    const amount = Math.round(raw * 10) / 10;
    const turns = permanent ? undefined : stacks.turns;
    if (amount === 0 && status.pct) {
      log?.push(`${owner.seal} «${owner.name}»: ${status.name ?? 'al máximo'} ${status.pct}% ${status.stat} a mano (sin stat actual)`);
      return without;
    }
    if (!status.stat || !amount) return without;
    log?.push(`${owner.seal} «${owner.name}»: ${status.name ?? 'al máximo'} +${fmt(amount)} ${status.stat}${status.pct ? ` (${status.pct}% de ${fmt(current)})` : ''}${turns ? ` ${turns} t.` : ' permanente'}`);
    chips?.push({ kind: 'buff', text: `${status.name ?? owner.name} +${fmt(amount)} ${status.stat}`, title: 'Al máximo de cargas' });
    return [...without, { id: newBonusId(), stat: status.stat, amount, ...(turns ? { turns } : {}), source, label: (status.name ?? owner.name).slice(0, 80) }];
  };

  const ensurePermanentMaxStacks = (owner: { name: string; rank: number; ability: Ability }, bonuses: CombatBonus[]): CombatBonus[] => {
    const stacks = owner.ability.mechanics?.stacks;
    if (!stacks || owner.rank < 1 || !hasPermanentMaxStacks(owner.ability.mechanics?.levelThresholds, level)) return bonuses;
    const source = abilityStacksSource(owner.name);
    const current = abilityStacks(bonuses, owner.name);
    if (current.count >= stacks.max && current.marker && current.marker.turns == null) return bonuses;
    const marker: CombatBonus = { id: current.marker?.id ?? newBonusId(), stat: 'stacks', amount: stacks.max, maxStacks: stacks.max, source, label: owner.name.slice(0, 80) };
    return [...bonuses.filter(bonus => bonus.source !== source), marker];
  };

  const applyStackThresholds = async (owner: { seal: string; name: string; rank: number; ability: Ability }, bonuses: CombatBonus[], log: string[], chips: ResultChip[]): Promise<CombatBonus[]> => {
    const stacks = owner.ability.mechanics?.stacks;
    if (!stacks || owner.rank < 1) return bonuses;
    const current = abilityStacks(bonuses, owner.name);
    if (current.count < stacks.max) return bonuses;
    let next = bonuses;
    if (stacks.armArmedAaAtMax && owner.ability.mechanics?.armedAa) {
      next = armAbilityArmedAa(next, owner.name, newBonusId, owner.name, stacks.armArmedAaTurns);
      log.push(`${owner.seal} «${owner.name}»: ${current.count}/${stacks.max} cargas → AA armado${stacks.armArmedAaTurns ? ` ${stacks.armArmedAaTurns} t.` : ''}`);
      chips.push({ kind: 'buff', text: `${owner.name} AA armado`, title: 'Al llegar al máximo de cargas' });
    }
    next = syncStackMaxStatus(owner, next, log, chips);
    const heal = stacks.onMaxHeal;
    if (!heal || (!heal.selfRatios?.length && !heal.allyRatios?.length && !heal.flat?.length)) return next;
    if (stacks.onMaxCooldown && next.some(bonus => bonus.source === abilityStackHealCdSource(owner.name) && (bonus.turns ?? 0) > 0)) {
      log.push(`${owner.seal} «${owner.name}»: ${current.count}/${stacks.max} cargas, cura en intervalo (ruge cuando acabe, a mano)`);
      return next;
    }
    if (stacks.consumeAtMax) {
      next = next.filter(bonus => bonus.source !== abilityStacksSource(owner.name));
    }
    if (stacks.onMaxCooldown) {
      const cdSource = abilityStackHealCdSource(owner.name);
      next = [...next.filter(bonus => bonus.source !== cdSource), { id: newBonusId(), stat: 'buff', amount: 1, turns: stacks.onMaxCooldown, source: cdSource, label: owner.name.slice(0, 80) }];
    }
    const selfHeal = computeAbilityHeal(owner, heal);
    if (selfHeal && selfHeal.amount > 0 && onPoolChange) {
      await onPoolChange('heal', selfHeal.amount);
      log.push(`${owner.seal} «${owner.name}»: cura a ${participant.name} ${selfHeal.amount} (${selfHeal.text})`);
      chips.push({ kind: 'buff', text: `Cura ${selfHeal.amount}`, title: owner.name });
    }
    if (heal.alliesToo && heal.allyRatios?.length && onTargetPool) {
      const allies = participants.filter(entry => entry.id !== participant.id && !entry.defeated && !enemiesOf().some(foe => foe.id === entry.id));
      for (const ally of allies) {
        const hp = participantHp(ally);
        const pct = rankValue(heal.allyRatios[0]?.values, owner.rank) ?? 0;
        const raw = (pct / 100) * (hp?.max ?? 0);
        if (raw <= 0) continue;
        const context = participantContext(participant, level, extra);
        const done = context ? poolAmount(raw, context.ctx, true) : { amount: Math.round(raw), text: `${Math.round(raw)}` };
        if (done.amount <= 0) continue;
        await onTargetPool(ally.id, 'heal', done.amount);
        log.push(`${owner.seal} «${owner.name}»: cura a ${ally.name} ${done.amount} (${pct}% vida máx. de ${ally.name} → ${done.text}; radio 5 casillas, a mano si está fuera)`);
      }
    }
    return next;
  };

  const applyCcStackGrants = async (bonuses: CombatBonus[], log: string[], chips: ResultChip[]): Promise<CombatBonus[]> => {
    const total = pendingCcGrants.reduce((sum, grant) => sum + grant.count, 0);
    pendingCcGrants.length = 0;
    if (total <= 0) return bonuses;
    let next = bonuses;
    for (const owner of rows) {
      const stacks = owner.ability.mechanics?.stacks;
      if (!stacks?.onChampionCc || owner.rank < 1) continue;
      const times = stacks.perTarget ? total : 1;
      for (let i = 0; i < times; i++) {
        const gained = gainAbilityStack(next, owner.ability, owner.name, newBonusId);
        if (!gained) break;
        next = gained.bonuses;
        log.push(`${owner.seal} «${owner.name}»: control a campeón → carga ${gained.before} → ${gained.after}/${gained.max}${gained.turns ? ` (${gained.turns} t.)` : ''}`);
        chips.push({ kind: 'buff', text: `${owner.name} ${gained.after}/${gained.max}`, title: 'Cargas al aplicar control a un campeón' });
        if (gained.after >= gained.max) next = await applyStackThresholds(owner, next, log, chips);
      }
    }
    return next;
  };

  const championKillIds = (ids: string[]): string[] => [...new Set(ids)].filter(id => {
    const kind = participants.find(entry => entry.id === id)?.kind;
    return kind === 'champion' || kind === 'player';
  });

  const computeAbilityHeal = (owner: { rank: number }, heal: { flat?: number[]; flatByLevel?: boolean; ratios?: { stat: string; values: number[] }[]; selfRatios?: { stat: string; values: number[] }[] }): { amount: number; text: string } | null => {
    const context = participantContext(participant, level, extra);
    const stats = context ? context.ctx.stats as Record<string, unknown> & { bonus?: Record<string, unknown> } : undefined;
    const key: Record<string, string> = { armor: 'ac', bonusArmor: 'ac', mr: 'mr', bonusMr: 'mr', hp: 'hp', bonusHp: 'hp', mana: 'mana', bonusMana: 'mana', ad: 'ad', bonusAd: 'ad', ap: 'ap' };
    const statNum = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    const statValue = (stat: string): number => {
      if (!stats) return 0;
      if (stat === 'baseAd') return Math.max(0, statNum(stats.ad) - statNum(stats.bonus?.ad));
      if (stat === 'missingHp') return Math.max(0, context?.ctx.missingHp ?? 0);
      if (stat === 'hp' || stat === 'maxHp') return participantHp(participant)?.max ?? statNum(stats.hp);
      if (stat.startsWith('bonus')) return statNum(stats.bonus?.[key[stat] ?? stat]);
      return statNum(stats[key[stat] ?? stat]);
    };
    const healRank = heal.flatByLevel ? Math.max(1, milestoneRank(level)) : owner.rank;
    const flat = rankValue(heal.flat, healRank) ?? 0;
    let raw = flat;
    const parts: string[] = flat ? [`${fmt(flat)} base${heal.flatByLevel ? ` (tramo ${healRank})` : ''}`] : [];
    for (const ratio of [...(heal.ratios ?? []), ...(heal.selfRatios ?? [])]) {
      const pct = rankValue(ratio.values, owner.rank) ?? (ratio.values[0] ?? 0);
      if (!pct) continue;
      const base = statValue(ratio.stat);
      const add = (pct / 100) * base;
      raw += add;
      parts.push(`${fmt(pct)}% ${ratio.stat} (${fmt(base)}) = ${fmt(add)}`);
    }
    if (raw <= 0) return null;
    const done = context ? poolAmount(raw, context.ctx, true) : { amount: Math.round(raw), text: `${Math.round(raw)}` };
    return { amount: done.amount, text: `${parts.join(' + ') || '0'} → ${done.text}` };
  };

  const applyTakedownHeals = async (killIds: string[], log: string[], chips: ResultChip[]): Promise<void> => {
    for (const owner of rows) {
      const heal = owner.ability.mechanics?.takedownHeal;
      if (!heal || owner.rank < 1) continue;
      const ids = heal.champion ? championKillIds(killIds) : [...new Set(killIds)];
      if (!ids.length) continue;
      for (let i = 0; i < ids.length; i++) {
        const given = computeAbilityHeal(owner, heal);
        if (!given || given.amount <= 0 || !onPoolChange) continue;
        await onPoolChange('heal', given.amount);
        log.push(`${owner.seal} «${owner.name}»: cura al derribar ${given.amount} (${given.text})`);
        chips.push({ kind: 'buff', text: `Cura ${given.amount}`, title: `${owner.name}: al derribar` });
      }
    }
  };

  const passivesFor = async (trigger: 'on-hit' | 'on-ability', targetIds: string[], kills: string[] = [], abilityOnHit = false, damaged?: boolean, seed?: MechanicsSeed, opts?: { ultimate?: boolean }): Promise<PassiveResult> => {
    const base = participantContext(participant, level, extra);
    const items = base?.items ?? [];
    const prev = participant.bonuses ?? [];
    let bonuses = seed?.bonuses ?? prev;
    let changed = !!seed && seed.bonuses !== prev;
    const notes: string[] = [];
    const chips: ResultChip[] = [...(seed?.chips ?? [])];
    const log: string[] = [...(seed?.log ?? [])];
    const undos: (() => Promise<void>)[] = [...(seed?.undos ?? [])];
    // Cargas: AA, habilidad con «Aplica efectos de impacto», o habilidad que dañe si el contador tiene onAbilityHit.
    const usedRequires = seed?.usedRequires;
    if (targetIds.length > 0 && (trigger === 'on-hit' || trigger === 'on-ability' || abilityOnHit || damaged)) {
      for (const owner of stackGainOwners(rows, { trigger, abilityOnHit, damaged: damaged === true, usedName: seed?.usedName, usedRequires })) {
        const times = owner.ability.mechanics?.stacks?.perTarget ? targetIds.length : 1;
        let stopped = false;
        for (let n = 0; n < times && !stopped; n++) {
          const gained = gainAbilityStack(bonuses, owner.ability, owner.name, newBonusId);
          if (!gained) {
            if (abilityBuff(bonuses, owner.name)) log.push(`${owner.seal} «${owner.name}»: activa → no acumula cargas`);
            stopped = true;
            continue;
          }
          bonuses = gained.bonuses;
          changed = true;
          chips.push({ kind: 'buff', text: `${owner.name} ${gained.after}/${gained.max}`, title: `Cargas por efecto de impacto (duran ${gained.turns} t.)` });
          log.push(`${owner.seal} «${owner.name}»: efecto de impacto → carga ${gained.before} → ${gained.after}/${gained.max} (dura ${gained.turns} t., se refresca)${owner.ability.mechanics?.stacks?.required && gained.after >= owner.ability.mechanics.stacks.required ? ' · ya se puede activar' : ''}`);
          if (gained.after >= gained.max) bonuses = await applyStackThresholds(owner, bonuses, log, chips);
        }
      }
    }
    // Recarga por campeón alcanzado (Plumas feéricas): AA o habilidad que alcanza campeones.
    const championHits = targetIds.filter(id => { const kind = participants.find(entry => entry.id === id)?.kind; return id !== participant.id && (kind === 'champion' || kind === 'player'); }).length;
    // CD del escudo automático: −N por cada enemigo alcanzado (AA o habilidad).
    const enemyHits = targetIds.filter(id => id !== participant.id).length;
    const innate = reduceInnateCooldowns(bonuses, participant, level, enemyHits);
    if (innate) {
      bonuses = innate.bonuses;
      changed = true;
      log.push(...innate.lines);
      chips.push({ kind: 'cd', text: `CD escudo −${enemyHits}×`, title: innate.lines.join(' · ') });
    }
    if (championHits > 0) {
      for (const owner of rows) {
        const per = owner.ability.mechanics?.charges?.reducePerChampionHit;
        if (!per || owner.rank < 1) continue;
        const reduced = reduceChargeRecharge(bonuses, owner.ability, owner.name, per * championHits);
        if (!reduced) continue;
        bonuses = reduced.bonuses;
        changed = true;
        log.push(`${owner.seal} «${owner.name}»: ${championHits} campeón/es alcanzado/s → recarga ${reduced.before} → ${reduced.after} t.${reduced.recharged ? ' · ¡recargada! (ya se puede usar)' : ''}`);
        chips.push({ kind: 'cd', text: reduced.recharged ? `${owner.name} lista` : `${owner.name} −${per * championHits}t`, title: 'Recarga por campeón alcanzado' });
      }
    }
    // Cargas permanentes (p. ej. Dragon Practice): +1 por campeón único alcanzado; tope y derribos según grantPermanent.
    if (trigger === 'on-ability' && (damaged || kills.length > 0 || (seed?.consumedStacks?.count ?? 0) > 0)) {
      const used = seed?.usedName ? rows.find(entry => sameAbilityName(entry.name, seed.usedName!)) : undefined;
      const defaultOwner = rows.find(entry => entry.ability.mechanics?.permanentStacks && entry.ability.mechanics.permanentStacks.onAbilityChampionHit !== false);
      const grant = used?.ability.mechanics?.grantPermanent;
      const fromName = grant?.from?.trim() || defaultOwner?.name;
      const owner = fromName ? rows.find(entry => sameAbilityName(entry.name, fromName)) : undefined;
      if (owner && owner.rank >= 1 && (grant || defaultOwner) && (grant || owner.ability.mechanics?.permanentStacks?.onAbilityChampionHit !== false)) {
        const champIds = targetIds.filter(id => {
          const kind = participants.find(entry => entry.id === id)?.kind;
          return id !== participant.id && (kind === 'champion' || kind === 'player');
        });
        const minionKills = grant?.onKill ? kills.filter(id => {
          const kind = participants.find(entry => entry.id === id)?.kind;
          return kind !== 'champion' && kind !== 'player';
        }) : [];
        let add = grant?.perConsumedStack ? (seed?.consumedStacks?.count ?? 0) : (champIds.length + minionKills.length);
        if (grant?.maxPerCast && !grant.perConsumedStack) add = Math.min(add, grant.maxPerCast);
        const cap = owner.ability.maxStacks ?? 999;
        if (add > 0) {
          const key = abilityStackKey(owner.name);
          const source = permanentAbilityStackSource(owner.name);
          if (player && onPlayerPatch) {
            const before = readStack(player.stacks, key);
            const after = Math.min(cap, before + add);
            if (after !== before) {
              const prevStacks = { ...(player.stacks ?? {}) };
              const nextStacks = { ...prevStacks, [key]: after };
              await onPlayerPatch(player.name, { stacks: nextStacks });
              undos.unshift(async () => { await onPlayerPatch(player.name, { stacks: prevStacks }); });
              changed = true;
              chips.push({ kind: 'buff', text: `${owner.name} ${after}`, title: 'Cargas permanentes (ficha)' });
              log.push(`${owner.seal} «${owner.name}»: cargas permanentes ${before} → ${after}${cap < 999 ? `/${cap}` : ''}${champIds.length ? ` · +${Math.min(champIds.length, add)} por campeón` : ''}${minionKills.length ? ` · +${minionKills.length} por derribo` : ''}`);
            }
          } else if (onBonusesSave) {
            const before = readPermanentAbilityStacks({ name: owner.name, bonuses });
            const after = Math.min(cap, before + add);
            if (after !== before) {
              const marker = bonuses.find(bonus => bonus.source === source);
              bonuses = [...bonuses.filter(bonus => bonus.source !== source), { id: marker?.id ?? newBonusId(), stat: 'stacks', amount: after, ...(cap < 999 ? { maxStacks: cap } : {}), source, label: owner.name.slice(0, 80) }];
              changed = true;
              chips.push({ kind: 'buff', text: `${owner.name} ${after}`, title: 'Cargas permanentes (este combate)' });
              log.push(`${owner.seal} «${owner.name}»: cargas permanentes ${before} → ${after}${cap < 999 ? `/${cap}` : ''} (solo este combate)${champIds.length ? ` · +${Math.min(champIds.length, add)} por campeón` : ''}${minionKills.length ? ` · +${minionKills.length} por derribo` : ''}`);
            }
          }
        }
      }
    }
    if (kills.length) {
      for (const owner of rows) {
        if (owner.rank < 1) continue;
        const perm = owner.ability.mechanics?.permanentStacks;
        if (perm?.onTakedown) {
          let add = 0;
          for (const id of new Set(kills)) {
            const kind = participants.find(entry => entry.id === id)?.kind;
            if (kind === 'champion' || kind === 'player') add += perm.takedownChampion ?? 1;
            else add += perm.takedownOther ?? 0;
          }
          const cap = owner.ability.maxStacks ?? 999;
          if (add > 0 && player && onPlayerPatch) {
            const key = abilityStackKey(owner.name);
            const before = readStack(player.stacks, key);
            const after = Math.min(cap, before + add);
            if (after !== before) {
              const prevStacks = { ...(player.stacks ?? {}) };
              const nextStacks = { ...prevStacks, [key]: after };
              await onPlayerPatch(player.name, { stacks: nextStacks });
              undos.unshift(async () => { await onPlayerPatch(player.name, { stacks: prevStacks }); });
              changed = true;
              chips.push({ kind: 'buff', text: `${owner.name} ${after}`, title: 'Cargas permanentes (ficha)' });
              log.push(`${owner.seal} «${owner.name}»: derribo → cargas permanentes ${before} → ${after} (+${add})`);
            }
          } else if (add > 0 && onBonusesSave) {
            const source = permanentAbilityStackSource(owner.name);
            const before = readPermanentAbilityStacks({ name: owner.name, bonuses });
            const after = Math.min(cap, before + add);
            if (after !== before) {
              const marker = bonuses.find(bonus => bonus.source === source);
              bonuses = [...bonuses.filter(bonus => bonus.source !== source), { id: marker?.id ?? newBonusId(), stat: 'stacks', amount: after, ...(cap < 999 ? { maxStacks: cap } : {}), source, label: owner.name.slice(0, 80) }];
              changed = true;
              chips.push({ kind: 'buff', text: `${owner.name} ${after}`, title: 'Cargas permanentes (este combate)' });
              log.push(`${owner.seal} «${owner.name}»: derribo → cargas permanentes ${before} → ${after} (+${add}, solo este combate)`);
            }
          }
        }
        if (owner.ability.mechanics?.stacks?.onChampionTakedown) {
          const champKills = championKillIds(kills).length;
          for (let i = 0; i < champKills; i++) {
            const gained = gainAbilityStack(bonuses, owner.ability, owner.name, newBonusId);
            if (!gained) break;
            bonuses = gained.bonuses;
            changed = true;
            log.push(`${owner.seal} «${owner.name}»: coral/carga ${gained.before} → ${gained.after}/${gained.max} (${gained.turns} t.)`);
            chips.push({ kind: 'buff', text: `${owner.name} ${gained.after}/${gained.max}`, title: `${gained.turns} t.` });
            if (gained.after >= gained.max) bonuses = await applyStackThresholds(owner, bonuses, log, chips);
          }
        }
        if (owner.ability.mechanics?.stacks?.onNonChampionKill && owner.rank >= 1) {
          const minionKills = [...new Set(kills)].filter(id => {
            const kind = participants.find(entry => entry.id === id)?.kind;
            return kind !== 'champion' && kind !== 'player';
          }).length;
          for (let i = 0; i < minionKills; i++) {
            const gained = gainAbilityStack(bonuses, owner.ability, owner.name, newBonusId);
            if (!gained) break;
            bonuses = gained.bonuses;
            changed = true;
            log.push(`${owner.seal} «${owner.name}»: no campeón derribado → carga ${gained.before} → ${gained.after}/${gained.max} (${gained.turns} t.)`);
            chips.push({ kind: 'buff', text: `${owner.name} ${gained.after}/${gained.max}`, title: `${gained.turns} t.` });
            if (gained.after >= gained.max) bonuses = await applyStackThresholds(owner, bonuses, log, chips);
          }
        }
      }
    }
    if (kills.length) await applyTakedownHeals(kills, log, chips);
    if (base) {
      const effects = [...activeNamedEffects(items, effectData), ...(base.abilityEffects ?? [])];
      const callbacks: EffectCallbacks = {
        onTargetDamage,
        onTargetBonuses,
        onApplySourcedEffect: (ids, input) => onApplySourcedEffect(ids, input),
        onSelfPool: onPoolChange,
        pickArea: (primary, name) => askTargets(`${name}: objetivo + cercanos`, primary),
        onPermanentStack: permanentStackSaver(participant, onPlayerPatch),
        onGrantAction: async (kind, amount) => {
          const nextLeft = (left[kind] ?? 0) + amount;
          const nextExtra = extras[kind] + amount;
          if (onActionsSave) await onActionsSave(kind, nextLeft, nextExtra);
          else await combatPatchRef.current({ actionsLeft: { ...participant.actionsLeft, attacks: left.attacks, abilities: left.abilities, [kind]: nextLeft } });
        },
      };
      const fire = async (name: EffectTriggerName, ids: string[], basicAttack = true) => {
        const result = await fireEffectRules({ trigger: name, effects, ctx: base.ctx, bonuses, targetIds: ids, participants, level, callbacks, bearer: { id: participant.id, name: participant.name }, basicAttack, ...(name === 'on-ability-hit' && damaged !== undefined ? { damaged } : {}) });
        bonuses = result.bonuses;
        changed = changed || result.changed;
        notes.push(...result.notes, ...result.manual.map(text => `a mano: ${text}`));
        chips.push(...result.chips);
        log.push(...result.log);
        undos.push(...result.undos);
        return result;
      };
      if (opts?.ultimate) await fire('on-ultimate-use', targetIds, false);
      if (trigger === 'on-ability') {
        const armed = armAfterAbility(effects, bonuses, base.ctx);
        if (armed.names.length) {
          bonuses = armed.bonuses;
          changed = true;
          notes.push(`${armed.names.join(', ')} armada (siguiente AA)`);
          chips.push({ kind: 'buff', text: `${armed.names.join(', ')} armada`, title: 'El siguiente AA va potenciado' });
          log.push(`${armed.names.join(', ')}: armada por la habilidad (se gasta en el siguiente AA)`);
        }
      }
      const allKills = [...kills];
      let ruleVigor = 0;
      if (targetIds.length > 0) {
        // AA: «Al auto-atacar» + «Al aplicar efecto de impacto». Habilidad: «Al acertar una habilidad».
        const hit = await fire(trigger === 'on-hit' ? 'on-hit' : 'on-ability-hit', targetIds);
        allKills.push(...hit.kills);
        ruleVigor = hit.vigor;
        // Habilidad con «Aplica efectos de impacto»: también las reglas de impacto (no las de solo AA ni el Vigor del AA).
        if (trigger === 'on-ability' && abilityOnHit) {
          const onHit = await fire('on-hit', targetIds, false);
          allKills.push(...onHit.kills);
        }
      }
      // Vigor (solo con un ítem de Vigor): cada AA da 7 (+ «Vigor extra» de las reglas, p. ej. Statikk +9).
      // Con 100 cargas, el AA gasta el Vigor: salta «Vigor al máximo» y vuelve a 0.
      // Con «Las habilidades también descargan Vigor» (Espada ciclovoltaica), una habilidad que golpea con
      // el Vigor a 100 lo descarga en su primer objetivo (una sola vez por uso); no suma Vigor.
      const abilityDischarge = trigger === 'on-ability' && targetIds.length > 0 && hasVigorItem(items)
        && (participant.vigor ?? 0) >= VIGOR_MAX && abilityDischargesVigor(items, effectData);
      if (abilityDischarge) {
        const before = Math.max(0, Math.min(VIGOR_MAX, participant.vigor ?? 0));
        const chain = vigorChainTargets(items, effectData);
        const chainIds = chain > 1 ? await askChainTargets(chain, targetIds[0]) : [targetIds[0]];
        log.push(`⚡ Vigor al máximo (${before}/${VIGOR_MAX}) descargado por la habilidad en ${chainIds.map(id => participants.find(p => p.id === id)?.name ?? id).join(', ')}`);
        const charged = await fire('energized-max', chainIds.length ? chainIds : [targetIds[0]]);
        allKills.push(...charged.kills);
        notes.splice(notes.length - charged.notes.length - charged.manual.length, 0, '⚡ Vigor al máximo (habilidad)');
        if (!charged.notes.length && !charged.manual.length) {
          notes.push('sin reglas «Vigor al máximo» configuradas: no aplica nada');
          log.push('sin reglas «Vigor al máximo» configuradas: no aplica nada');
        }
        await combatPatchRef.current({ vigor: undefined });
        undos.push(async () => { await combatPatchRef.current({ vigor: before }); });
        notes.push(`Vigor ${before}→0/${VIGOR_MAX}`);
        chips.push({ kind: 'vigor', text: `Vigor ${before}→0`, title: 'Vigor al máximo descargado por la habilidad' });
        log.push(`Vigor de ${participant.name}: ${before} → 0/${VIGOR_MAX}`);
      }
      if (trigger === 'on-hit' && targetIds.length > 0 && hasVigorItem(items)) {
        const before = Math.max(0, Math.min(VIGOR_MAX, participant.vigor ?? 0));
        let after: number;
        if (before >= VIGOR_MAX) {
          const chain = vigorChainTargets(items, effectData);
          const chainIds = chain > 1 ? await askChainTargets(chain, targetIds[0]) : targetIds;
          log.push(`⚡ Vigor al máximo (${before}/${VIGOR_MAX}): el AA lo descarga en ${(chainIds.length ? chainIds : targetIds).map(id => participants.find(p => p.id === id)?.name ?? id).join(', ')}`);
          const charged = await fire('energized-max', chainIds.length ? chainIds : targetIds);
          allKills.push(...charged.kills);
          notes.splice(notes.length - charged.notes.length - charged.manual.length, 0, '⚡ Vigor al máximo');
          if (!charged.notes.length && !charged.manual.length) {
            notes.push('sin reglas «Vigor al máximo» configuradas: no aplica nada');
            log.push('sin reglas «Vigor al máximo» configuradas: no aplica nada');
          }
          after = 0;
        } else {
          after = Math.min(VIGOR_MAX, before + VIGOR_PER_AA + ruleVigor);
        }
        if (after !== before) {
          await combatPatchRef.current({ vigor: after || undefined });
          undos.push(async () => { await combatPatchRef.current({ vigor: before || undefined }); });
          notes.push(`Vigor ${before}→${after}/${VIGOR_MAX}`);
          chips.push({ kind: 'vigor', text: `Vigor ${before}→${after}`, title: `Vigor ${after}/${VIGOR_MAX}` });
          log.push(after === 0
            ? `Vigor de ${participant.name}: ${before} → 0/${VIGOR_MAX} (descargado)`
            : `Vigor de ${participant.name}: ${before} + ${VIGOR_PER_AA} (AA)${ruleVigor ? ` + ${ruleVigor} (reglas «Vigor extra»)` : ''} = ${before + VIGOR_PER_AA + ruleVigor}${before + VIGOR_PER_AA + ruleVigor > VIGOR_MAX ? ` → tope ${VIGOR_MAX}` : ''}`);
        }
      }
      for (const _kill of new Set(allKills)) await fire('on-takedown', []);
    }
    if (changed && onBonusesSave) {
      await onBonusesSave(bonuses);
      undos.unshift(() => onBonusesSave(prev));
    }
    const passive = await firePassives({ bonuses, items, trigger, targetIds, onBonusesSave, onTargetDamage });
    if (passive.undo) undos.push(passive.undo);
    const passiveVamp = passive.dealt ? await vampFor(passive.dealt, false, 'Pasiva de ítem') : null;
    if (passiveVamp?.undo) undos.push(passiveVamp.undo);
    if (passiveVamp) { chips.push(...passiveVamp.chips); log.push(...passiveVamp.log); }
    const note = `${notes.length ? ` · ${notes.join(' · ')}` : ''}${passive.note}`;
    return {
      note,
      chips: [...chips, ...(passive.chips ?? [])],
      log: [...log, ...(passive.log ?? [])],
      undo: undos.length ? async () => { for (const undo of [...undos].reverse()) await undo(); } : undefined,
    };
  };
  /** Suma la nota de las pasivas y encadena su Deshacer antes que el resto. */
  /** Omnivampirismo (+ robo de vida si lifeSteal) del portador sobre un daño hecho. */
  const vampFor = async (dealt: number, lifeSteal: boolean, origin: string, efficacy?: number) => {
    const context = participantContext(participant, level, extra);
    if (!context || !(dealt > 0)) return null;
    return vampHeal({ dealt, ctx: context.ctx, lifeSteal, ...(lifeSteal && efficacy != null ? { lifeStealEfficacy: efficacy } : {}), onSelfPool: onPoolChange, origin, bearerName: participant.name });
  };

  /** Solo las mecánicas de la habilidad (sin reglas de ítems ni «tras habilidad»): habilidades que no gastan acción. */
  const seedOnly = async (seed?: MechanicsSeed): Promise<PassiveResult> => {
    const prev = participant.bonuses ?? [];
    const undos = [...(seed?.undos ?? [])];
    if (seed && seed.bonuses !== prev && onBonusesSave) {
      await onBonusesSave(seed.bonuses);
      undos.unshift(() => onBonusesSave(prev));
    }
    return { note: '', chips: seed?.chips ?? [], log: seed?.log ?? [], undo: undos.length ? async () => { for (const undo of [...undos].reverse()) await undo(); } : undefined };
  };

  const withPassives = (use: LastUse, passive: PassiveResult): LastUse => {
    if (!passive.note && !passive.undo && !passive.chips?.length && !passive.log?.length) return use;
    const previous = use.undo;
    const undoPassive = passive.undo;
    const structured = passive.chips !== undefined;
    return {
      ...use,
      headline: structured ? use.headline : `${use.headline}${passive.note}`,
      chips: [...(use.chips ?? []), ...(passive.chips ?? [])],
      log: [...(use.log ?? []), ...(passive.log ?? [])],
      undo: undoPassive
        ? () => {
            setBusy(true);
            void undoPassive()
              .then(() => (previous ? previous() : setLastUse(null)))
              .catch(caught => setError(caught instanceof Error ? caught.message : 'No se pudo deshacer la pasiva'))
              .finally(() => setBusy(false));
          }
        : previous,
    };
  };

  const withTargetDamage = (use: LastUse, damage: Awaited<ReturnType<TargetDamageFn>>): LastUse => {
    if (!damage) return use;
    const previous = use.undo;
    return {
      ...use,
      headline: `${use.headline}${targetHpLine(damage)}`,
      undo: () => {
        setBusy(true);
        void damage.undo()
          .then(() => previous ? previous() : setLastUse(null))
          .catch(caught => setError(caught instanceof Error ? caught.message : 'No se pudo deshacer el daño'))
          .finally(() => setBusy(false));
      },
    };
  };

  /** Deshacer (y su línea en la consola). */
  const undoLastUse = () => {
    if (!lastUse?.undo) return;
    logCombat({ title: `↶ Deshecho: ${lastUse.headline}`, lines: [], actor: participant.name });
    lastUse.undo();
  };

  /** Consola: vida antes → después de cada objetivo y por qué no hay mitigación (CA / RM, penetraciones del atacante). */
  const statNum = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const defenseLines = (targetIds: string[], stats: Record<string, unknown>, kind: 'physical' | 'magic'): string[] => targetIds.map((id): string[] => {
    const target = participants.find(p => p.id === id);
    if (!target) return [];
    // Sus stats con los bonus del combate (debuffs como Carve incluidos): las reducciones van antes que la penetración.
    const ctx = participantContext(target, level);
    const resist = statNum(kind === 'physical' ? ctx?.ctx.stats.ac : ctx?.ctx.stats.mr);
    return [effectiveResistLine(kind, target.name, resist, stats), ...hitRollLines(kind, target.name, resist, stats)];
  }).flat().filter(Boolean);
  const hpLine = (damage: { name: string; before: number; after: number; absorbed: number } | null): string[] =>
    damage && damage.name && !damage.name.includes(', ')
      ? [`Vida de ${damage.name}: ${fmt(damage.before)} → ${fmt(damage.after)}${damage.absorbed ? ` (${fmt(damage.absorbed)} absorbido por escudo / vida temporal)` : ''}${damage.before > 0 && damage.after <= 0 ? ' · ¡derrotado!' : ''}`]
      : [];

  // ---------- Mecánicas de habilidad (cargas, cargas por impacto, buff, estado de la pasiva) ----------
  const passiveRow = (): AbilityRow | undefined => rows.find(entry => entry.seal === 'P');
  const nameOf = (id: string): string => participants.find(entry => entry.id === id)?.name ?? id;

  /** Cargas de un contador: permanentes (ficha o marcador de combate) si esa habilidad las tiene; si no, cargas de combate. */
  const stacksFor = (name: string): number => {
    const owner = rows.find(entry => sameAbilityName(entry.name, name));
    if (owner?.ability.hasStacks || owner?.ability.mechanics?.permanentStacks) {
      return readPermanentAbilityStacks({ name, playerStacks: player?.stacks, bonuses: participant.bonuses });
    }
    return abilityStacks(participant.bonuses, name).count;
  };

  /** Apaga un interruptor: quita buff, estado propio y el marcador, sin coste. */
  const endAbilityToggle = async (row: AbilityRow) => {
    const prev = participant.bonuses ?? [];
    const selfStat = abilitySelfStatSource(row.name);
    const sources = new Set([abilityToggleSource(row.name), abilityBuffSource(row.name), abilityBuffStatSource(row.name), selfStat, abilityRecastSource(row.name), abilityFixedAttacksSource(row.name), abilitySelfDrSource(row.name)]);
    const next = prev.filter(bonus => {
      const source = bonus.source ?? '';
      return !sources.has(source) && !source.startsWith(`${selfStat}:`);
    });
    const undos: (() => Promise<void>)[] = [];
    if (onBonusesSave && next.length !== prev.length) {
      await onBonusesSave(next);
      undos.push(async () => { await onBonusesSave(prev); });
    }
    const nextActions = actionsAfterFixedAttacks(next);
    if (nextActions) {
      await combatPatchRef.current({ actionsLeft: nextActions });
      undos.push(async () => { await combatPatchRef.current({ actionsLeft: prevActions }); });
    }
    const source = `ability:${row.name}`;
    const current = participant.effects.find(effect => effect.source === source) ?? null;
    if (current) {
      await onApplySourcedEffect([participant.id], { source, name: current.name, duration: 1, restore: { [participant.id]: null } });
      undos.push(async () => { await onApplySourcedEffect([participant.id], { source, name: current.name, duration: current.duration, restore: { [participant.id]: current } }); });
    }
    const lines = [`${row.seal} «${row.name}»: se desactiva`];
    setLastUse({
      headline: `${row.seal} «${row.name}» desactivado`,
      log: lines,
      undo: undos.length ? () => { void (async () => { for (const undo of undos.reverse()) await undo(); setLastUse(null); })(); } : undefined,
    });
    logCombat({ title: `${row.seal} «${row.name}» desactivado`, lines, actor: participant.name });
  };

  /** Execute: daño igual a lo que le queda (vida + temporal + escudo). Luego, opcionalmente, miedo a cercanos. */
  const applyExecute = async (row: AbilityRow, config: AbilityExecute, targetIds: string[], log: string[]): Promise<{ kills: string[]; chips: ResultChip[]; headline?: string }> => {
    const chips: ResultChip[] = [];
    const kills: string[] = [];
    const executed: string[] = [];
    for (const id of targetIds) {
      const who = participants.find(entry => entry.id === id);
      if (!who) continue;
      const hp = participantHp(who);
      if (!hp || !isBelowExecuteThreshold(hp, config.hpPct)) {
        log.push(`${who.name}: no está a ≤ ${config.hpPct}% de su vida máx. → no hay execute`);
        continue;
      }
      const pools = participantHpPools(who);
      const amount = Math.max(1, (pools?.current ?? hp.current) + (pools?.tempHp ?? 0) + (pools?.shield ?? 0));
      const more = await applyToTargets(row, row.ability, amount, [id], [], log, { skipEffects: true, lifeSteal: false });
      log.push(`Execute (≤ ${config.hpPct}%): ${amount} a ${who.name}`);
      chips.push({ kind: 'buff', text: `Execute ${who.name}`, title: `≤ ${config.hpPct}% vida máx.` });
      executed.push(who.name);
      kills.push(...more, id);
    }
    if (config.fear && executed.length) {
      const candidates = participants.filter(entry => entry.id !== participant.id && !kills.includes(entry.id));
      const ids = candidates.length ? await askTargets(`${row.seal} «${row.name}»: ${config.fear.name} a (cercanos)`, '', undefined, candidates, 'Aplicar') : [];
      if (ids.length) {
        await onApplySourcedEffect(ids, { source: `ability:${row.name}:fear`, name: config.fear.name, duration: config.fear.turns, ...(config.fear.value ? { value: config.fear.value } : {}) });
        const names = ids.map(id => participants.find(entry => entry.id === id)?.name ?? id).join(', ');
        log.push(`Al ejecutar: «${config.fear.name}»${config.fear.value ? ` ${config.fear.value}` : ''} ${config.fear.turns} t. → ${names}`);
        chips.push({ kind: 'debuff', text: `${config.fear.name} ${config.fear.turns}t`, title: names });
      } else log.push(`Al ejecutar: «${config.fear.name}» a cercanos → nadie elegido (a mano)`);
    }
    return { kills: [...new Set(kills)], chips, headline: executed.length ? `${row.seal} «${row.name}» Execute → ${executed.join(', ')}` : undefined };
  };

  /** Aplica el estado de la pasiva (su primer efecto) a los objetivos, con Deshacer. */
  /** Nombre de la pasiva si sus críticos no hacen daño extra (Ashe). */
  const critNoDamageOwner = (): string | undefined => {
    for (const owner of rows) {
      if (owner.rank < 1 || !owner.ability.mechanics?.critNoDamage) continue;
      if (owner.seal === 'P') return owner.name;
      if (abilityBuff(participant.bonuses, owner.name) || abilityToggle(participant.bonuses, owner.name)) return owner.name;
    }
    return undefined;
  };

  const passiveStatusSeed = async (ids: string[], why: string, base?: MechanicsSeed, critical = false): Promise<MechanicsSeed> => {
    const seed: MechanicsSeed = base ?? { bonuses: participant.bonuses ?? [], log: [], chips: [], undos: [] };
    const owner = passiveRow();
    const base0 = passiveStatus(owner?.ability, owner?.rank ?? 1);
    const doubled = !!base0 && critical && owner?.ability.mechanics?.critDoublesPassive === true;
    const status = base0 && doubled && base0.value ? { ...base0, value: Math.min(99, base0.value * 2) } : base0;
    if (!owner || !status) {
      seed.log.push(`${why}: aplica el estado de la pasiva, pero la pasiva no tiene ningún efecto configurado → a mano`);
      seed.chips.push({ kind: 'manual', text: 'Estado de la pasiva: a mano', title: 'La pasiva no tiene efecto configurado' });
      return seed;
    }
    const snapshot: Record<string, CombatEffect | null> = Object.fromEntries(ids.map(id => [
      id,
      participants.find(entry => entry.id === id)?.effects.find(effect => effect.source === status.source) ?? null,
    ]));
    await onApplySourcedEffect(ids, { source: status.source, name: status.name, duration: status.duration, ...(status.value ? { value: status.value } : {}) });
    const names = ids.map(nameOf).join(', ');
    const what = `${status.name}${status.value ? ` ${status.value}%` : ''}`;
    if (doubled) seed.log.push(base0?.value ? `CRÍTICO: P «${owner.name}» duplica el estado → ${status.name} ${base0.value}% × 2 = ${base0.value * 2}%${base0.value * 2 > 99 ? ' → 99% (máx.)' : ''}` : `CRÍTICO: P «${owner.name}» duplica el estado, pero no tiene valor → a mano`);
    seed.log.push(`${why}: «${what}» ${status.duration} t. (estado de la pasiva «${owner.name}»${doubled ? ', doble por crítico' : ''}) → ${names}`);
    seed.chips.push({ kind: 'debuff', text: `${what} ${status.duration}t${doubled ? ' (×2 crít.)' : ''}`, title: `${owner.name} → ${names}` });
    seed.undos.push(async () => {
      await onApplySourcedEffect(ids, { source: status.source, name: status.name, duration: 1, restore: snapshot });
    });
    return seed;
  };

  /** Al usar una habilidad: gasta su carga de uso / las cargas por impacto, pone su buff y aplica el estado de la pasiva. */
  const abilityMechanicsSeed = async (row: AbilityRow, targetIds: string[], critical = false, phased?: Ability, flags?: { selfInArea?: boolean }): Promise<MechanicsSeed | undefined> => {
    const mechanics = (phased ?? row.ability).mechanics;
    const need = stacksRequirement((phased ?? row.ability).mechanics, row.name);
    if (!mechanics && !need) return { bonuses: participant.bonuses ?? [], log: [], chips: [], undos: [], usedName: row.name };
    const seed: MechanicsSeed = { bonuses: participant.bonuses ?? [], log: [], chips: [], undos: [], usedName: row.name };
    if (need) seed.usedRequires = { name: need.name };
    const label = `${row.seal} «${row.name}»`;
    if (mechanics?.charges) {
      const spent = spendAbilityCharge(seed.bonuses, row.ability, row.name, row.rank, newBonusId);
      if (spent) {
        seed.bonuses = spent.bonuses;
        const every = rankValue(mechanics.charges.recharge, row.rank);
        seed.log.push(`${label}: gasta 1 carga ${spent.before} → ${spent.after}/${spent.max}${spent.recharge ? ` · siguiente recarga en ${spent.recharge} t. (1 cada ${every ?? '—'} t. en rango ${row.rank})` : ''} (sin CD: usa cargas)`);
        seed.chips.push({ kind: 'cd', text: `${row.name} ${spent.after}/${spent.max}`, title: spent.recharge ? `Recarga en ${spent.recharge} t.` : 'Cargas de la habilidad' });
      }
    }
    if (need?.consume) {
      const owner = rows.find(entry => sameAbilityName(entry.name, need.name));
      const permanent = !!(owner?.ability.hasStacks || owner?.ability.mechanics?.permanentStacks);
      if (permanent) {
        const key = abilityStackKey(need.name);
        const source = permanentAbilityStackSource(need.name);
        const before = stacksFor(need.name);
        const after = 0; // gasta todas las actuales, como las de combate
        if (player && onPlayerPatch) {
          const prevStacks = { ...(player.stacks ?? {}) };
          const nextStacks = { ...prevStacks };
          if (after) nextStacks[key] = after; else delete nextStacks[key];
          seed.undos.push(async () => { await onPlayerPatch(player.name, { stacks: prevStacks }); });
          await onPlayerPatch(player.name, { stacks: nextStacks });
        } else {
          seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== source);
        }
        seed.log.push(`${label}: gasta ${before} cargas permanentes de «${need.name}» (hacían falta ${need.count})`);
        seed.consumedStacks = { from: need.name, count: before };
      } else {
        const current = abilityStacks(seed.bonuses, need.name);
        seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== abilityStacksSource(need.name));
        seed.log.push(`${label}: gasta ${current.count} cargas de «${need.name}» (hacían falta ${need.count})`);
        seed.consumedStacks = { from: need.name, count: current.count };
      }
    }
    if (!mechanics) return seed;
    if (mechanics.cleanse) {
      const crowd = participant.effects.filter(effect => effect.duration > 0 && isCrowdControlEffectName(effect.name));
      for (const effect of crowd) {
        const source = effect.source ?? `ability:${row.name}`;
        const snapshot: Record<string, CombatEffect | null> = { [participant.id]: effect };
        await onApplySourcedEffect([participant.id], { source, name: effect.name, duration: 1, restore: { [participant.id]: null } });
        seed.undos.push(async () => { await onApplySourcedEffect([participant.id], { source, name: effect.name, duration: effect.duration, restore: snapshot }); });
        seed.log.push(`${label}: limpia «${effect.name}»`);
        seed.chips.push({ kind: 'buff', text: `Limpia ${effect.name}`, title: `${label}: limpia control de masas` });
      }
      if (!crowd.length) seed.log.push(`${label}: no había control de masas que limpiar`);
    }
    if (mechanics.sectorShots && (sectorShotTrigger(mechanics.sectorShots) === 'cast' || sectorShotTrigger(mechanics.sectorShots) === 'both')) {
      const cdRank = mechanics.sectorShots.byLevel ? milestoneRank(level) : row.rank;
      const cooldown = rankValue(mechanics.sectorShots.cooldown, cdRank) ?? 0;
      const spent = spendSectorShot(seed.bonuses, row.name, mechanics.sectorShots.count, cooldown, newBonusId, undefined, mechanics.sectorShots.labels);
      if (spent) {
        seed.bonuses = spent.bonuses;
        const tag = mechanics.sectorShots.labels?.[spent.index] ?? String(spent.index + 1);
        seed.log.push(`${label}: gasta dirección ${tag} · CD ${cooldown} t. · quedan ${spent.readyAfter} listas`);
        seed.chips.push({ kind: 'cd', text: `${row.name} ${tag} CD ${cooldown}t`, title: `Quedan ${spent.readyAfter}/${mechanics.sectorShots.count}` });
        const gap = rankValue(mechanics.sectorShots.gap, row.rank);
        if (gap && gap > 0) {
          const gapSource = sectorGapSource(row.name);
          seed.bonuses = [...seed.bonuses.filter(bonus => bonus.source !== gapSource), { id: newBonusId(), stat: 'buff', amount: 1, turns: gap, source: gapSource, label: `${row.name} intervalo`.slice(0, 80) }];
          seed.log.push(`${label}: ${gap} t. hasta el siguiente dash`);
        }
      }
    }
    const toggleTurns = mechanics.toggle ? (rankValue(mechanics.toggle.turns, row.rank) ?? 0) : undefined;
    if (mechanics.toggle) {
      const source = abilityToggleSource(row.name);
      seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== source);
      seed.bonuses = [...seed.bonuses, { id: newBonusId(), stat: 'buff', amount: 1, ...(toggleTurns ? { turns: toggleTurns } : {}), source, label: row.name.slice(0, 80) }];
      seed.log.push(`${label}: interruptor ON${toggleTurns ? ` ${toggleTurns} t.` : ' (hasta desactivar)'}`);
      seed.chips.push({ kind: 'buff', text: toggleTurns ? `ON ${toggleTurns}t` : 'ON', title: `${label}: se puede desactivar` });
    }
    if (mechanics.buff) {
      const turns = toggleTurns === 0 ? undefined : (toggleTurns ?? mechanics.buff.turns);
      const speed = rankValue(mechanics.buff.attackSpeed, row.rank);
      const aaPct = rankValue(mechanics.buff.aaAd, row.rank);
      const name = row.name.slice(0, 80);
      seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== abilityBuffSource(row.name) && bonus.source !== abilityBuffStatSource(row.name));
      seed.bonuses = [
        ...seed.bonuses,
        { id: newBonusId(), stat: 'buff', amount: Math.max(1, row.rank), ...(turns ? { turns } : {}), source: abilityBuffSource(row.name), label: name },
        ...(speed ? [{ id: newBonusId(), stat: 'atkSpePct', amount: speed, ...(turns ? { turns } : {}), source: abilityBuffStatSource(row.name), label: name }] : []),
      ];
      const parts = [
        speed ? `+${fmt(speed)}% vel. ataque` : '',
        aaPct ? `AA al ${fmt(aaPct)}% AD` : '',
        mechanics.buff.aaAppliesPassive ? 'los AA aplican el estado de la pasiva' : '',
      ].filter(Boolean);
      seed.log.push(`${label}: activa ${turns} t. (rango ${row.rank}): ${parts.join(' · ') || 'sin valores'}`);
      seed.chips.push({ kind: 'buff', text: `${row.name} ${turns}t`, title: parts.join(' · ') });
    }
    if (mechanics.appliesPassive && targetIds.length > 0) await passiveStatusSeed(targetIds, label, seed, critical);
    if (mechanics.recast) {
      const source = abilityRecastSource(row.name);
      const marker = abilityRecast(seed.bonuses, row.name);
      if (marker) {
        const leftAfter = marker.amount - 1;
        seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== source);
        if (leftAfter > 0) seed.bonuses = [...seed.bonuses, { ...marker, amount: leftAfter }];
        seed.log.push(`${label}: recast usado${leftAfter > 0 ? ` (quedan ${leftAfter})` : ' (ya no quedan)'}`);
      } else {
        const recastTurns = mechanics.recast.turns;
        seed.bonuses = [...seed.bonuses, { id: newBonusId(), stat: 'buff', amount: mechanics.recast.times, ...(recastTurns ? { turns: recastTurns } : {}), source, label: row.name.slice(0, 80) }];
        seed.log.push(`${label}: se puede volver a lanzar gratis ×${mechanics.recast.times}${recastTurns ? ` durante ${recastTurns} t.` : ' hasta usarlo'} (botón «Recast»)`);
        seed.chips.push({ kind: 'buff', text: recastTurns ? `Recast ${recastTurns}t` : 'Recast', title: `${label}: recast gratis` });
      }
    }
    if (mechanics.castPool) await castPoolSeed(row, targetIds, seed, mechanics.castPool, flags?.selfInArea !== false);
    if (mechanics.selfStatus) {
      const championHit = targetIds.some(id => {
        const kind = participants.find(entry => entry.id === id)?.kind;
        return id !== participant.id && (kind === 'champion' || kind === 'player');
      });
      if (mechanics.selfStatus.requiresChampionHit && !championHit) {
        seed.log.push(`${label}: «${mechanics.selfStatus.name}» no se aplica (no alcanzó a ningún campeón)`);
      } else {
      const status = { ...mechanics.selfStatus };
      if (status.pctValues?.length) {
        const resolved = rankValue(status.pctValues, row.rank);
        if (resolved != null) status.pct = resolved;
      }
      if (status.amountValues?.length) {
        const resolved = rankValue(status.amountValues, row.rank);
        if (resolved != null) status.amount = resolved;
      }
      const durationStacks = status.durationByStacks ? readPermanentAbilityStacks({ name: status.durationByStacks.from, playerStacks: player?.stacks, bonuses: seed.bonuses }) : 0;
      const resolvedTurns = resolveSelfStatusTurns(status, durationStacks);
      const statusTurns = toggleTurns === 0 || resolvedTurns === 0 ? (toggleTurns === 0 || resolvedTurns === 0 ? 0 : resolvedTurns) : (toggleTurns ?? resolvedTurns);
      const untilEnd = statusTurns === 0;
      const source = `ability:${row.name}`;
      const snapshot: Record<string, CombatEffect | null> = { [participant.id]: participant.effects.find(effect => effect.source === source) ?? null };
      await onApplySourcedEffect([participant.id], { source, name: status.name, duration: untilEnd ? 99 : statusTurns, ...(status.value ? { value: status.value } : {}) });
      seed.undos.push(async () => { await onApplySourcedEffect([participant.id], { source, name: status.name, duration: 1, restore: snapshot }); });
      seed.chips.push({ kind: 'buff', text: `${status.name} ${untilEnd ? 'hasta la muerte / desactivar' : `${statusTurns}t`}`, title: `${label} → ${participant.name}` });
      seed.log.push(`${label}: «${status.name}»${status.value ? ` ${status.value}` : ''} en ${participant.name}${untilEnd ? ' hasta la muerte o desactivar' : ` ${statusTurns} t.`}${status.durationByStacks ? ` (${durationStacks} cargas de «${status.durationByStacks.from}»)` : ''}`);
      const context = participantContext(participant, level, extra);
      const statEntries = [
        ...(status.stat ? [{ stat: status.stat, amount: status.amount, pct: status.pct, amountValues: status.amountValues, pctValues: status.pctValues }] : []),
        ...(status.stats ?? []),
      ];
      const selfPrefix = abilitySelfStatSource(row.name);
      seed.bonuses = seed.bonuses.filter(entry => entry.source !== selfPrefix && !(entry.source ?? '').startsWith(`${selfPrefix}:`) && entry.source !== abilitySelfDrSource(row.name));
      for (const entry of statEntries) {
        const resolved = {
          ...entry,
          amount: entry.amountValues?.length ? (rankValue(entry.amountValues, row.rank) ?? entry.amount) : entry.amount,
          pct: entry.pctValues?.length ? (rankValue(entry.pctValues, row.rank) ?? entry.pct) : entry.pct,
        };
        const current = context ? Number(context.ctx.stats[entry.stat] ?? 0) || 0 : 0;
        let raw = selfStatusStatBonus({ ...status, stat: entry.stat, amount: resolved.amount, pct: resolved.pct }, current)?.amount ?? 0;
        const parts: string[] = [];
        if (raw) parts.push(`${raw}`);
        for (const ratio of entry.ratios ?? []) {
          const pct = rankValue(ratio.values, row.rank) ?? 0;
          const statValue = context ? Number((context.ctx.stats as Record<string, unknown>)[ratio.stat] ?? (context.ctx.stats as { bonus?: Record<string, number> }).bonus?.[ratio.stat === 'bonusAd' ? 'ad' : ratio.stat] ?? 0) || 0 : 0;
          const add = (pct / 100) * statValue;
          if (add) {
            raw += add;
            parts.push(`${pct}% ${ratio.stat} = ${Math.round(add * 1000) / 1000}`);
          }
        }
        const amount = Math.round(raw);
        if (!amount) continue;
        const statSource = entry.stat === status.stat ? selfPrefix : `${selfPrefix}:${entry.stat}`.slice(0, 80);
        seed.bonuses = [...seed.bonuses, { id: newBonusId(), stat: entry.stat as CombatBonus['stat'], amount, ...(untilEnd ? {} : { turns: statusTurns }), source: statSource, label: status.name.slice(0, 80) }];
        seed.log.push(`${label}: ${entry.stat} ${amount > 0 ? '+' : ''}${amount} (${parts.join(' + ') || amount})${untilEnd ? ' hasta desactivar' : ` ${statusTurns} t.`}`);
        seed.chips.push({ kind: 'buff', text: `${entry.stat} ${amount > 0 ? '+' : ''}${amount}`, title: `${parts.join(' + ')}${untilEnd ? ' · hasta desactivar' : ` · ${statusTurns} t.`}` });
      }
      const reduction = status.damageReductionValues?.length ? (rankValue(status.damageReductionValues, row.rank) ?? 0) : 0;
      if (reduction) {
        seed.bonuses = [...seed.bonuses, { id: newBonusId(), stat: 'buff', amount: reduction, ...(untilEnd ? {} : { turns: statusTurns }), source: abilitySelfDrSource(row.name), label: `${status.name} reducción`.slice(0, 80) }];
        seed.log.push(`${label}: reducción de daño ${reduction}%${untilEnd ? ' hasta desactivar' : ` ${statusTurns} t.`}`);
        seed.chips.push({ kind: 'buff', text: `−${reduction}% daño`, title: `${status.name}: reducción de daño ${reduction}%` });
      }
      }
    }
    const fixedAttacks = abilityFixedAttacks(mechanics);
    if (fixedAttacks && (mechanics.toggle || mechanics.selfStatus)) {
      const source = abilityFixedAttacksSource(row.name);
      const turns = toggleTurns === 0 ? undefined : (toggleTurns ?? mechanics.selfStatus?.turns);
      seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== source);
      seed.bonuses = [...seed.bonuses, { id: newBonusId(), stat: 'fixedAttacks', amount: fixedAttacks, ...(turns ? { turns } : {}), source, label: row.name.slice(0, 80) }];
      seed.log.push(`${label}: número de ataques fijo ${fixedAttacks}${turns ? ` ${turns} t.` : ' hasta desactivar'}`);
      seed.chips.push({ kind: 'buff', text: `Ataques ${fixedAttacks}`, title: `${label}: número de ataques fijo ${fixedAttacks}` });
    }
    if (mechanics.trap) {
      const source = abilityTrapSource(row.name);
      const turns = mechanics.trap.turns;
      const trapName = (mechanics.trap.name ?? row.name).slice(0, 80);
      seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== source);
      seed.bonuses = [...seed.bonuses, { id: newBonusId(), stat: 'buff', amount: 1, turns, source, label: trapName }];
      seed.log.push(`${label}: ${trapName} se coloca ${turns} t. (${mechanics.trap.applyOnPlace ? 'primer golpe aplicado; Detonar para el segundo' : 'Detonar para explotar'}).`);
      seed.chips.push({ kind: 'buff', text: `${trapName} ${turns}t`, title: `${label}: efecto retrasado ${turns} t.` });
    }
    if (mechanics.protect) {
      const pct = rankValue(mechanics.protect.damageReductionPct, row.rank) ?? 0;
      const protTurns = mechanics.protect.turns;
      const protName = mechanics.protect.name ?? row.name;
      const protSource = abilitySelfDrSource(row.name);
      const mode = mechanics.protect.target;
      const allyIds = targetIds.filter(id => {
        const kind = participants.find(entry => entry.id === id)?.kind;
        return id !== participant.id && (kind === 'champion' || kind === 'player');
      });
      const ids = mode === 'ally' ? allyIds : mode === 'allyOrSelf' ? (allyIds.length ? allyIds : [participant.id]) : [participant.id];
      if (!ids.length) seed.log.push(`${label}: ${protName} ${pct}% reducción ${protTurns} t. (elige aliado; si no, va al portador)`);
      for (const id of ids.length ? ids : []) {
        const who = participants.find(entry => entry.id === id);
        const bonus: CombatBonus = { id: newBonusId(), stat: 'buff', amount: pct, turns: protTurns, source: protSource, label: `${protName} reducción`.slice(0, 80) };
        if (id === participant.id) {
          seed.bonuses = [...seed.bonuses.filter(entry => entry.source !== protSource), bonus];
        } else if (onTargetBonuses && who) {
          await onTargetBonuses(id, current => [...current.filter(entry => entry.source !== protSource), bonus]);
        } else if (who) {
          seed.log.push(`${label}: ${protName} ${pct}% reducción a ${who.name} ${protTurns} t. (a mano)`);
          continue;
        }
        if (who) {
          seed.log.push(`${label}: ${protName} reducción de daño ${pct}% a ${who.name} ${protTurns} t.`);
          seed.chips.push({ kind: 'buff', text: `${protName} −${pct}% daño`, title: `${who.name}: ${protTurns} t.` });
        }
      }
    }
    if (mechanics.spellShield) {
      const shield = mechanics.spellShield;
      const source = `ability:${row.name}`;
      const snapshot: Record<string, CombatEffect | null> = { [participant.id]: participant.effects.find(effect => effect.source === source) ?? null };
      await onApplySourcedEffect([participant.id], { source, name: shield.status, duration: shield.turns });
      seed.undos.push(async () => { await onApplySourcedEffect([participant.id], { source, name: shield.status, duration: 1, restore: snapshot }); });
      seed.chips.push({ kind: 'buff', text: `${shield.status} ${shield.turns}t`, title: `${label} → ${participant.name}` });
      seed.log.push(`${label}: «${shield.status}» en ${participant.name} ${shield.turns} t. (si se rompe: bonus por tenerla aprendida × ${fmt(shield.learnedMultiplier)} durante ${shield.breakTurns} t.; botón «Romper» en la habilidad)`);
    }
    if (mechanics.armArmedAa) {
      for (const entry of rows) {
        if (entry.rank < 1 || !entry.ability.mechanics?.armedAa) continue;
        seed.bonuses = armAbilityArmedAa(seed.bonuses, entry.name, newBonusId, entry.name, entry.ability.mechanics.armedAa.turns);
        seed.log.push(`${label}: arma «${entry.name}» (siguiente AA a un campeón)${entry.ability.mechanics.armedAa.turns ? ` ${entry.ability.mechanics.armedAa.turns} t.` : ''}`);
        seed.chips.push({ kind: 'buff', text: `${entry.name} armado`, title: `${label}: arma el AA` });
      }
    }
    if (mechanics.costStacks) {
      const before = abilityCostStackCount(seed.bonuses, row.name);
      seed.bonuses = gainAbilityCostStack(seed.bonuses, row.name, mechanics.costStacks, newBonusId, row.name);
      const after = abilityCostStackCount(seed.bonuses, row.name);
      seed.log.push(`${label}: acumulaciones de coste ${before} → ${after}/${mechanics.costStacks.max} (+${mechanics.costStacks.amount} al siguiente uso, ${mechanics.costStacks.turns} t.)`);
      seed.chips.push({ kind: 'buff', text: `Coste ×${after}`, title: `${label}: +${mechanics.costStacks.amount} por acumulación` });
    }
    if (mechanics.resistShred && targetIds.length) {
      const pct = rankValue(mechanics.resistShred.pct, row.rank) ?? 0;
      const turns = mechanics.resistShred.turns;
      const shredArmor = mechanics.resistShred.armor !== false;
      const shredMr = mechanics.resistShred.mr !== false;
      const source = abilityResistShredSource(row.name);
      for (const id of targetIds) {
        const who = participants.find(entry => entry.id === id);
        if (!who) continue;
        const context = participantContext(who, level, extra);
        const stats = context?.ctx.stats as Record<string, unknown> | undefined;
        const ac = shredArmor ? Math.round((Number(stats?.ac) || 0) * pct / 100) : 0;
        const mr = shredMr ? Math.round((Number(stats?.mr) || 0) * pct / 100) : 0;
        if (!stats) {
          seed.log.push(`${label}: −${pct}% CA/RM a ${who.name} ${turns} t. (a mano: sin stats)`);
          continue;
        }
        if (!onTargetBonuses) {
          seed.log.push(`${label}: −${pct}% CA/RM a ${who.name} (−${ac} CA, −${mr} RM) ${turns} t. (a mano)`);
          continue;
        }
        const apply = (stat: 'ac' | 'mr', amount: number) => amount > 0 ? { id: newBonusId(), stat, amount: -amount, turns, source: `${source}:${stat}`, label: row.name.slice(0, 80) } : null;
        const added = [apply('ac', ac), apply('mr', mr)].filter((entry): entry is NonNullable<typeof entry> => !!entry);
        if (!added.length) {
          seed.log.push(`${label}: −${pct}% CA/RM a ${who.name} redondea a 0`);
          continue;
        }
        const undo = await onTargetBonuses(id, current => [...current.filter(bonus => bonus.source !== `${source}:ac` && bonus.source !== `${source}:mr`), ...added]);
        if (undo) seed.undos.push(undo);
        seed.log.push(`${label}: −${pct}% resistencias a ${who.name} (−${ac} CA, −${mr} RM) ${turns} t.`);
        seed.chips.push({ kind: 'buff', text: `−${pct}% res.`, title: `${who.name}: −${ac} CA, −${mr} RM` });
      }
    }
    const resetShots = mechanics.resetSectorShots;
    if (resetShots) {
      const championHit = targetIds.some(id => {
        const kind = participants.find(entry => entry.id === id)?.kind;
        return id !== participant.id && (kind === 'champion' || kind === 'player');
      });
      if (resetShots.requiresChampionHit && !championHit) {
        seed.log.push(`${label}: no reinicia disparos de «${resetShots.from}» (no alcanzó a ningún campeón)`);
      } else {
        const owner = rows.find(entry => sameAbilityName(entry.name, resetShots.from));
        const shots = owner?.ability.mechanics?.sectorShots;
        if (owner && owner.rank >= 1 && shots) {
          const reset = resetSectorShots(seed.bonuses, owner.name, shots.count, resetShots.count);
          seed.bonuses = reset.bonuses;
          if (reset.reset) {
            seed.log.push(`${label}: reinicia ${reset.reset} disparo(s) de «${owner.name}» (${reset.labels.join(', ')})`);
            seed.chips.push({ kind: 'buff', text: `Reinicia ${owner.name}`, title: reset.labels.join(', ') });
          } else {
            seed.log.push(`${label}: no había disparos de «${owner.name}» en CD para reiniciar`);
          }
        }
      }
    }
    for (const owner of rows) {
      const haste = owner.ability.mechanics?.onAbilityUse;
      if (!haste || owner.rank < 1) continue;
      const turns = haste.turns;
      const speed = rankValue(haste.attackSpeed, owner.rank) ?? (haste.attackSpeed?.[0] ?? 0);
      const name = owner.name.slice(0, 80);
      seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== abilityBuffSource(owner.name) && bonus.source !== abilityBuffStatSource(owner.name));
      seed.bonuses = [
        ...seed.bonuses,
        { id: newBonusId(), stat: 'buff', amount: 1, ...(turns ? { turns } : {}), source: abilityBuffSource(owner.name), label: name },
        ...(speed ? [{ id: newBonusId(), stat: 'atkSpePct' as const, amount: speed, ...(turns ? { turns } : {}), source: abilityBuffStatSource(owner.name), label: name }] : []),
      ];
      seed.log.push(`${owner.seal} «${owner.name}»: al usar una habilidad, +${speed}% vel. ataque ${turns} t.`);
      seed.chips.push({ kind: 'buff', text: `+${speed}% AS ${turns}t`, title: owner.name });
    }
    return seed;
  };

  /**
   * Escudo / curación al usarla (Égida dorada): Σ % del rango × stat [+ % por campeón enemigo alcanzado] × poder de
   * curación y escudos (redondeo al aplicar). El escudo lleva un marcador con sus turnos (al caducar se quita lo que quede).
   */
  const castPoolSeed = async (row: AbilityRow, targetIds: string[], seed: MechanicsSeed, pool = row.ability.mechanics?.castPool, inArea = true): Promise<void> => {
    if (!pool) return;
    const label = `${row.seal} «${row.name}»`;
    const word = pool.kind === 'shield' ? 'escudo' : 'cura';
    if (pool.requiresSelfInArea && !inArea) {
      seed.log.push(`${label}: ${word} no se aplica (no está en el área)`);
      return;
    }
    if (pool.requiresSelfStatus) {
      const selfPrefix = abilitySelfStatSource(row.name);
      const active = !!(participant.effects.find(effect => effect.source === `ability:${row.name}` && effect.duration > 0) || (participant.bonuses ?? []).some(bonus => bonus.source === selfPrefix || (bonus.source ?? '').startsWith(`${selfPrefix}:`)));
      if (!active) {
        seed.log.push(`${label}: ${word} no se aplica (el estado propio aún no está activo)`);
        return;
      }
    }
    const context = participantContext(participant, level, extra);
    if (!context) { seed.log.push(`${label}: ${word} → a mano (sin stats)`); return; }
    const stats = context.ctx.stats as Record<string, unknown> & { bonus?: Record<string, unknown> };
    const key: Record<string, string> = { armor: 'ac', bonusArmor: 'ac', mr: 'mr', bonusMr: 'mr', hp: 'hp', bonusHp: 'hp', mana: 'mana', bonusMana: 'mana', ad: 'ad', bonusAd: 'ad', ap: 'ap' };
    const statValue = (stat: string): number => {
      if (stat === 'baseAd') return Math.max(0, statNum(stats.ad) - statNum(stats.bonus?.ad));
      if (stat === 'missingHp') return Math.max(0, context.ctx.missingHp ?? 0);
      if (stat.startsWith('bonus')) return statNum(stats.bonus?.[key[stat] ?? stat]);
      return statNum(stats[key[stat] ?? stat]);
    };
    const statName: Record<string, string> = { ad: 'AD total', bonusAd: 'AD bonus', baseAd: 'AD base', ap: 'AP', hp: 'vida máx.', bonusHp: 'vida bonus', missingHp: 'vida faltante', armor: 'CA', bonusArmor: 'CA bonus', mr: 'RM', bonusMr: 'RM bonus', mana: 'maná máx.', bonusMana: 'maná bonus' };
    const flatRank = pool.flatByLevel ? (passiveRow()?.rank ?? Math.max(1, milestoneRank(level))) : row.rank;
    const flat = rankValue(pool.flat, flatRank) ?? 0;
    let raw = flat;
    const parts: string[] = flat ? [`${fmt(flat)} base${pool.flatByLevel ? ` (tramo ${flatRank})` : ''}`] : [];
    for (const ratio of pool.ratios) {
      const pct = rankValue(ratio.values, row.rank) ?? 0;
      const base = statValue(ratio.stat);
      const add = (pct / 100) * base;
      raw += add;
      parts.push(`${fmt(pct)}% ${statName[ratio.stat] ?? ratio.stat} (${fmt(base)}) = ${fmt(add)}`);
    }
    if (pool.perChampionHit) {
      const champions = targetIds.filter(id => { const kind = participants.find(entry => entry.id === id)?.kind; return kind === 'champion' || kind === 'player'; }).length;
      const base = statValue(pool.perChampionHit.stat);
      const add = (pool.perChampionHit.pct / 100) * base * champions;
      raw += add;
      parts.push(`${fmt(pool.perChampionHit.pct)}% ${statName[pool.perChampionHit.stat] ?? pool.perChampionHit.stat} (${fmt(base)}) × ${champions} campeón/es alcanzado/s = ${fmt(add)}`);
    }
    const final = poolAmount(raw, context.ctx);
    const formula = `${parts.join(' + ') || '0'} → ${final.text}`;
    if (pool.requiresChampionHit) {
      const champHit = targetIds.some(id => {
        const kind = participants.find(entry => entry.id === id)?.kind;
        return id !== participant.id && (kind === 'champion' || kind === 'player');
      });
      if (!champHit) { seed.log.push(`${label}: ${word} → no alcanzó a ningún campeón (nada)`); return; }
    } else if (pool.requiresHit && targetIds.length === 0) { seed.log.push(`${label}: ${word} → no alcanzó a ningún enemigo (nada)`); return; }
    if (final.amount <= 0) { seed.log.push(`${label}: ${word} = ${formula} → nada`); return; }
    // A quién: al portador (y aliados elegidos) o a los aliados objetivo.
    const allies = participants.filter(entry => !entry.defeated && !enemiesOf().some(foe => foe.id === entry.id));
    const recipients: string[] = pool.allAllies
      ? (pool.target === 'ally' ? allies.filter(entry => entry.id !== participant.id).map(entry => entry.id) : allies.map(entry => entry.id))
      : (pool.target === 'ally' ? targetIds.filter(id => id !== participant.id) : [participant.id]);
    if (!pool.allAllies && pool.target === 'ally' && recipients.length === 0) { seed.log.push(`${label}: ${word} → sin aliado elegido (nada)`); return; }
    if (!pool.allAllies && pool.target !== 'ally' && pool.alliesToo) {
      const candidates = participants.filter(entry => entry.id !== participant.id && !entry.defeated && !targetIds.includes(entry.id));
      if (candidates.length) recipients.push(...(await askTargets(`${label}: ${word} también a (aliados en el área)`, '', undefined, candidates, 'Aplicar')));
    }
    const amountFor = (who: CombatParticipant): { amount: number; formula: string; note: string } => {
      const bonus = pool.lowHpBonus;
      const hp = participantHp(who);
      const low = !!(bonus && hp?.max && hp.max > 0 && (hp.current / hp.max) * 100 < bonus.belowHpPct);
      const used = low ? raw * bonus!.multiplier : raw;
      const done = poolAmount(used, context.ctx);
      const note = low ? ` · ×${bonus!.multiplier} (por debajo del ${bonus!.belowHpPct}% de vida máx.)` : '';
      return { amount: done.amount, formula: low ? `${parts.join(' + ') || '0'} ×${bonus!.multiplier} → ${done.text}` : formula, note };
    };
    if (pool.kind === 'heal' && pool.delayTurns) {
      // Cura retrasada: marcador con turnos en el lanzador (vence al empezar su turno) y sin turnos en los aliados.
      const pending = pendingHealSource(row.name);
      const names: string[] = [];
      for (const id of recipients) {
        const who = participants.find(entry => entry.id === id);
        if (!who) continue;
        names.push(who.name);
        const given = amountFor(who);
        const marker: CombatBonus = { id: newBonusId(), stat: 'buff', amount: given.amount, ...(id === participant.id ? { turns: pool.delayTurns } : {}), source: pending, label: row.name.slice(0, 80) };
        if (id === participant.id) seed.bonuses = [...seed.bonuses.filter(bonus => bonus.source !== pending), marker];
        else if (onTargetBonuses) {
          const undo = await onTargetBonuses(id, current => [...current.filter(bonus => bonus.source !== pending), marker]);
          if (undo) seed.undos.push(undo);
        }
      }
      seed.chips.push({ kind: 'heal', text: `Cura pendiente ${pool.delayTurns}t`, title: `${label} → ${names.join(', ')} (o «Curar ahora»)` });
      seed.log.push(`${label}: cura pendiente a ${names.join(', ')} = ${formula} · se aplica al empezar el turno de ${participant.name} dentro de ${pool.delayTurns} t. (o «Curar ahora»)`);
      return;
    }
    const source = abilityShieldSource(row.name);
    for (const id of recipients) {
      const self = id === participant.id;
      const who = participants.find(entry => entry.id === id);
      if (!who) continue;
      const given = amountFor(who);
      let amount = given.amount;
      let note = given.note;
      const formulaLine = given.formula;
      // El escudo con turnos no se acumula en el mismo objetivo: refresca (da lo que falte hasta el valor nuevo).
      const old = pool.kind === 'shield' && pool.turns ? (who.bonuses ?? []).find(bonus => bonus.source === source) : undefined;
      if (old) {
        const leftover = Math.min(participantHpPools(who)?.shield ?? 0, Math.max(0, old.amount));
        amount = Math.max(0, final.amount - leftover);
        note = ` (refresca: le quedaban ${leftover})`;
      }
      if (amount > 0) {
        const undo = self ? (onPoolChange ? await onPoolChange(pool.kind, amount) : null) : (onTargetPool ? await onTargetPool(id, pool.kind, amount) : null);
        if (!undo) {
          seed.log.push(`${label}: ${word} a ${who.name} = ${formulaLine} → a mano`);
          seed.chips.push({ kind: 'manual', text: `${word} ${given.amount} a ${who.name}: a mano`, title: label });
          continue;
        }
        seed.undos.push(undo);
      }
      seed.chips.push({ kind: pool.kind, text: `+${amount} ${pool.kind === 'shield' ? 'escudo' : 'PV'}${self ? '' : ` ${who.name}`}${pool.turns ? ` ${pool.turns}t` : ''}`, title: `${label} → ${who.name}` });
      seed.log.push(`${label}: ${word} a ${who.name} = ${formulaLine}${note}${old ? ` → +${amount}` : ''}${pool.turns ? ` · dura ${pool.turns} t. (al acabar se quita lo que quede)` : ''}`);
      if (pool.kind === 'shield' && pool.turns) {
        const marker: CombatBonus = { id: newBonusId(), stat: 'buff', amount: final.amount, turns: pool.turns, source, label: row.name.slice(0, 80) };
        if (self) seed.bonuses = [...seed.bonuses.filter(bonus => bonus.source !== source), marker];
        else if (onTargetBonuses) {
          const undo = await onTargetBonuses(id, current => [...current.filter(bonus => bonus.source !== source), marker]);
          if (undo) seed.undos.push(undo);
        }
      }
    }
  };

  /** Efecto propio que sigue activo (sin CD: mientras dure no se puede volver a usar). */
  const activeEffectOf = (row: AbilityRow): string | undefined => {
    const self = player
      ? readActiveEffect(player.activeEffects, abilityActiveEffectKey(row.name))
      : readActiveEffect(participant.activeEffects, abilityActiveEffectKey(row.name));
    if (self > 0 && row.ability.mechanics?.selfStatus?.blocksAbility !== false) return `Efecto activo (${self} t.)`;
    const pending = pendingHeal(row);
    if (pending) return `Cura pendiente (${pending.turns ?? '—'} t.)`;
    for (const owner of participants.some(entry => entry.id === participant.id) ? participants : [participant, ...participants]) {
      const shield = (owner.id === participant.id ? participant.bonuses ?? [] : owner.bonuses ?? []).find(bonus => bonus.source === abilityShieldSource(row.name));
      if (shield) return `Escudo activo${owner.id === participant.id ? '' : ` en ${owner.name}`} (${shield.turns ?? '—'} t.)`;
    }
    const source = `ability:${row.name}`;
    let longest = 0;
    const on: string[] = [];
    const ignoreSelf = row.ability.mechanics?.selfStatus?.blocksAbility === false;
    for (const other of participants) {
      if (ignoreSelf && other.id === participant.id) continue;
      const effect = other.effects.find(entry => entry.source === source && entry.duration > 0);
      if (!effect) continue;
      longest = Math.max(longest, effect.duration);
      on.push(other.name);
    }
    return on.length ? `Efecto activo en ${on.join(', ')} (${longest} t.)` : undefined;
  };

  /** Cura retrasada pendiente del lanzador (marcador con turnos). */
  const pendingHeal = (row: AbilityRow): CombatBonus | undefined =>
    row.ability.mechanics?.castPool?.delayTurns ? (participant.bonuses ?? []).find(bonus => bonus.source === pendingHealSource(row.name)) : undefined;

  /** «Curar ahora»: aplica la cura pendiente al lanzador y a los aliados marcados y quita los marcadores. */
  const healNow = async (row: AbilityRow) => {
    const marker = pendingHeal(row);
    if (!marker || !isAdmin || busy) return;
    setBusy(true);
    setError(null);
    try {
      const source = marker.source!;
      const undos: (() => Promise<void>)[] = [];
      const lines: string[] = [];
      const prev = participant.bonuses ?? [];
      const self = onPoolChange ? await onPoolChange('heal', marker.amount) : null;
      if (self) undos.push(self);
      lines.push(`${participant.name}: +${marker.amount} PV${self ? '' : ' (a mano / ya al máximo)'}`);
      for (const ally of participants) {
        if (ally.id === participant.id) continue;
        const held = (ally.bonuses ?? []).find(bonus => bonus.source === source);
        if (!held) continue;
        const healed = onTargetPool ? await onTargetPool(ally.id, 'heal', held.amount) : null;
        if (healed) undos.push(healed);
        lines.push(`${ally.name}: +${held.amount} PV${healed ? '' : ' (a mano / ya al máximo)'}`);
        if (onTargetBonuses) {
          const undo = await onTargetBonuses(ally.id, current => current.filter(bonus => bonus.source !== source));
          if (undo) undos.push(undo);
        }
      }
      if (onBonusesSave) {
        await onBonusesSave(prev.filter(bonus => bonus.source !== source));
        undos.push(() => onBonusesSave(prev));
      }
      const undo = async () => { for (const step of [...undos].reverse()) await step(); setLastUse(null); };
      setLastUse({ headline: `${row.seal} «${row.name}»: curar ahora`, log: lines, chips: [{ kind: 'heal', text: `Cura ${marker.amount}`, title: lines.join(' · ') }], undo: () => { void undo(); } });
      logCombat({ title: `${row.seal} «${row.name}»: curar ahora`, lines, actor: participant.name });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo curar');
    } finally {
      setBusy(false);
    }
  };

  const reduceEmpoweredOnAbilityUse = (seed?: MechanicsSeed): MechanicsSeed | undefined => {
    if (!seed) return seed;
    let bonuses = seed.bonuses;
    const log = [...seed.log];
    const chips = [...seed.chips];
    for (const owner of rows) {
      const emp = owner.ability.mechanics?.empoweredAa;
      if (!emp?.reduceOnAbility || owner.rank < 1) continue;
      const reduced = reduceEmpoweredAaCooldown(bonuses, owner.name, emp.reduceOnAbility);
      if (!reduced) continue;
      bonuses = reduced.bonuses;
      log.push(`${owner.seal} «${owner.name}»: CD del AA potenciado ${reduced.before} → ${reduced.after} t.${reduced.ready ? ' · listo' : ''}`);
      chips.push({ kind: 'cd', text: reduced.ready ? `${owner.name} listo` : `${owner.name} CD −${emp.reduceOnAbility}t`, title: 'CD del AA potenciado al usar una habilidad' });
    }
    return { ...seed, bonuses, log, chips };
  };

  /** «Detonar»: aplica el daño y los efectos del área retrasada y quita el marcador. Sin coste ni acción. */
  const detonateTrap = async (row: AbilityRow, targetIds: string[]) => {
    const marker = abilityTrap(participant.bonuses, row.name);
    if (!marker || !isAdmin || busy) return;
    const ability = activeAbility(row);
    const mechanics = row.ability.mechanics;
    const trapName = mechanics?.trap?.name ?? row.name;
    setBusy(true);
    setError(null);
    try {
      const abilityLog: string[] = [`${row.seal} «${row.name}»: detonar ${trapName}`];
      const chips: ResultChip[] = [];
      const undos: (() => Promise<void>)[] = [];
      let damageTotal = 0;
      let headline = `${row.seal} «${row.name}»: detonar`;
      if (hasDamageScaling(ability.damage)) {
        const stats = player
          ? { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) }
          : champion
            ? championDamageContext(champion, extra).stats
            : null;
        if (stats) {
          const result = rollAbilityDamage(ability.damage!, stats, row.rank);
          damageTotal = result.total;
          headline = `${row.seal} «${row.name}»: detonar · ${fmt(damageTotal)}${ability.damage?.type ? ` ${ability.damage.type}` : ''}`;
          abilityLog.push(
            `Daño${ability.damage?.type ? ` ${ability.damage.type}` : ''} (rango ${row.rank}) = ${result.contributions.map(entry =>
              `${fmt(entry.scaling * 100)}% ${entry.stat.toUpperCase()} ${entry.source === 'bonus' ? 'bonus' : 'total'} (${rollText(entry.roll)}) = ${fmt(entry.damage)}`).join(' + ')} → ${fmt(result.total)}`,
          );
        }
      }
      let kills: string[] = [];
      const eruptName = mechanics?.trap?.eruptEffectName ?? mechanics?.trap?.eruptEffect?.[0]?.name;
      const eruptDuration = mechanics?.trap?.eruptEffectDuration ?? mechanics?.trap?.eruptEffect?.[0]?.duration?.[0];
      if (targetIds.length) {
        kills = await applyToTargets(row, ability, damageTotal, targetIds, targetIds, abilityLog, eruptName || eruptDuration ? { effectName: eruptName, effectDuration: eruptDuration } : undefined);
      }
      if (ability.damage?.hp && targetIds.length) {
        for (const id of targetIds) {
          const who = participants.find(entry => entry.id === id);
          if (!who) continue;
          const hp = hpForDamage(ability.damage, who);
          const extra = hp ? hpDamageAmount(ability.damage, row.rank, hp) : 0;
          if (extra <= 0) continue;
          abilityLog.push(`Daño de vida (${hpOrigin(ability.damage)}): ${extra} a ${who.name}`);
          const more = await applyToTargets(row, ability, extra, [id], [], abilityLog, { skipEffects: true });
          kills = [...new Set([...kills, ...more])];
        }
      }
      const prev = participant.bonuses ?? [];
      const source = abilityTrapSource(row.name);
      let bonuses = prev.filter(bonus => bonus.source !== source);
      if (mechanics?.reduceEmpoweredAaOnHit) {
        const champHit = targetIds.some(id => {
          const kind = participants.find(entry => entry.id === id)?.kind;
          return id !== participant.id && (kind === 'champion' || kind === 'player');
        });
        if (champHit) {
          for (const owner of rows) {
            if (owner.rank < 1 || !owner.ability.mechanics?.empoweredAa) continue;
            const reduced = reduceEmpoweredAaCooldown(bonuses, owner.name, mechanics.reduceEmpoweredAaOnHit);
            if (!reduced) continue;
            bonuses = reduced.bonuses;
            abilityLog.push(`${owner.seal} «${owner.name}»: CD del AA potenciado ${reduced.before} → ${reduced.after} t. por acertar a un campeón${reduced.ready ? ' · listo' : ''}`);
            chips.push({ kind: 'cd', text: reduced.ready ? `${owner.name} listo` : `${owner.name} CD −${mechanics.reduceEmpoweredAaOnHit}t`, title: 'CD del AA potenciado al acertar' });
          }
        }
      }
      if (onBonusesSave) {
        await onBonusesSave(bonuses);
        undos.push(() => onBonusesSave(prev));
      }
      abilityLog.push(`${trapName}: detonado${kills.length ? ` · derribos ${kills.length}` : ''}`);
      const undo = async () => { for (const step of [...undos].reverse()) await step(); setLastUse(null); };
      const targetNames = targets.filter(entry => targetIds.includes(entry.id)).map(entry => entry.name).join(', ');
      setLastUse({ headline, log: abilityLog, ...(chips.length ? { chips } : {}), undo: () => { void undo(); } });
      logCombat({ title: `${headline}${targetNames ? ` → ${targetNames}` : ''}`, lines: abilityLog, actor: participant.name });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo detonar');
    } finally {
      setBusy(false);
    }
  };

  const reduceEmpoweredStruck = async (row: AbilityRow) => {
    const emp = row.ability.mechanics?.empoweredAa;
    if (!emp?.reduceOnStruck || !isAdmin || busy) return;
    const reduced = reduceEmpoweredAaCooldown(participant.bonuses ?? [], row.name, emp.reduceOnStruck);
    if (!reduced || !onBonusesSave) return;
    const prev = participant.bonuses ?? [];
    await onBonusesSave(reduced.bonuses);
    const lines = [`${row.seal} «${row.name}»: le han lanzado una habilidad → CD del AA potenciado ${reduced.before} → ${reduced.after} t.${reduced.ready ? ' · listo' : ''}`];
    setLastUse({
      headline: `${row.seal} «${row.name}»: CD −${emp.reduceOnStruck} t.`,
      log: lines,
      chips: [{ kind: 'cd', text: reduced.ready ? `${row.name} listo` : `${row.name} CD −${emp.reduceOnStruck}t`, title: lines[0] }],
      undo: () => { void onBonusesSave(prev); setLastUse(null); },
    });
    logCombat({ title: lines[0], lines, actor: participant.name });
  };

  /** Enemigos del combate: los players contra el resto (campeones, NPCs…); sin los derrotados. */
  const enemiesOf = (): CombatParticipant[] => {
    const side = (entry: CombatParticipant) => (entry.kind === 'player' ? 'players' : 'dm');
    return participants.filter(entry => entry.id !== participant.id && !entry.defeated && side(entry) !== side(participant));
  };

  /** Escudo de hechizos activo de esta habilidad en el portador (su estado). */
  const spellShieldUp = (row: AbilityRow): CombatEffect | undefined =>
    row.ability.mechanics?.spellShield ? participant.effects.find(effect => effect.source === `ability:${row.name}` && effect.duration > 0) : undefined;

  /** Aviso en la consola si un objetivo tiene un escudo de hechizos rompible puesto (se rompe con su botón). */
  const shieldUpNotes = (ids: string[]): string[] => ids.flatMap(id => {
    const target = participants.find(entry => entry.id === id);
    if (!target) return [];
    return participantAbilities(target, level).filter(owned => owned.ability.mechanics?.spellShield && target.effects.some(effect => effect.source === `ability:${owned.name}` && effect.duration > 0))
      .map(owned => `${target.name} tiene «${owned.ability.mechanics!.spellShield!.status}» (${owned.seal} «${owned.name}»): si lo rompe, pulsa «Romper» en su habilidad`);
  });

  /** Romper el escudo de hechizos: quita el estado y da los bonus «por tenerla aprendida» × (multiplicador − 1) extra durante N turnos. */
  const breakSpellShield = async (row: AbilityRow) => {
    const shield = row.ability.mechanics?.spellShield;
    const effect = spellShieldUp(row);
    if (!shield || !effect || !isAdmin || busy) return;
    setBusy(true);
    setError(null);
    try {
      const source = `ability:${row.name}`;
      await onApplySourcedEffect([participant.id], { source, name: effect.name, duration: 1, restore: { [participant.id]: null } });
      const prev = participant.bonuses ?? [];
      const breakSource = abilityBreakSource(row.name);
      const lines: string[] = [`«${shield.status}» de ${participant.name} roto`];
      const extraBonuses: CombatBonus[] = [];
      for (const stat of row.ability.mechanics?.learnedStats ?? []) {
        const base = rankValue(stat.values, row.rank) ?? 0;
        const amount = Math.round(base * (shield.learnedMultiplier - 1) * 1000) / 1000;
        if (!amount) continue;
        extraBonuses.push({ id: newBonusId(), stat: stat.stat as CombatBonus['stat'], amount, turns: shield.breakTurns, source: `${breakSource}:${stat.stat}`.slice(0, 80), label: `${row.name} (escudo roto)`.slice(0, 80) });
        lines.push(`${row.seal} «${row.name}»: ${stat.stat} por tenerla aprendida ${fmt(base)} × ${fmt(shield.learnedMultiplier)} = ${fmt(base * shield.learnedMultiplier)} → +${fmt(amount)} extra durante ${shield.breakTurns} t.`);
      }
      if (extraBonuses.length && onBonusesSave) {
        const kept = prev.filter(bonus => !(bonus.source ?? '').startsWith(breakSource));
        await onBonusesSave([...kept, ...extraBonuses].slice(-30));
      } else if (extraBonuses.length) lines.push('Bonus extra: a mano');
      const undo = async () => {
        await onApplySourcedEffect([participant.id], { source, name: effect.name, duration: 1, restore: { [participant.id]: effect } });
        if (extraBonuses.length && onBonusesSave) await onBonusesSave(prev);
        setLastUse(null);
      };
      const chips: ResultChip[] = extraBonuses.map(bonus => ({ kind: 'buff', text: `+${fmt(bonus.amount)} ${bonus.stat} ${bonus.turns}t`, title: `${row.name}: escudo roto` }));
      setLastUse({ headline: `«${shield.status}» roto · ${participant.name}`, log: lines, chips, undo: () => { void undo(); } });
      logCombat({ title: `${row.seal} «${row.name}»: escudo roto`, lines, actor: participant.name });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo romper el escudo');
    } finally {
      setBusy(false);
    }
  };

  /** ¿Algún buff activo hace que los AA apliquen el estado de la pasiva? */
  const aaAppliesPassive = (): boolean =>
    rows.some(owner => owner.rank >= 1 && owner.ability.mechanics?.buff?.aaAppliesPassive === true && !!abilityBuff(participant.bonuses, owner.name));

  /** AA físico: % AD del buff activo y daño extra de la pasiva por prob. de crítico. */
  const basicAttackMods = (type: 'AD' | 'AP', total: number, stats: Record<string, unknown>): { total: number; log: string[]; chips: ResultChip[] } => {
    const log: string[] = [];
    const chips: ResultChip[] = [];
    if (type !== 'AD') return { total, log, chips };
    let next = total;
    for (const owner of rows) {
      const buff = owner.ability.mechanics?.buff;
      const marker = buff ? abilityBuff(participant.bonuses, owner.name) : undefined;
      if (!buff || !marker || owner.rank < 1) continue;
      const pct = rankValue(buff.aaAd, marker.amount);
      if (!pct) continue;
      const raw = (next * pct) / 100;
      const after = Math.ceil(raw - 1e-9);
      log.push(`${owner.seal} «${owner.name}» activa (${marker.turns ?? '—'} t.): AA al ${fmt(pct)}% AD → ${fmt(next)} × ${fmt(pct)}% = ${fmt(raw)}${after !== raw ? ` → ${fmt(after)} (redondeo ↑)` : ''}`);
      chips.push({ kind: 'buff', text: `${owner.name} ${fmt(pct)}%`, title: 'AA potenciado por la habilidad activa' });
      next = after;
    }
    const owner = passiveRow();
    const critBonus = owner?.ability.mechanics?.aaCritBonus;
    if (owner && critBonus) {
      const faces = statNum(stats.critChance);
      const pct = critBonus.pctPerFace * faces;
      if (!critBonus.pctPerFace) {
        log.push(`P «${owner.name}»: daño extra por prob. de crítico sin valor (0 % por cara; tiene ${fmt(faces)} caras) → no suma`);
      } else if (faces <= 0) {
        log.push(`P «${owner.name}»: sin prob. de crítico (0 caras) → +0`);
      } else {
        const raw = (next * pct) / 100;
        const bonus = Math.ceil(raw - 1e-9);
        log.push(`P «${owner.name}»: ${fmt(critBonus.pctPerFace)}% por cara × ${fmt(faces)} caras = +${fmt(pct)}% → ${fmt(next)} × ${fmt(pct)}% = ${fmt(raw)}${bonus !== raw ? ` → ${fmt(bonus)} (redondeo ↑)` : ''} · total ${fmt(next + bonus)}`);
        chips.push({ kind: 'buff', text: `${owner.name} +${fmt(bonus)}`, title: `+${fmt(pct)}% por prob. de crítico (${fmt(faces)} caras)` });
        next += bonus;
      }
    }
    return { total: next, log, chips };
  };

  /** Ataque básico: daño = AD (o AP) TOTAL de la ficha, tirando sus dados si los tiene; gasta un ataque y daña al objetivo. */
  const basicAttack = async (type: 'AD' | 'AP', target: CombatParticipant | null) => {
    pendingCcGrants.length = 0;
    const stored = player ? basicAttackEntries(player.basicAttack).find(entry => (entry.type === 'AP' ? 'AP' : 'AD') === type)?.scaling : undefined;
    const attackLevel = player ? level : champion ? championDamageContext(champion, extra).level : level;
    const pct = basicAttackPct(type, attackLevel, stored);
    setAttackPick(null);
    if (!isAdmin || saving || busy) return;
    const stats = player
      ? playerTotalLine(player.sheet, player.equipamiento, level, extra)
      : champion ? championDamageContext(champion, extra).stats : null;
    if (!stats) return;
    const source = type === 'AP' ? stats.ap : stats.ad;
    const critOn = crit;
    setCrit(false);
    const critChips: ResultChip[] = [];
    let aaCritical = false;
    let headline: string;
    let detail: string | undefined;
    let total: number;
    const mainLog: string[] = [];
    try {
      const roll = rollDamageStat(source);
      // AP: % del AP total por tramo de nivel, redondeando hacia arriba. AD: el AD total.
      total = pct === 1 ? roll.total : Math.ceil(roll.total * pct);
      const aaMods = basicAttackMods(type, total, stats as Record<string, unknown>);
      total = aaMods.total;
      // Crítico (solo AA físico): daño × DAÑO CRÍT, hacia arriba. Las reglas de impacto no critean.
      const critical = critOn && type === 'AD';
      aaCritical = critical;
      const normal = total;
      const noCrit = critical ? critNoDamageOwner() : undefined;
      const mult = critical && !noCrit ? critMultiplier(stats as Record<string, unknown>) : 1;
      if (critical && !noCrit) total = Math.ceil(normal * mult);
      headline = `«AA»${critical ? ' CRÍTICO' : ''} ${formatDamageAmount(total)} de ${formatDamageType(type === 'AP' ? 'magico' : 'fisico')}`;
      const dice = roll.groups.map(group => `${group.sign < 0 ? '−' : ''}${group.count}d${group.sides}: [${group.rolls.join(', ')}]`);
      const pctLabel = `${Math.round(pct * 1000) / 10}%`;
      detail = [
        pct === 1 ? null : `${type} ${formatDamageAmount(roll.total)} × ${pctLabel} = ${formatDamageAmount(total)}`,
        `${type} total ${String(source)}`,
        ...dice,
      ].filter(Boolean).join(' · ');
      const raw = pct === 1 ? roll.total : roll.total * pct;
      mainLog.push(
        `AA ${type} de ${participant.name}${target ? ` → ${target.name}` : ' (sin objetivo)'}`,
        `Daño ${type === 'AP' ? 'mágico' : 'físico'} = ${type} total ${String(source)}: ${rollText(roll)}${pct === 1 ? '' : ` × ${pctLabel} (AP por nivel ${attackLevel}) = ${fmt(raw)}${total !== raw ? ` → ${fmt(total)} (redondeo ↑)` : ''}`}`,
        ...aaMods.log,
        ...(critical && noCrit ? [`CRÍTICO sin daño extra (P «${noCrit}»: los críticos no hacen daño extra) → ${fmt(total)}`] : []),
        ...(critical && !noCrit ? [`CRÍTICO: ${fmt(normal)} × DAÑO CRÍT ${fmt(mult)} = ${fmt(normal * mult)}${total !== normal * mult ? ` → ${fmt(total)} (redondeo ↑)` : ''} (los efectos de impacto no critean)`] : []),
      );
      critChips.push(...aaMods.chips);
      if (critical) critChips.push({ kind: 'crit', text: noCrit ? 'CRÍTICO sin daño' : 'CRÍTICO', title: noCrit ? `${noCrit}: los críticos no hacen daño extra` : `× ${fmt(mult)} (DAÑO CRÍT)` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo tirar el ataque');
      return;
    }
    const actions = spendAction('attacks');
    setError(null);
    setBusy(true);
    try {
      if (actions) await combatPatchRef.current({ actionsLeft: actions });
      const aaType = type === 'AP' ? 'magic' as const : 'physical' as const;
      const aaCrit = (type === 'AD' && critOn) || (type === 'AP' && critOn && hasCinderbloom(participant, effectData));
      const damage = target && onTargetDamage ? await onTargetDamage(target.id, total, { fromAutoAttack: true, damageType: aaType, critical: aaCrit, attackerId: participant.id }) : null;
      if (target && !damage) headline = `${headline} → ${target.name}`;
      if (target) mainLog.push(...hpLine(damage), ...defenseLines([target.id], stats as Record<string, unknown>, type === 'AP' ? 'magic' : 'physical'));
      // Robo de vida (el AA) + omnivampirismo: cura el % del daño del AA.
      const vamp = damage ? await vampFor(total, true, 'AA') : null;
      if (vamp) { mainLog.push(...vamp.log); critChips.push(...vamp.chips); }
      const use: LastUse = {
        headline,
        detail,
        log: mainLog,
        ...(critChips.length ? { chips: critChips } : {}),
        undo: actions || vamp?.undo ? () => { void (async () => { if (vamp?.undo) await vamp.undo(); if (actions) await combatPatchRef.current({ actionsLeft: prevActions }); })(); setLastUse(null); } : undefined,
      };
      // On-hit: solo si golpea a alguien.
      let kills = damage && damage.before > 0 && damage.after <= 0 && target ? [target.id] : [];
      const shotKills: string[] = [];
      let seed = target && aaAppliesPassive() ? await passiveStatusSeed([target.id], 'AA potenciado', undefined, aaCritical) : undefined;
      // Disparos por sector (p. ej. patas de Urgot): uno listo se dispara al acertar el AA.
      if (target && damage && damage.before > 0 && onBonusesSave) {
        let bonuses = seed?.bonuses ?? participant.bonuses ?? [];
        const shotLog: string[] = [];
        const shotChips: ResultChip[] = [];
        const shotUndos: (() => Promise<void>)[] = [...(seed?.undos ?? [])];
        for (const owner of rows) {
          const shots = owner.ability.mechanics?.sectorShots;
          if (!shots || owner.rank < 1 || sectorShotTrigger(shots) === 'cast') continue;
          const cdRank = shots.byLevel ? milestoneRank(attackLevel) : owner.rank;
          const cooldown = rankValue(shots.cooldown, cdRank);
          if (!cooldown) continue;
          const spent = spendSectorShot(bonuses, owner.name, shots.count, cooldown, newBonusId);
          if (!spent) {
            shotLog.push(`${owner.seal} «${owner.name}»: ningún disparo de sector listo`);
            continue;
          }
          bonuses = spent.bonuses;
          const adRatio = owner.ability.damage?.ad ? (rankValue(owner.ability.damage.ad, owner.rank) ?? 0) : 0;
          const ad = numericStat((stats as Record<string, unknown>).ad);
          const adPart = Math.round(ad * adRatio);
          const hpPart = hpDamageAmount(owner.ability.damage, owner.rank, hpForDamage(owner.ability.damage, target) ?? { current: 0 });
          const extra = adPart + hpPart;
          shotLog.push(`${owner.seal} «${owner.name}»: disparo de sector ${spent.index + 1}/${shots.count} → ${extra} ( ${fmt(adRatio * 100)}% AD = ${adPart}${hpPart ? ` + vida ${hpPart}` : ''} ); CD ${cooldown} t. · quedan ${spent.readyAfter} listos. Cono (dirección a mano) a otros enemigos.`);
          shotChips.push({ kind: 'buff', text: `${owner.name} ${spent.readyAfter}/${shots.count}`, title: `Disparo ${spent.index + 1} en CD ${cooldown} t.` });
          if (extra > 0 && onTargetDamage) {
            const { damage: shotDamage, kills: more } = await damageTargets(onTargetDamage, [target.id], extra);
            if (more) shotKills.push(...more);
            if (shotDamage) {
              const vamp = await vampFor(extra, false, `${owner.seal} «${owner.name}» (disparo de sector)`);
              if (vamp) { shotLog.push(...vamp.log); shotChips.push(...vamp.chips); if (vamp.undo) shotUndos.push(vamp.undo); }
            }
          }
        }
        if (shotLog.length) {
          const prev = participant.bonuses ?? [];
          if (bonuses !== prev) {
            await onBonusesSave(bonuses);
            shotUndos.unshift(async () => { await onBonusesSave(prev); });
          }
          seed = { bonuses, log: [...(seed?.log ?? []), ...shotLog], chips: [...(seed?.chips ?? []), ...shotChips], undos: shotUndos };
        }
      }
      if (target && onBonusesSave) {
        let bonuses = seed?.bonuses ?? participant.bonuses ?? [];
        const empLog: string[] = [];
        const empChips: ResultChip[] = [];
        const empUndos: (() => Promise<void>)[] = [...(seed?.undos ?? [])];
        for (const owner of rows) {
          const emp = owner.ability.mechanics?.empoweredAa;
          if (!emp || owner.rank < 1) continue;
          const state = empoweredAaState(bonuses, owner.name);
          if (!state.ready) continue;
          const selfHp = participantHp(participant);
          if (emp.skipAboveHpPct && selfHp?.max && selfHp.current / selfHp.max > emp.skipAboveHpPct / 100) {
            empLog.push(`${owner.seal} «${owner.name}»: AA potenciado no se dispara (vida ${fmt(selfHp.current)}/${fmt(selfHp.max)} por encima del ${emp.skipAboveHpPct}%)`);
            continue;
          }
          const tier = emp.byLevel ? milestoneRank(attackLevel) : owner.rank;
          const pct = rankValue(emp.healHpPct, tier) ?? 0;
          const source = emp.hpSource ?? 'max';
          const base = source === 'current' ? (selfHp?.current ?? 0)
            : source === 'missing' ? Math.max(0, (selfHp?.max ?? 0) - (selfHp?.current ?? 0))
            : source === 'bonus' ? (selfHp?.bonus ?? 0)
            : (selfHp?.max ?? 0);
          const raw = base * pct / 100;
          const context = participantContext(participant, level, extra);
          const final = context ? poolAmount(raw, context.ctx, true) : { amount: Math.round(raw), text: `${fmt(raw)}` };
          const healUndo = onPoolChange && final.amount ? await onPoolChange('heal', final.amount) : null;
          if (healUndo) empUndos.push(healUndo);
          const origin = source === 'current' ? 'vida actual' : source === 'missing' ? 'vida faltante' : source === 'bonus' ? 'vida bonus' : 'vida máx.';
          empLog.push(`${owner.seal} «${owner.name}»: AA potenciado cura ${final.amount} (${fmt(pct)}% ${origin}${context ? ` · ${final.text}` : ''}${healUndo ? '' : ' · a mano / ya al máximo'})`);
          empChips.push({ kind: 'heal', text: `Cura ${final.amount}`, title: `${owner.name}: ${fmt(pct)}% ${origin}` });
          const started = startEmpoweredAaCooldown(bonuses, owner.name, emp, tier, newBonusId);
          bonuses = started.bonuses;
          empLog.push(`${owner.seal} «${owner.name}»: AA potenciado entra en CD ${started.turns} t.`);
        }
        if (empLog.length) {
          const alreadySaved = (seed?.undos?.length ?? 0) > 0;
          const original = participant.bonuses ?? [];
          await onBonusesSave(bonuses);
          if (!alreadySaved) empUndos.unshift(async () => { await onBonusesSave(original); });
          seed = { bonuses, log: [...(seed?.log ?? []), ...empLog], chips: [...(seed?.chips ?? []), ...empChips], undos: empUndos };
        }
      }
      if (target) {
        const aaLog: string[] = [];
        const aaChips: ResultChip[] = [];
        let onHitBonuses = seed?.bonuses ?? participant.bonuses ?? [];
        const hp = participantHp(target);
        const atkStats = player
          ? { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) }
          : champion
            ? championDamageContext(champion, extra).stats
            : null;
        const ap = atkStats ? Number((atkStats as { ap?: number }).ap ?? 0) || 0 : 0;
        for (const owner of rows) {
          const onHit = owner.ability.mechanics?.aaOnHit;
          if (!onHit || !abilityAaOnHitActive(onHitBonuses, owner.name, onHit, owner.rank)) continue;
          const source = onHit.hpSource ?? 'max';
          const base = source === 'current' ? (hp?.current ?? 0)
            : source === 'missing' ? Math.max(0, (hp?.max ?? 0) - (hp?.current ?? 0))
            : source === 'bonus' ? (hp?.bonus ?? 0)
            : (hp?.max ?? 0);
          if (onHit.hp?.length && !hp?.max) {
            aaLog.push(`${owner.seal} «${owner.name}»: daño de AA según vida a mano (sin vida del objetivo)`);
            continue;
          }
          const adStat = atkStats as { ad?: number; bonus?: { ad?: number } } | null;
          const ad = onHit.adSource === 'bonus' ? Number(adStat?.bonus?.ad ?? 0) || 0 : Number(adStat?.ad ?? 0) || 0;
          let dealt = aaOnHitDamage(onHit, owner.rank, ap, base, ad);
          let stacks = 0;
          if (onHit.perTargetStacks && target) {
            const mark = abilityAaOnHitStackSource(owner.name, target.id);
            const marker = onHitBonuses.find(bonus => bonus.source === mark);
            stacks = marker && (marker.turns ?? 0) > 0 ? marker.amount : 0;
            dealt = Math.round(dealt * (stacks + 1));
            const nextStacks = Math.min(onHit.perTargetStacks.max ?? 999, stacks + 1);
            onHitBonuses = [...onHitBonuses.filter(bonus => bonus.source !== mark), { id: marker?.id ?? newBonusId(), stat: 'buff', amount: nextStacks, turns: onHit.perTargetStacks.turns, source: mark, label: `${owner.name}`.slice(0, 80) }];
          }
          if (dealt <= 0) continue;
          const more = await applyToTargets(owner, { ...owner.ability, effectTarget: owner.ability.effectTarget }, dealt, [target.id], [], aaLog, { skipEffects: true, lifeSteal: false });
          kills = [...new Set([...kills, ...more])];
          const origin = onHit.ad?.length && !onHit.hp?.length
            ? `${onHit.adSource === 'bonus' ? 'AD bonus' : 'AD'}${onHit.ap?.length ? ` + ${onHit.apSource === 'bonus' ? 'AP bonus' : 'AP'}` : ''}${stacks ? ` · ×${stacks + 1}` : ''}`
            : (source === 'current' ? 'vida actual' : source === 'missing' ? 'vida faltante' : source === 'bonus' ? 'vida bonus' : 'vida máx.');
          aaLog.push(`${owner.seal} «${owner.name}»: AA +${fmt(dealt)}${onHit.type ? ` ${onHit.type}` : ''} (${origin})`);
          aaChips.push({ kind: 'buff', text: `AA +${fmt(dealt)}`, title: `${owner.name}: ${origin}` });
        }
        if (aaLog.length) {
          const undos = [...(seed?.undos ?? [])];
          if (onBonusesSave && onHitBonuses !== (participant.bonuses ?? [])) {
            const original = participant.bonuses ?? [];
            await onBonusesSave(onHitBonuses);
            undos.unshift(async () => { await onBonusesSave(original); });
          }
          seed = { bonuses: onHitBonuses, log: [...(seed?.log ?? []), ...aaLog], chips: [...(seed?.chips ?? []), ...aaChips], undos };
        }
      }
      if (target && onBonusesSave) {
        const kind = target.kind;
        const championTarget = kind === 'champion' || kind === 'player';
        if (championTarget) {
          let bonuses = seed?.bonuses ?? participant.bonuses ?? [];
          const armLog: string[] = [];
          const armChips: ResultChip[] = [];
          const armUndos: (() => Promise<void>)[] = [...(seed?.undos ?? [])];
          const stats = player
            ? { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) }
            : champion
              ? championDamageContext(champion, extra).stats
              : null;
          for (const owner of rows) {
            const armed = owner.ability.mechanics?.armedAa;
            if (!armed || owner.rank < 1 || !abilityArmedAaMarker(bonuses, owner.name)) continue;
            bonuses = bonuses.filter(bonus => bonus.source !== abilityArmedAaSource(owner.name));
            if (stats && (armed.ad?.length || armed.ap?.length)) {
              try {
                const rolled = rollAbilityDamage({ type: armed.type, ad: armed.ad, ap: armed.ap, adSource: armed.adSource, apSource: armed.apSource }, stats, owner.rank);
                if (rolled.total > 0 && onTargetDamage) {
                  const extra = await applyToTargets(owner, { ...owner.ability, effect: armed.effect, effectName: armed.effectName, effectDuration: armed.effectDuration, effectTarget: armed.effectName ? 'enemy' : owner.ability.effectTarget }, rolled.total, [target.id], armed.effectName ? [target.id] : [], armLog, armed.effectName ? undefined : { skipEffects: true, lifeSteal: false });
                  kills = [...new Set([...kills, ...extra])];
                  armLog.push(`${owner.seal} «${owner.name}»: AA armado ${fmt(rolled.total)}${armed.type ? ` ${armed.type}` : ''}`);
                  armChips.push({ kind: 'buff', text: `AA armado ${fmt(rolled.total)}`, title: owner.name });
                }
              } catch (caught) {
                armLog.push(`${owner.seal} «${owner.name}»: AA armado a mano (${caught instanceof Error ? caught.message : 'no se pudo calcular'})`);
              }
            }
            if ((armed.hp?.length || armed.apPer100) && onTargetDamage) {
              const hp = participantHp(target);
              const source = armed.hpSource ?? 'max';
              const base = source === 'current' ? (hp?.current ?? 0) : source === 'missing' ? Math.max(0, (hp?.max ?? 0) - (hp?.current ?? 0)) : source === 'bonus' ? (hp?.bonus ?? 0) : (hp?.max ?? 0);
              if (armed.hp?.length && !hp?.max) {
                armLog.push(`${owner.seal} «${owner.name}»: AA armado según vida a mano (sin vida del objetivo)`);
              } else {
                const apStat = stats as { ap?: number; bonus?: { ap?: number } } | null;
                const apVal = armed.apSource === 'bonus' ? Number(apStat?.bonus?.ap ?? 0) || 0 : Number(apStat?.ap ?? 0) || 0;
                const dealt = aaOnHitDamage({ hp: armed.hp, hpSource: armed.hpSource, apPer100: armed.apPer100 }, owner.rank, apVal, base);
                if (dealt > 0) {
                  const extra = await applyToTargets(owner, { ...owner.ability, effectTarget: owner.ability.effectTarget }, dealt, [target.id], [], armLog, { skipEffects: true, lifeSteal: false });
                  kills = [...new Set([...kills, ...extra])];
                  const origin = source === 'missing' ? 'vida faltante' : source === 'current' ? 'vida actual' : source === 'bonus' ? 'vida bonus' : 'vida máx.';
                  armLog.push(`${owner.seal} «${owner.name}»: AA armado +${fmt(dealt)}${armed.type ? ` ${armed.type}` : ''} (${origin}${armed.apPer100 ? ` + ${armed.apPer100}%/100 AP` : ''})`);
                  armChips.push({ kind: 'buff', text: `AA armado +${fmt(dealt)}`, title: `${owner.name}: ${origin}` });
                }
              }
            }
            if (armed.explodeFromLevel && level >= armed.explodeFromLevel) {
              armLog.push(`${owner.seal} «${owner.name}»: a partir del nivel ${armed.explodeFromLevel} este AA explota a enemigos cercanos (elige zona; on-hits a otros, a mano)`);
            } else if (armed.effectName && armed.effectDuration) {
              const extra = await applyToTargets(owner, { ...owner.ability, effect: armed.effect, effectName: armed.effectName, effectDuration: armed.effectDuration, effectTarget: 'enemy' }, 0, [], [target.id], armLog);
              void extra;
              armLog.push(`${owner.seal} «${owner.name}»: AA armado aplica «${armed.effectName}» ${armed.effectDuration} t.`);
            }
            if (armed.endsSelfStatus) {
              const selfStat = abilitySelfStatSource(owner.name);
              const sources = new Set([selfStat, abilitySelfDrSource(owner.name), abilityStacksSource(owner.name)]);
              bonuses = bonuses.filter(bonus => {
                const source = bonus.source ?? '';
                return !sources.has(source) && !source.startsWith(`${selfStat}:`);
              });
              const current = participant.effects.find(effect => effect.source === `ability:${owner.name}`) ?? null;
              if (current && onApplySourcedEffect) {
                await onApplySourcedEffect([participant.id], { source: `ability:${owner.name}`, name: current.name, duration: 1, restore: { [participant.id]: null } });
              }
              armLog.push(`${owner.seal} «${owner.name}»: termina «${current?.name ?? owner.ability.mechanics?.selfStatus?.name ?? owner.name}»`);
            }
          }
          bonuses = await applyCcStackGrants(bonuses, armLog, armChips);
          if (armLog.length) {
            const original = participant.bonuses ?? [];
            await onBonusesSave(bonuses);
            armUndos.unshift(async () => { await onBonusesSave(original); });
            seed = { bonuses, log: [...(seed?.log ?? []), ...armLog], chips: [...(seed?.chips ?? []), ...armChips], undos: armUndos };
          }
        }
      }
      if ((kills.length || shotKills.length) && onBonusesSave) {
        let nextBonuses = seed?.bonuses ?? participant.bonuses ?? [];
        const takeLog: string[] = [];
        const takeChips: ResultChip[] = [];
        const allKills = [...new Set([...kills, ...shotKills])];
        for (const entry of rows) {
          const resolved = applyEvolve(activeAbility(entry, phaseOf(entry)), isAbilityEvolved(nextBonuses, entry.name));
          const rec = resolved.mechanics?.recastOnTakedown;
          if (!rec || entry.rank < 1) continue;
          const takeIds = rec.champion ? championKillIds(allKills) : allKills;
          if (!takeIds.length) continue;
          nextBonuses = grantAbilityRecast(nextBonuses, entry.name, rec, newBonusId, entry.name);
          takeLog.push(`${entry.seal} «${entry.name}»: recast por ${rec.champion ? 'derribo de campeón' : 'eliminación/asistencia'} ×${rec.times}${rec.turns ? ` ${rec.turns} t.` : ' hasta usarlo'}${rec.max ? ` (máx. ${rec.max})` : ''}`);
          takeChips.push({ kind: 'buff', text: `Recast ${entry.name}`, title: rec.champion ? 'Al derribar campeón' : 'Al matar / asistir' });
        }
        if (takeLog.length) {
          const original = participant.bonuses ?? [];
          await onBonusesSave(nextBonuses);
          seed = { bonuses: nextBonuses, log: [...(seed?.log ?? []), ...takeLog], chips: [...(seed?.chips ?? []), ...takeChips], undos: [...(seed?.undos ?? []), async () => { await onBonusesSave(original); }] };
        }
      }
      if (target) seed = await detonateMarks([target.id], 'aa', undefined, seed);
      const passive: PassiveResult = target ? await passivesFor('on-hit', [target.id], [...kills, ...shotKills], false, undefined, seed) : { note: '' };
      if (target) {
        let waveBonuses = seed?.bonuses ?? participant.bonuses ?? [];
        const waveLog: string[] = [];
        const waveChips: ResultChip[] = [];
        const waveStats = player
          ? { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) }
          : champion
            ? championDamageContext(champion, extra).stats
            : null;
        for (const owner of rows) {
          const before = waveBonuses;
          waveBonuses = ensurePermanentMaxStacks(owner, waveBonuses);
          waveBonuses = syncStackMaxStatus(owner, waveBonuses, waveLog, waveChips);
          const wave = mergedAaWave(owner.ability.mechanics?.levelThresholds, level);
          if (!wave || owner.rank < 1) continue;
          const cfg = owner.ability.mechanics?.stacks;
          const count = hasPermanentMaxStacks(owner.ability.mechanics?.levelThresholds, level) ? (cfg?.max ?? 0) : abilityStacks(waveBonuses, owner.name).count;
          if (wave.requiresMaxStacks && (!cfg || count < cfg.max)) continue;
          if (!waveStats) {
            waveLog.push(`${owner.seal} «${owner.name}»: oleada al AA a mano (sin stats)`);
            continue;
          }
          try {
            const rolled = rollAbilityDamage({ type: wave.type ?? 'magic', ad: wave.ad, ap: wave.ap, adSource: wave.adSource, apSource: wave.apSource }, waveStats, owner.rank);
            if (rolled.total > 0 && onTargetDamage) {
              const typ = wave.type === 'true' ? 'verdadero' : wave.type === 'physical' ? 'físico' : 'mágico';
              const more = await applyToTargets(owner, { ...owner.ability, damage: { ...(owner.ability.damage ?? {}), type: typ } }, rolled.total, [target.id], [], waveLog, { skipEffects: true, lifeSteal: false });
              kills = [...new Set([...kills, ...more])];
              waveLog.push(`${owner.seal} «${owner.name}»: oleada al AA ${fmt(rolled.total)} ${typ} a ${target.name} (la línea / otros enemigos, a mano)`);
              waveChips.push({ kind: 'buff', text: `Oleada ${fmt(rolled.total)}`, title: owner.name });
            }
          } catch (caught) {
            waveLog.push(`${owner.seal} «${owner.name}»: oleada al AA a mano (${caught instanceof Error ? caught.message : 'no se pudo calcular'})`);
          }
        }
        if (waveLog.length || waveChips.length) {
          if (onBonusesSave) await onBonusesSave(waveBonuses);
          if (seed) seed.bonuses = waveBonuses;
          passive.log = [...(passive.log ?? []), ...waveLog];
          passive.chips = [...(passive.chips ?? []), ...waveChips];
        } else if (onBonusesSave) {
          await onBonusesSave(waveBonuses);
          if (seed) seed.bonuses = waveBonuses;
        }
      }
      const finalUse = withPassives(withTargetDamage(use, damage), passive);
      setLastUse(finalUse);
      logCombat({ title: finalUse.headline, lines: finalUse.log ?? [], actor: participant.name });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo aplicar el ataque');
    } finally {
      setBusy(false);
    }
  };

  /** Objetivos elegidos (uno o varios): el mismo daño a cada uno y el efecto enemigo a todos. */
  const detonateMarks = async (targetIds: string[], via: 'aa' | 'ability', used?: AbilityRow, seed?: MechanicsSeed): Promise<MechanicsSeed | undefined> => {
    if (!targetIds.length || !onApplySourcedEffect) return seed;
    const stats = player
      ? { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) }
      : champion
        ? championDamageContext(champion, extra).stats
        : null;
    const next: MechanicsSeed = seed ?? { bonuses: participant.bonuses ?? [], log: [], chips: [], undos: [] };
    let changed = false;
    for (const targetId of targetIds) {
      const who = participants.find(entry => entry.id === targetId);
      if (!who) continue;
      for (const owner of rows) {
        const mark = owner.ability.mechanics?.mark;
        if (!mark || owner.rank < 1) continue;
        if (used && sameAbilityName(used.name, owner.name)) continue;
        const mode = mark.detonateOn ?? 'both';
        if (mode !== 'both' && mode !== via) continue;
        const source = `ability:${owner.name}`;
        const effect = who.effects.find(entry => entry.source === source && (entry.duration ?? 0) > 0);
        if (!effect) continue;
        const snapshot: Record<string, CombatEffect | null> = { [who.id]: effect };
        await onApplySourcedEffect([who.id], { source, name: effect.name, duration: 1, restore: { [who.id]: null } });
        next.undos.push(async () => {
          await onApplySourcedEffect([who.id], { source, name: effect.name, duration: 1, restore: snapshot });
        });
        changed = true;
        const viaLabel = via === 'aa' ? 'AA' : (used ? `${used.seal} «${used.name}»` : 'habilidad');
        next.log.push(`${owner.seal} «${owner.name}»: detona la marca en ${who.name} (${viaLabel})`);
        if (mark.damageOnDetonate !== false && hasDamageScaling(owner.ability.damage)) {
          if (!stats) {
            next.log.push(`${owner.seal} «${owner.name}»: daño de la detonación a mano (sin ficha)`);
          } else {
            try {
              const rolled = rollAbilityDamage(owner.ability.damage!, stats, owner.rank);
              if (rolled.total > 0 && onTargetDamage) {
                await applyToTargets(owner, owner.ability, rolled.total, [who.id], [], next.log, { skipEffects: true, lifeSteal: false });
                next.log.push(`${owner.seal} «${owner.name}»: detonación ${fmt(rolled.total)}${owner.ability.damage?.type ? ` ${owner.ability.damage.type}` : ''} → ${who.name}`);
                next.chips.push({ kind: 'buff', text: `Marca ${fmt(rolled.total)}`, title: `${owner.name} → ${who.name}` });
              }
            } catch (caught) {
              next.log.push(`${owner.seal} «${owner.name}»: detonación a mano (${caught instanceof Error ? caught.message : 'no se pudo calcular'})`);
            }
          }
        }
        if (via === 'ability' && mark.refundMana) {
          const flat = rankValue(mark.refundMana.flat, owner.rank) ?? (mark.refundMana.flat?.[0] ?? 0);
          const costRefund = mark.refundMana.refundCost && used ? (parseAbilityCost(used.ability.cost, used.rank) ?? 0) : 0;
          const amount = Math.round((flat + costRefund) * 1000) / 1000;
          if (amount > 0) {
            if (onPoolChange) {
              const undo = await onPoolChange('mana', amount);
              if (undo) next.undos.push(undo);
              next.log.push(`${owner.seal} «${owner.name}»: restaura ${amount} de maná${costRefund ? ` (${flat} + coste ${costRefund} de «${used!.name}»)` : ''}${undo ? '' : ' · a mano / ya al máximo'}`);
            } else {
              next.log.push(`${owner.seal} «${owner.name}»: restaura ${amount} de maná a mano`);
            }
            next.chips.push({ kind: 'buff', text: `+${amount} maná`, title: owner.name });
          }
        }
      }
    }
    return changed || seed ? next : seed;
  };

  const applyToTargets = async (row: AbilityRow, ability: Ability, amount: number, targetIds: string[], effectIds: string[] = targetIds, logOut?: string[], opts?: { skipEffects?: boolean; lifeSteal?: boolean; effectName?: string; effectDuration?: number; critical?: boolean; damageType?: 'physical' | 'magic' | 'true' }): Promise<string[]> => {
    if (targetIds.length === 0 && effectIds.length === 0) return [];
    let hits = targetIds;
    let fxIds = effectIds;
    if (!opts?.skipEffects && (targetIds.length || effectIds.length)) {
      const blocked = await consumeSpellShields({
        targetIds: [...new Set([...targetIds, ...effectIds])],
        participants,
        effectData,
        level,
        applyEffect: (ids, input) => onApplySourcedEffect(ids, input),
        saveBonuses: async (targetId, nextBonuses) => {
          if (targetId === participant.id) await onBonusesSave?.(nextBonuses);
          else await onTargetBonuses?.(targetId, () => nextBonuses);
        },
      });
      if (blocked.lines.length) {
        logOut?.push(...blocked.lines);
        setLastUse(current => current ? { ...current, log: [...(current.log ?? []), ...blocked.lines] } : current);
      }
      hits = targetIds.filter(id => !blocked.blockedIds.includes(id));
      fxIds = effectIds.filter(id => !blocked.blockedIds.includes(id));
      if (hits.length === 0 && fxIds.length === 0) return [];
    }
    let damaged = false;
    let kills: string[] = [];
    if (amount && onTargetDamage && hits.length > 0) {
      setBusy(true);
      try {
        let totalDealt = 0;
        const hitCount = hits.length;
        const damageKind = opts?.damageType ?? abilityDamageKind(ability);
        const cinderCrit = !opts?.skipEffects && !!crit && (damageKind === 'magic' || damageKind === 'true') && hasCinderbloom(participant, effectData);
        const isCrit = opts?.critical ?? cinderCrit;
        for (const id of hits) {
          const who = participants.find(entry => entry.id === id);
          const reducedPct = incomingDamageReductionPct(who?.bonuses);
          const dealt = reducedPct ? Math.max(0, Math.round(amount * (100 - reducedPct) / 100)) : amount;
          if (reducedPct && who) logOut?.push(`${who.name}: reducción de daño ${reducedPct}% → ${amount} = ${dealt}`);
          const { damage, error: failed, kills: killed, hits: nHits } = await damageTargets(onTargetDamage, [id], dealt, { damageType: damageKind, critical: isCrit, attackerId: participant.id });
          if (killed?.length) kills = [...new Set([...kills, ...killed])];
          if (failed) setError(failed);
          if (damage) {
            damaged = true;
            totalDealt += dealt * (nHits ?? 1);
            setLastUse(current => (current ? withTargetDamage(current, damage) : current));
          }
        }
        if (damaged) {
          // Omnivampirismo siempre; robo de vida si la habilidad tiene «Aplica robo de vida» (× eficacia), salvo pulso de daño por cargas.
          const allowSteal = opts?.lifeSteal !== false;
          const steal = allowSteal ? row.ability.mechanics?.lifeSteal : undefined;
          const vamp = await vampFor(totalDealt || amount * hitCount, !!steal, `${row.seal} «${row.name}»`, steal?.efficacy);
          if (vamp) {
            logOut?.push(...vamp.log);
            setLastUse(current => {
              if (!current) return current;
              const previous = current.undo;
              return { ...current, chips: [...(current.chips ?? []), ...vamp.chips], undo: vamp.undo ? () => { void vamp.undo!().then(() => (previous ? previous() : setLastUse(null))); } : previous };
            });
          }
        }
      } finally {
        setBusy(false);
      }
    }
    if (!damaged) {
      const names = targets.filter(target => hits.includes(target.id)).map(target => target.name).join(', ');
      if (names) setLastUse(current => (current ? { ...current, headline: `${current.headline} → ${names}` } : current));
    }
    const effectDuration = opts?.effectDuration ?? ability.effectDuration;
    const effectName = (opts?.effectName ?? ability.effectName ?? '').trim() || row.name;
    if (opts?.skipEffects || typeof effectDuration !== 'number' || (ability.effectTarget !== 'enemy' && opts?.effectDuration == null) || !(effectDuration > 0) || fxIds.length === 0) return kills;
    const effectValue = rankValue(ability.effect?.[0]?.values, row.rank);
    await onApplySourcedEffect(fxIds, {
      source: `ability:${row.name}`,
      name: effectName,
      duration: effectDuration,
      hasStacks: ability.hasStacks,
      maxStacks: ability.maxStacks,
      ...(effectValue != null ? { value: effectValue } : {}),
    });
    if (isImmobilizeEffectName(effectName) && activeMandateAmp(participant, effectData)) {
      await onApplySourcedEffect(fxIds, { source: 'item:control', name: 'Mandato (+7% daño)', duration: 2, value: 7 });
      logOut?.push(`Mandato: +7% de daño 2 t. a ${fxIds.length} objetivo(s) inmovilizado(s)`);
    }
    const champCc = fxIds.filter(id => {
      const kind = participants.find(entry => entry.id === id)?.kind;
      return id !== participant.id && (kind === 'champion' || kind === 'player');
    });
    if (champCc.length && isCrowdControlEffectName(effectName)) pendingCcGrants.push({ count: champCc.length, effectName });
    return kills;
  };

  const picking = pickingKey ? rows.find(row => row.key === pickingKey) ?? null : null;
  /** «Crít.» antes de aplicar (el player ha sacado crítico): solo daño físico base de la acción. */
  const critToggle = (
    <label className="combat-crit-toggle" title={hasCinderbloom(participant, effectData) ? 'Crítico: físico × DAÑO CRÍT; Llamasombría aplica el 20% de potencia a daño mágico o verdadero si el objetivo está bajo el 40% de vida' : 'Si el player ha sacado crítico (20 natural o la segunda tirada): daño físico × DAÑO CRÍT'}>
      <input type="checkbox" checked={crit} disabled={saving || busy} onChange={e => setCrit(e.target.checked)} />
      Crít.
    </label>
  );
  const isolatedToggle = (
    <label className="combat-crit-toggle" title="El objetivo no tiene aliados cerca (a juicio de mesa): daño y/o ralentización extra">
      <input type="checkbox" checked={isolated} disabled={saving || busy} onChange={e => setIsolated(e.target.checked)} />
      Objetivo aislado
    </label>
  );
  const selfInAreaToggle = (
    <label className="combat-crit-toggle" title="El portador está en el área o la explosión (cura/escudo condicional)">
      <input type="checkbox" checked={selfInArea} disabled={saving || busy} onChange={e => setSelfInArea(e.target.checked)} />
      Estoy en el área
    </label>
  );
  const targets = participants.filter(entry => entry.id !== participant.id);
  const chainPicker = chainAsk && (
    <CombatTargetPicker
      key={`${chainAsk.title}-${chainAsk.primary}`}
      title={chainAsk.title}
      targets={chainAsk.candidates ?? targets}
      initial={chainAsk.primary ? [chainAsk.primary] : []}
      maxTargets={chainAsk.max}
      confirmLabel={chainAsk.confirmLabel ?? 'Descargar'}
      onConfirm={ids => chainAsk.resolve(ids)}
      onSkip={() => chainAsk.resolve(chainAsk.primary ? [chainAsk.primary] : [])}
    />
  );
  const missing = participant.kind === 'player' ? !player : !champion;

  /** Estado del escudo automático: puesto (cuánto dio) o CD que queda. */
  const innateNote = (row: AbilityRow): string => {
    if (!row.ability.mechanics?.innateShield) return '';
    const bonuses = participant.bonuses ?? [];
    const shield = bonuses.find(bonus => bonus.source === innateShieldSource(row.name));
    if (shield) return `Escudo puesto (${shield.amount})`;
    const cd = bonuses.find(bonus => bonus.source === innateCdSource(row.name));
    return cd ? `CD ${fmt(cd.amount)} t. (≈${Math.ceil(cd.amount)})` : 'Se pone al empezar el combate';
  };

  const rowState = (row: AbilityRow, phase?: number) => {
    const ability = applyEvolve(activeAbility(row, phase), isAbilityEvolved(participant.bonuses, row.name));
    const spend = resolvedSpendKind(ability, row.ownerResource ? { resource: row.ownerResource } : undefined);
    const recast = abilityRecast(participant.bonuses, row.name);
    const toggle = row.ability.mechanics?.toggle ? abilityToggle(participant.bonuses, row.name) : undefined;
    const cost = spend.kind === 'none' || recast || toggle ? 0 : stackedAbilityCost(parseAbilityCost(ability.cost, row.rank) ?? 0, participant.bonuses, row.name, ability.mechanics?.costStacks);
    const spendPool = spend.kind === 'none' ? null : currentFor(spend.kind === 'hp' ? 'hp' : 'pool');
    const cdRemaining = player
      ? readCooldown(player.cooldowns, abilityCooldownKey(row.name))
      : readCooldown(participant.cooldowns, abilityCooldownKey(row.name));
    const effectRemaining = player
      ? readActiveEffect(player.activeEffects, abilityActiveEffectKey(row.name))
      : readActiveEffect(participant.activeEffects, abilityActiveEffectKey(row.name));
    // Mecánicas (de la habilidad base): cargas de uso, cargas por impacto necesarias y buff activo.
    const mechanics = row.ability.mechanics;
    const charges = abilityCharges(row.ability, participant.bonuses, row.name);
    const ownStacks = mechanics?.stacks ? abilityStacks(participant.bonuses, row.name) : { count: 0 };
    const need = stacksRequirement(ability.mechanics, row.name);
    const needStacks = need ? { count: stacksFor(need.name) } : { count: 0 };
    const permanentCount = (row.ability.hasStacks || row.ability.mechanics?.permanentStacks) ? stacksFor(row.name) : undefined;
    const buff = mechanics?.buff ? abilityBuff(participant.bonuses, row.name) : undefined;
    const shots = mechanics?.sectorShots ? sectorShotState(participant.bonuses, row.name, mechanics.sectorShots.count) : undefined;
    const empowered = mechanics?.empoweredAa ? empoweredAaState(participant.bonuses, row.name) : undefined;
    const trap = mechanics?.trap ? abilityTrap(participant.bonuses, row.name) : undefined;
    const mechanicsNote = [
      charges ? `Cargas ${charges.left}/${charges.max}${charges.left < charges.max && charges.recharge ? ` · recarga ${charges.recharge} t.` : ''}` : '',
      mechanics?.stacks ? `Cargas ${ownStacks.count}/${mechanics.stacks.max}${ownStacks.turns ? ` · ${ownStacks.turns} t.` : ''}` : '',
      permanentCount !== undefined ? `Cargas permanentes ${permanentCount}${row.ability.maxStacks ? `/${row.ability.maxStacks}` : ''}` : '',
      need && need.name !== row.name ? `Cargas de «${need.name}» ${needStacks.count}/${need.count}` : '',
      shots ? `Disparos ${shots.ready}/${mechanics!.sectorShots!.count}${shots.nextRecharge ? ` · próximo en ${shots.nextRecharge} t.` : ''}${(mechanics!.sectorShots!.labels ?? []).length ? ` (${mechanics!.sectorShots!.labels!.join(', ')})` : ''}` : '',
      (participant.bonuses ?? []).some(bonus => bonus.source === sectorGapSource(row.name) && (bonus.turns ?? 0) > 0) ? `Intervalo ${(participant.bonuses ?? []).find(bonus => bonus.source === sectorGapSource(row.name))?.turns} t.` : '',
      toggle ? `Interruptor ON${toggle.turns ? ` ${toggle.turns} t.` : ' (hasta desactivar)'}${mechanics?.toggle?.fixedAttacks || mechanics?.selfStatus?.fixedAttacks ? ` · ataques fijos ${mechanics.toggle?.fixedAttacks ?? mechanics.selfStatus?.fixedAttacks}` : ''}` : '',
      buff && !toggle ? `Activa ${buff.turns ?? '—'} t.` : '',
      recast ? `Recast gratis ×${recast.amount}${typeof recast.turns === 'number' ? ` · ${recast.turns} t.` : ' · hasta usarlo'}` : '',
      mechanics?.execute ? `Execute ≤ ${mechanics.execute.hpPct}% vida máx.` : '',
      innateNote(row),
      pendingHeal(row) ? `Cura pendiente ${pendingHeal(row)!.amount} · ${pendingHeal(row)!.turns ?? '—'} t.` : '',
      empowered ? (empowered.ready ? 'AA potenciado listo' : empowered.turns ? `AA potenciado CD ${empowered.turns} t.` : '') : '',
      trap ? `${trap.label ?? mechanics?.trap?.name ?? 'Efecto retrasado'} ${trap.turns ?? '—'} t.` : '',
      mechanics?.costHpMaxPct ? `Coste ${mechanics.costHpMaxPct}% vida máx.` : '',
      isAbilityEvolved(participant.bonuses, row.name) && row.ability.mechanics?.evolve ? `Evolucionado: ${row.ability.mechanics.evolve.name}` : '',
      abilityArmedAaMarker(participant.bonuses, row.name) ? 'AA armado' : '',
      ability.mechanics?.costStacks ? `Acum. coste ${abilityCostStackCount(participant.bonuses, row.name)}/${ability.mechanics.costStacks.max} (+${ability.mechanics.costStacks.amount})` : '',
      abilityDeathBurst(participant.bonuses, row.name) ? `${ability.mechanics?.deathBurst?.name ?? 'Zombi'} ${abilityDeathBurst(participant.bonuses, row.name)!.turns ?? '—'} t.` : '',
      abilityAaOnHitActive(participant.bonuses, row.name, ability.mechanics?.aaOnHit, row.rank) && ability.mechanics?.aaOnHit ? (ability.mechanics.aaOnHit.always ? 'AA con daño extra' : 'AA con daño de vida') : '',
    ].filter(Boolean).join(' · ');
    let disabledReason: string | undefined;
    if (participant.defeated) disabledReason = 'Está derrotado';
    else if (toggle || (mechanics?.selfStatus?.cancelable && (participant.effects.some(effect => effect.source === `ability:${row.name}`) || (participant.bonuses ?? []).some(bonus => bonus.source === abilitySelfStatSource(row.name) || bonus.source === abilitySelfDrSource(row.name))))) disabledReason = undefined;
    else if (mechanics?.innateShield) disabledReason = `Automática: ${innateNote(row)}`;
    else if (left.abilities === 0 && !mechanics?.noAction) disabledReason = 'Sin habilidades este turno';
    else if (row.rank < 1) disabledReason = 'Habilidad sin aprender (rango 0)';
    else if (charges && charges.left <= 0) disabledReason = `Sin cargas (0/${charges.max}${charges.recharge ? ` · recarga en ${charges.recharge} t.` : ''})`;
    else if (need && needStacks.count < need.count) disabledReason = `Necesita ${need.count} cargas de «${need.name}» (${needStacks.count}/${need.count})`;
    else if (shots && (sectorShotTrigger(mechanics!.sectorShots!) === 'cast' || sectorShotTrigger(mechanics!.sectorShots!) === 'both') && shots.ready <= 0) disabledReason = `Ninguna dirección lista (0/${mechanics!.sectorShots!.count})`;
    else if ((participant.bonuses ?? []).some(bonus => bonus.source === sectorGapSource(row.name) && (bonus.turns ?? 0) > 0)) disabledReason = `Intervalo entre dashes (${(participant.bonuses ?? []).find(bonus => bonus.source === sectorGapSource(row.name))?.turns} t.)`;
    else if (buff) disabledReason = `Ya activa (${buff.turns ?? '—'} t.)`;
    else if (activeEffectOf(row) && (!recast || ability.mechanics?.selfStatus?.blocksRecast) && mechanics?.selfStatus?.blocksAbility !== false) disabledReason = activeEffectOf(row);
    else if (spendPool && cost > spendPool.current) {
      disabledReason = `No hay ${spend.label.toLowerCase()} suficiente (${spendPool.current}/${spendPool.max})`;
    } else if (mechanics?.costHpMinCurrentPct) {
      const life = currentFor('hp');
      if (life?.max && (life.current / life.max) * 100 < mechanics.costHpMinCurrentPct) {
        disabledReason = `No se puede usar por debajo del ${mechanics.costHpMinCurrentPct}% de vida máx. (${life.current}/${life.max})`;
      }
    }
    const ending = !toggle && mechanics?.selfStatus?.cancelable && (participant.effects.some(effect => effect.source === `ability:${row.name}`) || (participant.bonuses ?? []).some(bonus => bonus.source === abilitySelfStatSource(row.name) || bonus.source === abilitySelfDrSource(row.name)));
    return { spend, cost, spendPool, cdRemaining, effectRemaining, disabledReason, mechanicsNote, useLabel: toggle ? 'Desactivar' : ending ? 'Terminar' : recast ? 'Recast' : 'Usar' };
  };

  if (variant === 'sheet') {
    const canTrack = canSeeHp && !saving && !busy;
    const toneOf = (seal: string): Exclude<SpellTone, 'auto'> => (seal === 'P' ? 'pasiva' : seal === 'R' ? 'definitiva' : 'basica');
    const pips = (rank: number, max: number) => (
      <div className="sheet-rank__pips" aria-label={`Rango ${rank} de ${max}`}>
        {Array.from({ length: max }, (_, index) => (
          <span key={index} className={cx('sheet-rank__pip', index < rank && 'sheet-rank__pip--on')} />
        ))}
      </div>
    );
    // Players: sus ataques básicos; campeones: uno según su rol (AP para magos / AP, si no AD).
    const basic: { type: 'AD' | 'AP'; scaling?: number[] }[] = player
      ? basicAttackEntries(player.basicAttack).map(entry => ({ type: entry.type === 'AP' ? 'AP' as const : 'AD' as const, scaling: entry.scaling }))
      : champion
        ? [{ type: /mago|ap\b|-ap/i.test(`${champion.roleId ?? ''} ${champion.role ?? ''}`) ? 'AP' as const : 'AD' as const }]
        : [];
    const canEditActions = (isAdmin || canSeeHp) && !!onActionsSave;
    const counter = (kind: 'attacks' | 'abilities') => {
      const max = baseLimits[kind];
      const value = left[kind];
      const extra = extras[kind];
      const noun = kind === 'attacks' ? 'ataque' : 'habilidad';
      return (
        <span className={cx('combat-actions', value === 0 && 'combat-actions--empty')} title={max === undefined ? 'Sin dato de acciones por turno en la ficha' : 'Quedan este turno'}>
          {isAdmin && max !== undefined && (
            <button type="button" className="sheet-rank__btn" disabled={saving || busy || (value ?? 0) <= 0} aria-label={`Quitar 1 (${kind === 'attacks' ? 'ataques' : 'habilidades'})`} onClick={() => setActions(kind, (value ?? 0) - 1)}>−</button>
          )}
          <span>Quedan {max === undefined ? '—' : `${value}/${max}${extra > 0 ? ` (+${extra})` : ''}`}</span>
          {isAdmin && max !== undefined && (
            <button type="button" className="sheet-rank__btn" disabled={saving || busy || (value ?? 0) >= (limits[kind] ?? max)} aria-label={`Añadir 1 (${kind === 'attacks' ? 'ataques' : 'habilidades'})`} onClick={() => setActions(kind, (value ?? 0) + 1)}>+</button>
          )}
          {canEditActions && max !== undefined && (
            <button
              type="button"
              className="combat-actions__extra"
              disabled={actionsBusy || participant.defeated}
              title={`Clic: +1 ${noun} extra este turno · Clic derecho: quitar un extra`}
              onClick={() => addExtra(kind)}
              onContextMenu={event => { event.preventDefault(); removeExtra(kind); }}
            >
              + Extra
            </button>
          )}
          {canEditActions && max !== undefined && extra > 0 && (
            <button type="button" className="combat-actions__extra" disabled={actionsBusy} title={`Quitar un ${noun} extra`} onClick={() => removeExtra(kind)}>
              − Extra
            </button>
          )}
        </span>
      );
    };
    const attackBlocked = participant.defeated ? 'Está derrotado' : left.attacks === 0 ? 'Sin ataques este turno' : undefined;
    return (
      <>
        {(player || champion) && (
          <section className="sheet-panel">
            <div className="sheet-panel__title sheet-abilities__title">
              <span>Auto-ataques</span>
              {counter('attacks')}
            </div>
            <div className="spell-grid spell-grid--auto">
              {basic.length > 0 ? basic.map((entry, index) => (
                <SpellCard
                  key={entry.type + '-' + index}
                  tone="auto"
                  seal="AA"
                  type={entry.type === 'AP' ? 'Daño mágico' : 'Daño físico'}
                  name={`Ataque básico ${entry.type}`}
                  note={isAdmin ? attackBlocked ?? `Clic: atacar (${entry.type === 'AP' ? `AP × ${Math.round(basicAttackPct('AP', player ? level : champion ? championDamageContext(champion, extra).level : level, entry.scaling) * 1000) / 10}%` : 'AD total'})` : undefined}
                  onOpen={isAdmin && !attackBlocked && !locked ? () => { setAttackPick(entry.type); cancelPicking(); } : undefined}
                />
              )) : <div className="spell-grid__empty">Sin ataque básico definido</div>}
            </div>
            {attackPick && (
              <div className="combat-panel__picker">
                <p className="combat-panel__picker-title">Objetivo del ataque básico {attackPick}</p>
                {attackPick === 'AD' && critToggle}
                <ul className="combat-panel__picker-list">
                  {targets.map(target => (
                    <li key={target.id}>
                      <button type="button" className="combat-panel__picker-item" disabled={saving || busy} onClick={() => void basicAttack(attackPick, target)}>
                        {target.image ? <img src={target.image} alt="" width={28} height={28} /> : <span className="combat-panel__picker-fallback" aria-hidden>⚔</span>}
                        <span>{target.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="combat-btn combat-btn--small" disabled={saving || busy} onClick={() => void basicAttack(attackPick, null)}>Sin objetivo</button>
                <button type="button" className="combat-btn combat-btn--small" onClick={() => { setAttackPick(null); setCrit(false); setIsolated(false); setSelfInArea(false); }}>Cancelar</button>
              </div>
            )}
          </section>
        )}
        <section className="sheet-panel">
          <div className="sheet-panel__title sheet-abilities__title">
            <span>Habilidades</span>
            {counter('abilities')}
          </div>
          {missing && <p className="combat-page__hint">No se encontró la ficha de origen.</p>}
          {!missing && rows.length === 0 && <p className="combat-page__hint">Sin habilidades.</p>}
          {rows.length > 0 && (
            <div className="spell-grid">
              {rows.map(row => {
                const state = rowState(row);
                const active = activeAbility(row);
                const phased = hasVariants(row.ability);
                const choose = isChoosePhases(row.ability);
                const labels = phased ? phaseLabels(row.ability) : [];
                const tone = toneOf(row.seal);
                const resolved = resolveAbilityResource(active, row.ownerResource ? { resource: row.ownerResource } : undefined);
                const costLabel = state.cost > 0 ? `Coste ${state.cost}` : active.cost?.trim() ? `Coste ${active.cost.trim()}` : '';
                const note = [costLabel, state.effectRemaining > 0 ? `Efecto ${state.effectRemaining}` : '', state.mechanicsNote].filter(Boolean).join(' · ') || undefined;
                const cdKey = abilityCooldownKey(row.name);
                const stackKey = abilityStackKey(row.name);
                const ranks = isAdmin && row.rankAdjustable ? (
                  <div className="sheet-rank">
                    <button type="button" className="sheet-rank__btn" disabled={locked || row.rank <= 0} aria-label={`Bajar rango de ${row.seal}`} onClick={() => setRank(row.key, row.rank - 1)}>−</button>
                    {pips(row.rank, slotPipCount(row.seal))}
                    <button type="button" className="sheet-rank__btn" disabled={locked || row.rank >= row.maxRank} aria-label={`Subir rango de ${row.seal}`} onClick={() => setRank(row.key, row.rank + 1)}>+</button>
                  </div>
                ) : <div className="sheet-rank sheet-rank--auto">{pips(row.rank, slotPipCount(row.seal))}</div>;
                return (
                  <SpellCard
                    key={row.key}
                    tone={tone}
                    seal={row.seal}
                    type={SPELL_TYPE_LABEL[tone]}
                    name={row.name}
                    image={row.image}
                    note={note}
                    area={row.ability.area}
                    onHit={row.ability.appliesOnHit === true}
                    badge={resolved ? <ResourceChip resource={resolved.id} inherited={resolved.inherited} /> : undefined}
                    ranks={ranks}
                    stacks={player && row.ability.hasStacks ? (
                      <StackCounter
                        value={readStack(player.stacks, stackKey)}
                        max={typeof row.ability.maxStacks === 'number' ? row.ability.maxStacks : undefined}
                        disabled={!canTrack}
                        label={`Stacks · ${row.name}`}
                        onChange={next => { void onPlayerPatch(player.name, { stacks: { ...player.stacks, [stackKey]: next } }); }}
                      />
                    ) : undefined}
                    // Sin CD: las habilidades se bloquean mientras dura su efecto (ver «Efecto activo»).
                    action={isAdmin ? (
                      <div className="combat-spell__use">
                        {phased && !choose && (
                          <PhaseTabs small className="combat-panel__phases" labels={labels} active={phaseOf(row)} disabled={saving || busy} onSelect={index => selectPhase(row, index)} />
                        )}
                        {choose ? labels.map((label, index) => {
                          const phaseState = rowState(row, index);
                          return (
                            <button key={index} type="button" className="combat-btn combat-btn--small combat-btn--gold" disabled={locked || !!phaseState.disabledReason} title={phaseState.disabledReason ?? `Usar ${row.seal} · ${label}`} onClick={() => { void useAbility(row, index); }}>
                              {label}
                            </button>
                          );
                        }) : (
                          <button type="button" className="combat-btn combat-btn--small combat-btn--gold" disabled={locked || !!state.disabledReason} title={state.disabledReason ?? `${state.useLabel} ${row.seal}`} onClick={() => { void useAbility(row); }}>
                            {state.useLabel}
                          </button>
                        )}
                        {pendingHeal(row) && (
                          <button type="button" className="combat-btn combat-btn--small" disabled={locked} title={`Cura pendiente ${pendingHeal(row)!.amount} (vence en ${pendingHeal(row)!.turns ?? '—'} t.)`} onClick={() => { void healNow(row); }}>
                            Curar ahora
                          </button>
                        )}
                        {spellShieldUp(row) && (
                          <button type="button" className="combat-btn combat-btn--small" disabled={locked} title={`Romper «${row.ability.mechanics?.spellShield?.status}»: bonus por tenerla aprendida × ${row.ability.mechanics?.spellShield?.learnedMultiplier} durante ${row.ability.mechanics?.spellShield?.breakTurns} t.`} onClick={() => { void breakSpellShield(row); }}>
                            Romper escudo
                          </button>
                        )}
                        {abilityTrap(participant.bonuses, row.name) && (
                          <button type="button" className="combat-btn combat-btn--small" disabled={locked} title={`Detonar ${row.ability.mechanics?.trap?.name ?? row.name}`} onClick={() => setTrapPicking(row)}>
                            Detonar
                          </button>
                        )}
                        {row.ability.mechanics?.empoweredAa?.reduceOnStruck && empoweredAaState(participant.bonuses, row.name).turns ? (
                          <button type="button" className="combat-btn combat-btn--small" disabled={locked} title={`Quita ${row.ability.mechanics.empoweredAa.reduceOnStruck} t. al CD del AA potenciado`} onClick={() => { void reduceEmpoweredStruck(row); }}>
                            Le han lanzado una habilidad
                          </button>
                        ) : null}
                        {row.ability.mechanics?.armedAa ? (
                          <button type="button" className="combat-btn combat-btn--small" disabled={locked || row.rank < 1 || !!abilityArmedAaMarker(participant.bonuses, row.name)} title={abilityArmedAaMarker(participant.bonuses, row.name) ? 'AA armado: el siguiente ataque a un campeón gasta el armado' : 'Armar el siguiente AA a un campeón (sin visión / invisibilidad)'} onClick={() => { void armArmed(row); }}>
                            {abilityArmedAaMarker(participant.bonuses, row.name) ? 'Armado' : 'Armar'}
                          </button>
                        ) : null}
                        {row.ability.mechanics?.evolve ? (
                          <button type="button" className="combat-btn combat-btn--small" disabled={locked || (!isAbilityEvolved(participant.bonuses, row.name) && evolvedAbilityCount(participant.bonuses, rows) >= evolutionSlotCount(rows))} title={isAbilityEvolved(participant.bonuses, row.name) ? `Quitar evolución «${row.ability.mechanics.evolve.name}»` : `Evolucionar a «${row.ability.mechanics.evolve.name}» (${evolvedAbilityCount(participant.bonuses, rows)}/${evolutionSlotCount(rows)})`} onClick={() => { void toggleEvolve(row); }}>
                            {isAbilityEvolved(participant.bonuses, row.name) ? `Evolucionado: ${row.ability.mechanics.evolve.name}` : `Evolucionar: ${row.ability.mechanics.evolve.name}`}
                          </button>
                        ) : null}
                        {row.ability.mechanics?.deathBurst && !abilityDeathBurst(participant.bonuses, row.name) ? (
                          <button type="button" className="combat-btn combat-btn--small" disabled={locked || row.rank < 1} title="Activar el estado zombi al recibir daño letal" onClick={() => { void startDeathBurst(row); }}>
                            Al morir
                          </button>
                        ) : null}
                        {row.ability.mechanics?.deathBurst && abilityDeathBurst(participant.bonuses, row.name) ? (
                          <button type="button" className="combat-btn combat-btn--small" disabled={locked} title="Explotar: daño del área (si la base plana se omitió, a mano)" onClick={() => { void explodeDeathBurst(row); }}>
                            Explotar
                          </button>
                        ) : null}
                      </div>
                    ) : phased && !choose ? (
                      <PhaseTabs small className="combat-panel__phases" labels={labels} active={phaseOf(row)} disabled={saving || busy} onSelect={index => selectPhase(row, index)} />
                    ) : undefined}
                    phases={choose ? labels : undefined}
                    phasesChoose={choose}
                  />
                );
              })}
            </div>
          )}
          {lastUse && <UseResultCard use={lastUse} disabled={saving || busy} onUndo={undoLastUse} />}
          {error && <p className="combat-page__error">{error}</p>}
          {picking && abilityIsPhysical(pickingAbility ?? picking.ability) && hasDamageScaling((pickingAbility ?? picking.ability).damage) && critToggle}
          {picking && (pickingAbility ?? picking.ability).mechanics?.isolated && isolatedToggle}
          {picking && (pickingAbility ?? picking.ability).mechanics?.castPool?.requiresSelfInArea && selfInAreaToggle}
          {picking && (
            <CombatTargetPicker
              key={picking.key}
              title={`Objetivos de ${(pickingAbility ?? picking.ability).effectName || picking.name}`}
              targets={targets}
              disabled={saving || busy}
              onConfirm={ids => void runAbility(picking, pickingPhase, ids)}
              onSkip={() => void runAbility(picking, pickingPhase, [])}
              onCancel={cancelPicking}
            />
          )}
          {trapPicking && (
            <CombatTargetPicker
              key={`trap-${trapPicking.key}`}
              title={`Detonar ${trapPicking.ability.mechanics?.trap?.name ?? trapPicking.name}`}
              targets={targets}
              disabled={saving || busy}
              onConfirm={ids => { const current = trapPicking; setTrapPicking(null); void detonateTrap(current, ids); }}
              onSkip={() => { const current = trapPicking; setTrapPicking(null); void detonateTrap(current, []); }}
              onCancel={() => setTrapPicking(null)}
            />
          )}
          {chainPicker}
        </section>
      </>
    );
  }

  return (
    <div className="combat-panel__section">
      {showBar && pool && (pool.kind !== 'hp' || canSeeHp) && (
        <>
          <h3 className="combat-panel__label">{pool.label}</h3>
          <div className="combat-resource">
            <div className="combat-resource__head">
              <span>{pool.current} / {pool.max}</span>
              {canSeeHp && (
                <span className="combat-resource__steps">
                  <button
                    type="button"
                    className="combat-btn combat-btn--small"
                    disabled={barLocked || pool.current <= 0}
                    aria-label={`Quitar 1 de ${pool.label}`}
                    onClick={() => adjustBar(-1)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="combat-btn combat-btn--small"
                    disabled={barLocked || pool.current >= pool.max}
                    aria-label={`Añadir 1 de ${pool.label}`}
                    onClick={() => adjustBar(1)}
                  >
                    +
                  </button>
                </span>
              )}
            </div>
            <div className="combat-resource__track" aria-hidden="true">
              <div
                className={cx('combat-resource__fill', pool.kind === 'hp' && 'combat-resource__fill--hp', pool.kind === 'pool' && pool.resourceId && pool.resourceId !== 'mana' && `combat-resource__fill--${pool.resourceId}`)}
                style={{ width: `${pool.max > 0 ? Math.min(100, Math.round((pool.current / pool.max) * 100)) : 0}%` }}
              />
            </div>
          </div>
          {canSeeHp && (
            <BarInputs
              key={`${participant.id}-${pool.kind}`}
              current={pool.current}
              max={pool.max}
              editMax={!!player}
              disabled={barLocked}
              onSave={(current, max) => setBar(current, max)}
              onError={setError}
            />
          )}
        </>
      )}

      <h3 className="combat-panel__label">Habilidades</h3>
      {missing && <p className="combat-page__hint">No se encontró la ficha de origen.</p>}
      {!missing && rows.length === 0 && <p className="combat-page__hint">Sin habilidades.</p>}
      {rows.length > 0 && (
        <ul className="combat-panel__trackers">
          {rows.map(row => {
            const state = rowState(row);
            const active = activeAbility(row);
            const phased = hasVariants(row.ability);
            const choose = isChoosePhases(row.ability);
            const labels = phased ? phaseLabels(row.ability) : [];
            const costLabel = state.cost > 0
              ? `${state.cost} ${state.spend.label}`
              : active.cost?.trim() || undefined;
            return (
              <li key={row.key} className="combat-panel__ability">
                <span className="combat-panel__ability-seal" aria-hidden>{row.seal}</span>
                <span className="combat-panel__tracker-name" title={row.name}>{row.name}</span>
                <span className="combat-panel__tracker-badges">
                  {costLabel && <span className="combat-panel__badge" title="Coste">{costLabel}</span>}
                  {state.effectRemaining > 0 && (
                    <span className="combat-panel__badge combat-panel__badge--effect" title="Efecto">
                      Efecto {state.effectRemaining}
                    </span>
                  )}
                  {state.mechanicsNote && (
                    <span className="combat-panel__badge combat-panel__badge--effect" title="Cargas / buff de la habilidad">
                      {state.mechanicsNote}
                    </span>
                  )}
                  {isAdmin && row.rankAdjustable && (
                    <span className="combat-panel__rank">
                      <button
                        type="button"
                        className="combat-btn combat-btn--small"
                        disabled={locked || row.rank <= 0}
                        aria-label={`Bajar rango de ${row.seal}`}
                        onClick={() => setRank(row.key, row.rank - 1)}
                      >
                        −
                      </button>
                      <span title={`Rango ${row.rank}`}>{row.rank}</span>
                      <button
                        type="button"
                        className="combat-btn combat-btn--small"
                        disabled={locked || row.rank >= row.maxRank}
                        aria-label={`Subir rango de ${row.seal}`}
                        onClick={() => setRank(row.key, row.rank + 1)}
                      >
                        +
                      </button>
                    </span>
                  )}
                  {isAdmin && !choose && (
                    <button
                      type="button"
                      className="combat-btn combat-btn--small combat-panel__activate"
                      disabled={locked || !!state.disabledReason}
                      title={state.disabledReason ?? `Usar ${row.seal}`}
                      onClick={() => { void useAbility(row); }}
                    >
                      {state.useLabel}
                    </button>
                  )}
                  {isAdmin && pendingHeal(row) && (
                    <button type="button" className="combat-btn combat-btn--small combat-panel__activate" disabled={locked} title={`Cura pendiente ${pendingHeal(row)!.amount}`} onClick={() => { void healNow(row); }}>
                      Curar ahora
                    </button>
                  )}
                  {isAdmin && spellShieldUp(row) && (
                    <button type="button" className="combat-btn combat-btn--small combat-panel__activate" disabled={locked} title={`Romper «${row.ability.mechanics?.spellShield?.status}»`} onClick={() => { void breakSpellShield(row); }}>
                      Romper escudo
                    </button>
                  )}
                  {isAdmin && abilityTrap(participant.bonuses, row.name) && (
                    <button type="button" className="combat-btn combat-btn--small combat-panel__activate" disabled={locked} title={`Detonar ${row.ability.mechanics?.trap?.name ?? row.name}`} onClick={() => setTrapPicking(row)}>
                      Detonar
                    </button>
                  )}
                  {isAdmin && row.ability.mechanics?.empoweredAa?.reduceOnStruck && empoweredAaState(participant.bonuses, row.name).turns ? (
                    <button type="button" className="combat-btn combat-btn--small combat-panel__activate" disabled={locked} title={`Quita ${row.ability.mechanics.empoweredAa.reduceOnStruck} t. al CD del AA potenciado`} onClick={() => { void reduceEmpoweredStruck(row); }}>
                      Le han lanzado una habilidad
                    </button>
                  ) : null}
                  {row.ability.mechanics?.armedAa ? (
                    <button type="button" className="combat-btn combat-btn--small combat-panel__activate" disabled={locked || row.rank < 1 || !!abilityArmedAaMarker(participant.bonuses, row.name)} title={abilityArmedAaMarker(participant.bonuses, row.name) ? 'AA armado: el siguiente ataque a un campeón gasta el armado' : 'Armar el siguiente AA a un campeón (sin visión / invisibilidad)'} onClick={() => { void armArmed(row); }}>
                      {abilityArmedAaMarker(participant.bonuses, row.name) ? 'Armado' : 'Armar'}
                    </button>
                  ) : null}
                  {row.ability.mechanics?.evolve ? (
                    <button type="button" className="combat-btn combat-btn--small combat-panel__activate" disabled={locked || (!isAbilityEvolved(participant.bonuses, row.name) && evolvedAbilityCount(participant.bonuses, rows) >= evolutionSlotCount(rows))} title={isAbilityEvolved(participant.bonuses, row.name) ? `Quitar evolución «${row.ability.mechanics.evolve.name}»` : `Evolucionar a «${row.ability.mechanics.evolve.name}» (${evolvedAbilityCount(participant.bonuses, rows)}/${evolutionSlotCount(rows)})`} onClick={() => { void toggleEvolve(row); }}>
                      {isAbilityEvolved(participant.bonuses, row.name) ? `Evolucionado: ${row.ability.mechanics.evolve.name}` : `Evolucionar: ${row.ability.mechanics.evolve.name}`}
                    </button>
                  ) : null}
                  {row.ability.mechanics?.deathBurst && !abilityDeathBurst(participant.bonuses, row.name) ? (
                    <button type="button" className="combat-btn combat-btn--small combat-panel__activate" disabled={locked || row.rank < 1} title="Activar el estado zombi al recibir daño letal" onClick={() => { void startDeathBurst(row); }}>
                      Al morir
                    </button>
                  ) : null}
                  {row.ability.mechanics?.deathBurst && abilityDeathBurst(participant.bonuses, row.name) ? (
                    <button type="button" className="combat-btn combat-btn--small combat-panel__activate" disabled={locked} title="Explotar: daño del área (si la base plana se omitió, a mano)" onClick={() => { void explodeDeathBurst(row); }}>
                      Explotar
                    </button>
                  ) : null}
                </span>
                {choose && (
                  <span className="combat-panel__phase-uses">
                    {labels.map((label, index) => {
                      const phaseState = rowState(row, index);
                      return (
                        <button
                          key={index}
                          type="button"
                          className="combat-btn combat-btn--small combat-panel__activate"
                          disabled={locked || !!phaseState.disabledReason}
                          title={phaseState.disabledReason ?? `Usar ${row.seal} · ${label}`}
                          onClick={() => { void useAbility(row, index); }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </span>
                )}
                {phased && !choose && (
                  <PhaseTabs
                    small
                    className="combat-panel__phases"
                    labels={labels}
                    active={phaseOf(row)}
                    disabled={saving || busy}
                    onSelect={index => selectPhase(row, index)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {lastUse && <UseResultCard use={lastUse} disabled={saving || busy} onUndo={undoLastUse} />}
      {error && <p className="combat-page__error">{error}</p>}

      {picking && abilityIsPhysical(pickingAbility ?? picking.ability) && hasDamageScaling((pickingAbility ?? picking.ability).damage) && critToggle}
      {picking && (
        <CombatTargetPicker
          key={picking.key}
          title={`Objetivos de ${(pickingAbility ?? picking.ability).effectName || picking.name}`}
          targets={targets}
          disabled={saving || busy}
          onConfirm={ids => void runAbility(picking, pickingPhase, ids)}
          onSkip={() => void runAbility(picking, pickingPhase, [])}
          onCancel={cancelPicking}
        />
      )}
      {trapPicking && (
        <CombatTargetPicker
          key={`trap-${trapPicking.key}`}
          title={`Detonar ${trapPicking.ability.mechanics?.trap?.name ?? trapPicking.name}`}
          targets={targets}
          disabled={saving || busy}
          onConfirm={ids => { const current = trapPicking; setTrapPicking(null); void detonateTrap(current, ids); }}
          onSkip={() => { const current = trapPicking; setTrapPicking(null); void detonateTrap(current, []); }}
          onCancel={() => setTrapPicking(null)}
        />
      )}
      {chainPicker}
    </div>
  );
}

/** Resultado de la última acción: línea principal + un chip por efecto. */
function UseResultCard({ use, disabled, onUndo }: { use: LastUse; disabled: boolean; onUndo: () => void }) {
  return (
    <div className="combat-panel__use-result use-card" aria-live="polite">
      <div className="use-card__main">
        <p className="combat-panel__use-headline use-card__headline" title={use.detail}>{use.headline}</p>
        {use.undo && (
          <button type="button" className="combat-btn combat-btn--small" disabled={disabled} onClick={onUndo}>Deshacer</button>
        )}
      </div>
      {use.detail && <p className="combat-panel__use-detail use-card__detail">🎲 {use.detail}</p>}
      {use.chips && use.chips.length > 0 && (
        <ul className="use-card__chips">
          {use.chips.map((chip, index) => (
            <li key={index} className={`use-chip use-chip--${chip.kind}`} title={chip.title}>
              <span className="use-chip__icon" aria-hidden>{CHIP_ICON[chip.kind]}</span>
              {chip.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
