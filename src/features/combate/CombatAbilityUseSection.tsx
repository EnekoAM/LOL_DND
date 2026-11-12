import { useEffect, useMemo, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { BASIC_MAX_RANK, MILESTONE_RANKS, ULT_MAX_RANK, milestoneRank, normalizeRanks, type RankedSlot } from '../../data/abilityRanks';
import { ABILITY_KEYS, findAbilityRef, type Ability, type Champion } from '../../data/champions';
import { participantChampion } from '../../data/combatSheet';
import type { CombatBonus, CombatEffect, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { firePassives, newBonusId, type PassiveResult } from './combatBonuses';
import { abilityBreakSource, abilityBuff, abilityBuffSource, abilityBuffStatSource, abilityCharges, abilityRecast, abilityRecastSource, abilityShieldSource, abilityStacks, abilityStacksSource, gainAbilityStack, passiveStatus, rankValue, reduceChargeRecharge, spendAbilityCharge } from '../../data/abilityMechanics';
import { participantHpPools } from './combatHp';
import { innateCdSource, innateShieldSource, pendingHealSource, reduceInnateCooldowns } from './innateShield';
import { CHIP_ICON, fmt, rollText, type ResultChip } from './combatResult';
import { logCombat } from './combatConsole';
import { critMultiplier, effectiveResistLine, hitRollLines } from './combatMitigation';
import { permanentStackSaver } from '../../data/permanentStacks';
import { useNamedEffectDescriptions } from '../../data/namedEffectDescriptions';
import { participantAbilities } from './abilityRules';
import { abilityDischargesVigor, vigorChainTargets, activeNamedEffects, armAfterAbility, combatExtraLines, fireEffectRules, hasVigorItem, participantContext, poolAmount, vampHeal, vigorEffects, type EffectCallbacks, type EffectTriggerName } from './effectRules';
import { VIGOR_MAX, VIGOR_PER_AA } from '../../data/combat';
import { partyLevel, subscribeParty } from '../../data/party';
import { PLAYERS, PLAYER_ABILITY_SLOTS, type Player, type PlayerListPatch } from '../../data/players';
import { championResourceBar, type ResourceId } from '../../data/resources';
import { abilityActiveEffectKey, abilityCooldownKey, readActiveEffect, readCooldown } from '../../data/stacks';
import { cx } from '../../lib/cx';
import { abilityPhase, abilityPhaseCount, abilityPhaseKey, clampPhase, hasVariants, isChoosePhases, phaseLabels } from '../../data/abilityVariants';
import PhaseTabs from '../habilidades/PhaseTabs';
import ResourceChip from '../../components/ResourceChip';
import { resolveAbilityResource } from '../../data/resources';
import { abilityStackKey, readStack } from '../../data/stacks';
import { basicAttackEntries } from '../../data/players';
import SpellCard, { SPELL_TYPE_LABEL, type SpellTone } from '../players/SpellCard';
import StackCounter from '../players/StackCounter';
import CooldownControl from '../players/CooldownControl';
import { BarInputs } from './CombatBar';
import { actionLimits, actionsLeft, basicAttackPct } from './combatActions';
import { damageTargets, targetHpLine, type TargetDamageFn } from './combatHp';
import CombatTargetPicker from './CombatTargetPicker';
import { rollDamageStat } from '../players/abilityDamage';
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
type MechanicsSeed = { bonuses: CombatBonus[]; log: string[]; chips: ResultChip[]; undos: (() => Promise<void>)[] };

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
  return Math.min(maxRank, Math.max(1, Math.floor(value)));
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
  /** «Crít.»: el player ha sacado crítico en su tirada; el daño físico base de la acción × DAÑO CRÍT. Se apaga tras usarlo. */
  const [crit, setCrit] = useState(false);
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
    rank = Math.max(1, Math.min(20, Math.floor(rank)));
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
  const baseLimits = actionLimits(player, champion, level, extra);
  const extras = { attacks: participant.actionsExtra?.attacks ?? 0, abilities: participant.actionsExtra?.abilities ?? 0 };
  // Máximo del turno = el de la ficha + los extra concedidos.
  const limits = {
    attacks: baseLimits.attacks === undefined ? undefined : baseLimits.attacks + extras.attacks,
    abilities: baseLimits.abilities === undefined ? undefined : baseLimits.abilities + extras.abilities,
  };
  const left = actionsLeft(participant, limits);
  const prevActions = participant.actionsLeft;
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
    const ability = activeAbility(row, phaseIndex);
    const enemy = typeof ability.effectDuration === 'number' && ability.effectDuration > 0 && ability.effectTarget === 'enemy';
    const damaging = hasDamageScaling(ability.damage) && !!onTargetDamage;
    // «A todos los enemigos» sin daño: no hay que elegir objetivos.
    if (enemy && row.ability.mechanics?.allEnemies && !damaging) return runAbility(row, chosenPhase, []);
    const allyCast = row.ability.mechanics?.castPool?.target === 'ally';
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
  };

  /** Gasta coste / CD / fase / acción, tira el daño una vez y lo aplica a los objetivos (vacío = a nadie). */
  const runAbility = async (row: AbilityRow, chosenPhase: number | undefined, targetIds: string[]) => {
    cancelPicking();
    if (locked) return;
    const phased = hasVariants(row.ability);
    // En modo «a elegir» se usa la fase pulsada y no se avanza.
    const choose = isChoosePhases(row.ability);
    const phaseIndex = typeof chosenPhase === 'number' ? clampPhase(row.ability, chosenPhase) : phaseOf(row);
    const ability = activeAbility(row, phaseIndex);
    const prevPhases = participant.abilityPhases;
    const nextPhases = phased && !choose
      ? { ...prevPhases, [abilityPhaseKey(row.name)]: (phaseIndex + 1) % abilityPhaseCount(row.ability) }
      : undefined;
    const phaseNote = phased ? ` (${phaseLabels(row.ability)[phaseIndex]})` : '';
    const spend = resolvedSpendKind(ability, row.ownerResource ? { resource: row.ownerResource } : undefined);
    // Recast gratis (Danza de guerra): sin coste ni bloqueo por su efecto.
    const recastOn = !!row.ability.mechanics?.recast && !!abilityRecast(participant.bonuses, row.name);
    const noAction = row.ability.mechanics?.noAction === true;
    const cost = spend.kind === 'none' || recastOn ? 0 : (parseAbilityCost(ability.cost, row.rank) ?? 0);
    const spendPool = spend.kind === 'none' ? null : currentFor(spend.kind === 'hp' ? 'hp' : 'pool');
    if (spendPool && cost > spendPool.current) return;
    if (row.rank < 1 && hasDamageScaling(ability.damage)) return;
    const mechanics = row.ability.mechanics;
    const usesCharges = !!mechanics?.charges;
    if (usesCharges && (abilityCharges(row.ability, participant.bonuses, row.name)?.left ?? 0) <= 0) return;
    if (mechanics?.stacks?.required && abilityStacks(participant.bonuses, row.name).count < mechanics.stacks.required) return;
    if (mechanics?.buff && abilityBuff(participant.bonuses, row.name)) return;
    // Sin CD: no se puede usar mientras su propio efecto siga activo.
    if (!recastOn && activeEffectOf(row)) return;

    let headline: string;
    let damageTotal = 0;
    let detail: string | undefined;
    const abilityLog: string[] = [`${row.seal} «${row.name}»${phaseNote} de ${participant.name}`];
    const critOn = crit;
    setCrit(false);
    let abilityCritical = false;
    const abilityChips: ResultChip[] = [];
    let abilityStats: Record<string, unknown> | null = null;
    if (hasDamageScaling(ability.damage)) {
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
      if (cdDuration > 0) abilityLog.push(`CD de la habilidad: ${cdDuration} t.`);
      const allEnemies = enemyEffect && row.ability.mechanics?.allEnemies === true;
      const effectIds = allEnemies ? enemiesOf().map(entry => entry.id) : targetIds;
      if (effectDuration > 0) abilityLog.push(`Efecto «${(ability.effectName ?? '').trim() || row.name}» ${effectDuration} t. ${enemyEffect ? `a ${targets.filter(t => effectIds.includes(t.id)).map(t => t.name).join(', ') || 'nadie'}${allEnemies ? ' (todos los enemigos)' : ''}` : `en ${participant.name}`}`);
      abilityLog.push(...shieldUpNotes(targetIds));
      if (ability.appliesOnHit) abilityLog.push('Aplica efectos de impacto');
      setLastUse({ headline, detail, undo, log: abilityLog, ...(abilityChips.length ? { chips: abilityChips } : {}) });
      const kills = targetIds.length > 0 || allEnemies ? await applyToTargets(row, ability, damageTotal, targetIds, effectIds, abilityLog) : [];
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
      const seed = await abilityMechanicsSeed(row, targetIds, abilityCritical);
      // Escudo / cura a un aliado: los objetivos son aliados, no cuentan como impactos.
      const hitIds = row.ability.mechanics?.castPool?.target === 'ally' ? [] : targetIds;
      // Cargas de combate (Flujo de maná): solo si la habilidad ha hecho daño a algún objetivo (1 carga por uso).
      const passive = noAction ? await seedOnly(seed) : await passivesFor('on-ability', hitIds, kills, ability.appliesOnHit === true, damageTotal > 0, seed);
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
  const passivesFor = async (trigger: 'on-hit' | 'on-ability', targetIds: string[], kills: string[] = [], abilityOnHit = false, damaged?: boolean, seed?: MechanicsSeed): Promise<PassiveResult> => {
    const base = participantContext(participant, level, extra);
    const items = base?.items ?? [];
    const prev = participant.bonuses ?? [];
    let bonuses = seed?.bonuses ?? prev;
    let changed = !!seed && seed.bonuses !== prev;
    const notes: string[] = [];
    const chips: ResultChip[] = [...(seed?.chips ?? [])];
    const log: string[] = [...(seed?.log ?? [])];
    const undos: (() => Promise<void>)[] = [...(seed?.undos ?? [])];
    // Cargas por efecto de impacto (Concentración de Ashe…): AA que golpea o habilidad con «Aplica efectos de impacto».
    if (targetIds.length > 0 && (trigger === 'on-hit' || abilityOnHit)) {
      for (const owner of rows) {
        if (!owner.ability.mechanics?.stacks) continue;
        const gained = gainAbilityStack(bonuses, owner.ability, owner.name, newBonusId);
        if (!gained) {
          if (abilityBuff(bonuses, owner.name)) log.push(`${owner.seal} «${owner.name}»: activa → no acumula cargas`);
          continue;
        }
        bonuses = gained.bonuses;
        changed = true;
        chips.push({ kind: 'buff', text: `${owner.name} ${gained.after}/${gained.max}`, title: `Cargas por efecto de impacto (duran ${gained.turns} t.)` });
        log.push(`${owner.seal} «${owner.name}»: efecto de impacto → carga ${gained.before} → ${gained.after}/${gained.max} (dura ${gained.turns} t., se refresca)${owner.ability.mechanics.stacks.required && gained.after >= owner.ability.mechanics.stacks.required ? ' · ya se puede activar' : ''}`);
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
        if (!per) continue;
        const reduced = reduceChargeRecharge(bonuses, owner.ability, owner.name, per * championHits);
        if (!reduced) continue;
        bonuses = reduced.bonuses;
        changed = true;
        log.push(`${owner.seal} «${owner.name}»: ${championHits} campeón/es alcanzado/s → recarga ${reduced.before} → ${reduced.after} t.${reduced.recharged ? ' · ¡recargada! (ya se puede usar)' : ''}`);
        chips.push({ kind: 'cd', text: reduced.recharged ? `${owner.name} lista` : `${owner.name} −${per * championHits}t`, title: 'Recarga por campeón alcanzado' });
      }
    }
    if (base) {
      const effects = [...activeNamedEffects(items, effectData), ...(base.abilityEffects ?? [])];
      const callbacks: EffectCallbacks = {
        onTargetDamage,
        onTargetBonuses,
        onApplySourcedEffect: (ids, input) => onApplySourcedEffect(ids, input),
        onSelfPool: onPoolChange,
        pickArea: (primary, name) => askTargets(`${name}: objetivo + cercanos`, primary),
        onPermanentStack: permanentStackSaver(participant, onPlayerPatch),
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
  const vampFor = async (dealt: number, lifeSteal: boolean, origin: string) => {
    const context = participantContext(participant, level, extra);
    if (!context || !(dealt > 0)) return null;
    return vampHeal({ dealt, ctx: context.ctx, lifeSteal, onSelfPool: onPoolChange, origin, bearerName: participant.name });
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

  /** Aplica el estado de la pasiva (su primer efecto) a los objetivos, con Deshacer. */
  /** Nombre de la pasiva si sus críticos no hacen daño extra (Ashe). */
  const critNoDamageOwner = (): string | undefined => {
    const owner = passiveRow();
    return owner?.ability.mechanics?.critNoDamage ? owner.name : undefined;
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
  const abilityMechanicsSeed = async (row: AbilityRow, targetIds: string[], critical = false): Promise<MechanicsSeed | undefined> => {
    const mechanics = row.ability.mechanics;
    if (!mechanics) return undefined;
    const seed: MechanicsSeed = { bonuses: participant.bonuses ?? [], log: [], chips: [], undos: [] };
    const label = `${row.seal} «${row.name}»`;
    if (mechanics.charges) {
      const spent = spendAbilityCharge(seed.bonuses, row.ability, row.name, row.rank, newBonusId);
      if (spent) {
        seed.bonuses = spent.bonuses;
        const every = rankValue(mechanics.charges.recharge, row.rank);
        seed.log.push(`${label}: gasta 1 carga ${spent.before} → ${spent.after}/${spent.max}${spent.recharge ? ` · siguiente recarga en ${spent.recharge} t. (1 cada ${every ?? '—'} t. en rango ${row.rank})` : ''} (sin CD: usa cargas)`);
        seed.chips.push({ kind: 'cd', text: `${row.name} ${spent.after}/${spent.max}`, title: spent.recharge ? `Recarga en ${spent.recharge} t.` : 'Cargas de la habilidad' });
      }
    }
    if (mechanics.stacks?.required) {
      const current = abilityStacks(seed.bonuses, row.name);
      seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== abilityStacksSource(row.name));
      seed.log.push(`${label}: gasta sus ${current.count} cargas (hacían falta ${mechanics.stacks.required})`);
    }
    if (mechanics.buff) {
      const { turns } = mechanics.buff;
      const speed = rankValue(mechanics.buff.attackSpeed, row.rank);
      const aaPct = rankValue(mechanics.buff.aaAd, row.rank);
      const name = row.name.slice(0, 80);
      seed.bonuses = seed.bonuses.filter(bonus => bonus.source !== abilityBuffSource(row.name) && bonus.source !== abilityBuffStatSource(row.name));
      seed.bonuses = [
        ...seed.bonuses,
        { id: newBonusId(), stat: 'buff', amount: Math.max(1, row.rank), turns, source: abilityBuffSource(row.name), label: name },
        ...(speed ? [{ id: newBonusId(), stat: 'atkSpePct', amount: speed, turns, source: abilityBuffStatSource(row.name), label: name }] : []),
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
        seed.bonuses = [...seed.bonuses, { id: newBonusId(), stat: 'buff', amount: mechanics.recast.times, turns: mechanics.recast.turns, source, label: row.name.slice(0, 80) }];
        seed.log.push(`${label}: se puede volver a lanzar gratis ×${mechanics.recast.times} durante ${mechanics.recast.turns} t. (botón «Recast»)`);
        seed.chips.push({ kind: 'buff', text: `Recast ${mechanics.recast.turns}t`, title: `${label}: recast gratis` });
      }
    }
    if (mechanics.castPool) await castPoolSeed(row, targetIds, seed);
    if (mechanics.selfStatus) {
      const status = mechanics.selfStatus;
      const source = `ability:${row.name}`;
      const snapshot: Record<string, CombatEffect | null> = { [participant.id]: participant.effects.find(effect => effect.source === source) ?? null };
      await onApplySourcedEffect([participant.id], { source, name: status.name, duration: status.turns, ...(status.value ? { value: status.value } : {}) });
      seed.undos.push(async () => { await onApplySourcedEffect([participant.id], { source, name: status.name, duration: 1, restore: snapshot }); });
      seed.chips.push({ kind: 'buff', text: `${status.name} ${status.turns}t`, title: `${label} → ${participant.name}` });
      seed.log.push(`${label}: «${status.name}»${status.value ? ` ${status.value}` : ''} en ${participant.name} ${status.turns} t.`);
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
    return seed;
  };

  /**
   * Escudo / curación al usarla (Égida dorada): Σ % del rango × stat [+ % por campeón enemigo alcanzado] × poder de
   * curación y escudos (redondeo al aplicar). El escudo lleva un marcador con sus turnos (al caducar se quita lo que quede).
   */
  const castPoolSeed = async (row: AbilityRow, targetIds: string[], seed: MechanicsSeed): Promise<void> => {
    const pool = row.ability.mechanics?.castPool;
    if (!pool) return;
    const label = `${row.seal} «${row.name}»`;
    const word = pool.kind === 'shield' ? 'escudo' : 'cura';
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
    if (pool.requiresHit && targetIds.length === 0) { seed.log.push(`${label}: ${word} → no alcanzó a ningún enemigo (nada)`); return; }
    if (final.amount <= 0) { seed.log.push(`${label}: ${word} = ${formula} → nada`); return; }
    // A quién: al portador (y aliados elegidos) o a los aliados objetivo.
    const recipients: string[] = pool.target === 'ally' ? targetIds.filter(id => id !== participant.id) : [participant.id];
    if (pool.target === 'ally' && recipients.length === 0) { seed.log.push(`${label}: ${word} → sin aliado elegido (nada)`); return; }
    if (pool.target !== 'ally' && pool.alliesToo) {
      const candidates = participants.filter(entry => entry.id !== participant.id && !entry.defeated && !targetIds.includes(entry.id));
      if (candidates.length) recipients.push(...(await askTargets(`${label}: ${word} también a (aliados en el área)`, '', undefined, candidates, 'Aplicar')));
    }
    if (pool.kind === 'heal' && pool.delayTurns) {
      // Cura retrasada: marcador con turnos en el lanzador (vence al empezar su turno) y sin turnos en los aliados.
      const pending = pendingHealSource(row.name);
      const names: string[] = [];
      for (const id of recipients) {
        const who = participants.find(entry => entry.id === id);
        if (!who) continue;
        names.push(who.name);
        const marker: CombatBonus = { id: newBonusId(), stat: 'buff', amount: final.amount, ...(id === participant.id ? { turns: pool.delayTurns } : {}), source: pending, label: row.name.slice(0, 80) };
        if (id === participant.id) seed.bonuses = [...seed.bonuses.filter(bonus => bonus.source !== pending), marker];
        else if (onTargetBonuses) {
          const undo = await onTargetBonuses(id, current => [...current.filter(bonus => bonus.source !== pending), marker]);
          if (undo) seed.undos.push(undo);
        }
      }
      seed.chips.push({ kind: 'heal', text: `Cura ${final.amount} en ${pool.delayTurns}t`, title: `${label} → ${names.join(', ')} (o «Curar ahora»)` });
      seed.log.push(`${label}: cura pendiente ${final.amount} a ${names.join(', ')} = ${formula} · se aplica al empezar el turno de ${participant.name} dentro de ${pool.delayTurns} t. (o «Curar ahora»)`);
      return;
    }
    const source = abilityShieldSource(row.name);
    for (const id of recipients) {
      const self = id === participant.id;
      const who = participants.find(entry => entry.id === id);
      if (!who) continue;
      let amount = final.amount;
      let note = '';
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
          seed.log.push(`${label}: ${word} a ${who.name} = ${formula} → a mano`);
          seed.chips.push({ kind: 'manual', text: `${word} ${final.amount} a ${who.name}: a mano`, title: label });
          continue;
        }
        seed.undos.push(undo);
      }
      seed.chips.push({ kind: pool.kind, text: `+${amount} ${pool.kind === 'shield' ? 'escudo' : 'PV'}${self ? '' : ` ${who.name}`}${pool.turns ? ` ${pool.turns}t` : ''}`, title: `${label} → ${who.name}` });
      seed.log.push(`${label}: ${word} a ${who.name} = ${formula}${note}${old ? ` → +${amount}` : ''}${pool.turns ? ` · dura ${pool.turns} t. (al acabar se quita lo que quede)` : ''}`);
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
    if (self > 0) return `Efecto activo (${self} t.)`;
    const pending = pendingHeal(row);
    if (pending) return `Cura pendiente (${pending.turns ?? '—'} t.)`;
    for (const owner of participants.some(entry => entry.id === participant.id) ? participants : [participant, ...participants]) {
      const shield = (owner.id === participant.id ? participant.bonuses ?? [] : owner.bonuses ?? []).find(bonus => bonus.source === abilityShieldSource(row.name));
      if (shield) return `Escudo activo${owner.id === participant.id ? '' : ` en ${owner.name}`} (${shield.turns ?? '—'} t.)`;
    }
    const source = `ability:${row.name}`;
    let longest = 0;
    const on: string[] = [];
    for (const other of participants) {
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
    rows.some(owner => owner.ability.mechanics?.buff?.aaAppliesPassive === true && !!abilityBuff(participant.bonuses, owner.name));

  /** AA físico: % AD del buff activo y daño extra de la pasiva por prob. de crítico. */
  const basicAttackMods = (type: 'AD' | 'AP', total: number, stats: Record<string, unknown>): { total: number; log: string[]; chips: ResultChip[] } => {
    const log: string[] = [];
    const chips: ResultChip[] = [];
    if (type !== 'AD') return { total, log, chips };
    let next = total;
    for (const owner of rows) {
      const buff = owner.ability.mechanics?.buff;
      const marker = buff ? abilityBuff(participant.bonuses, owner.name) : undefined;
      if (!buff || !marker) continue;
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
      const damage = target && onTargetDamage ? await onTargetDamage(target.id, total) : null;
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
      const kills = damage && damage.before > 0 && damage.after <= 0 && target ? [target.id] : [];
      // Buff con «los AA aplican el estado de la pasiva» (Concentración de Ashe): la ralentización al objetivo.
      const seed = target && aaAppliesPassive() ? await passiveStatusSeed([target.id], 'AA potenciado', undefined, aaCritical) : undefined;
      const passive: PassiveResult = target ? await passivesFor('on-hit', [target.id], kills, false, undefined, seed) : { note: '' };
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
  const applyToTargets = async (row: AbilityRow, ability: Ability, amount: number, targetIds: string[], effectIds: string[] = targetIds, logOut?: string[]): Promise<string[]> => {
    if (targetIds.length === 0 && effectIds.length === 0) return [];
    let damaged = false;
    let kills: string[] = [];
    if (amount && onTargetDamage && targetIds.length > 0) {
      setBusy(true);
      try {
        const { damage, error: failed, kills: killed, hits } = await damageTargets(onTargetDamage, targetIds, amount);
        kills = killed ?? [];
        if (damage) {
          damaged = true;
          setLastUse(current => (current ? withTargetDamage(current, damage) : current));
          // Omnivampirismo: todo el daño de la habilidad (robo de vida no: solo AA).
          const vamp = await vampFor(amount * (hits ?? targetIds.length), false, `${row.seal} «${row.name}»`);
          if (vamp) {
            logOut?.push(...vamp.log);
            setLastUse(current => {
              if (!current) return current;
              const previous = current.undo;
              return { ...current, chips: [...(current.chips ?? []), ...vamp.chips], undo: vamp.undo ? () => { void vamp.undo!().then(() => (previous ? previous() : setLastUse(null))); } : previous };
            });
          }
        }
        if (failed) setError(failed);
      } finally {
        setBusy(false);
      }
    }
    if (!damaged) {
      const names = targets.filter(target => targetIds.includes(target.id)).map(target => target.name).join(', ');
      if (names) setLastUse(current => (current ? { ...current, headline: `${current.headline} → ${names}` } : current));
    }
    if (typeof ability.effectDuration !== 'number' || ability.effectTarget !== 'enemy' || !(ability.effectDuration > 0) || effectIds.length === 0) return kills;
    await onApplySourcedEffect(effectIds, {
      source: `ability:${row.name}`,
      name: (ability.effectName ?? '').trim() || row.name,
      duration: ability.effectDuration,
      hasStacks: ability.hasStacks,
      maxStacks: ability.maxStacks,
    });
    return kills;
  };

  const picking = pickingKey ? rows.find(row => row.key === pickingKey) ?? null : null;
  /** «Crít.» antes de aplicar (el player ha sacado crítico): solo daño físico base de la acción. */
  const critToggle = (
    <label className="combat-crit-toggle" title="Si el player ha sacado crítico (20 natural o la segunda tirada): daño físico × DAÑO CRÍT">
      <input type="checkbox" checked={crit} disabled={saving || busy} onChange={e => setCrit(e.target.checked)} />
      Crít.
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
    const ability = activeAbility(row, phase);
    const spend = resolvedSpendKind(ability, row.ownerResource ? { resource: row.ownerResource } : undefined);
    const recast = row.ability.mechanics?.recast ? abilityRecast(participant.bonuses, row.name) : undefined;
    const cost = spend.kind === 'none' || recast ? 0 : (parseAbilityCost(ability.cost, row.rank) ?? 0);
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
    const stacks = abilityStacks(participant.bonuses, row.name);
    const required = mechanics?.stacks?.required;
    const buff = mechanics?.buff ? abilityBuff(participant.bonuses, row.name) : undefined;
    const mechanicsNote = [
      charges ? `Cargas ${charges.left}/${charges.max}${charges.left < charges.max && charges.recharge ? ` · recarga ${charges.recharge} t.` : ''}` : '',
      mechanics?.stacks ? `Cargas ${stacks.count}/${mechanics.stacks.max}${stacks.turns ? ` · ${stacks.turns} t.` : ''}` : '',
      buff ? `Activa ${buff.turns ?? '—'} t.` : '',
      recast ? `Recast gratis ×${recast.amount} · ${recast.turns ?? '—'} t.` : '',
      innateNote(row),
      pendingHeal(row) ? `Cura pendiente ${pendingHeal(row)!.amount} · ${pendingHeal(row)!.turns ?? '—'} t.` : '',
    ].filter(Boolean).join(' · ');
    let disabledReason: string | undefined;
    if (participant.defeated) disabledReason = 'Está derrotado';
    else if (mechanics?.innateShield) disabledReason = `Automática: ${innateNote(row)}`;
    else if (left.abilities === 0 && !mechanics?.noAction) disabledReason = 'Sin habilidades este turno';
    else if (hasDamageScaling(ability.damage) && row.rank < 1) disabledReason = 'Habilidad sin aprender (rango 0)';
    else if (charges && charges.left <= 0) disabledReason = `Sin cargas (0/${charges.max}${charges.recharge ? ` · recarga en ${charges.recharge} t.` : ''})`;
    else if (required && stacks.count < required) disabledReason = `Necesita ${required} cargas (${stacks.count}/${required})`;
    else if (buff) disabledReason = `Ya activa (${buff.turns ?? '—'} t.)`;
    else if (!recast && activeEffectOf(row)) disabledReason = activeEffectOf(row);
    else if (spendPool && cost > spendPool.current) {
      disabledReason = `No hay ${spend.label.toLowerCase()} suficiente (${spendPool.current}/${spendPool.max})`;
    }
    return { spend, cost, spendPool, cdRemaining, effectRemaining, disabledReason, mechanicsNote, useLabel: recast ? 'Recast' : 'Usar' };
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
                <button type="button" className="combat-btn combat-btn--small" onClick={() => { setAttackPick(null); setCrit(false); }}>Cancelar</button>
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
                    <button type="button" className="sheet-rank__btn" disabled={locked || row.rank <= 1} aria-label={`Bajar rango de ${row.seal}`} onClick={() => setRank(row.key, row.rank - 1)}>−</button>
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
                        disabled={locked || row.rank <= 1}
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
