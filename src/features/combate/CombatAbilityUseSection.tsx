import { useEffect, useMemo, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { BASIC_MAX_RANK, MILESTONE_RANKS, ULT_MAX_RANK, milestoneRank, normalizeRanks, type RankedSlot } from '../../data/abilityRanks';
import { ABILITY_KEYS, findAbilityRef, type Ability, type Champion } from '../../data/champions';
import { participantChampion } from '../../data/combatSheet';
import type { CombatBonus, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { firePassives, type PassiveResult } from './combatBonuses';
import { useNamedEffectDescriptions } from '../../data/namedEffectDescriptions';
import { activeNamedEffects, armAfterAbility, combatExtraLines, fireEffectRules, participantContext, type EffectCallbacks, type EffectTriggerName } from './effectRules';
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
  /** Acciones del turno vía PATCH (admin o su propio player). */
  onActionsSave?: (kind: 'attacks' | 'abilities', left: number, extra: number) => Promise<void>;
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

type LastUse = {
  headline: string;
  detail?: string;
  undo?: () => void;
};

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
  const [busy, setBusy] = useState(false);
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
    if (enemy || damaging) {
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
    const cost = spend.kind === 'none' ? 0 : (parseAbilityCost(ability.cost, row.rank) ?? 0);
    const spendPool = spend.kind === 'none' ? null : currentFor(spend.kind === 'hp' ? 'hp' : 'pool');
    if (spendPool && cost > spendPool.current) return;
    if (row.rank < 1 && hasDamageScaling(ability.damage)) return;

    let headline: string;
    let damageTotal = 0;
    let detail: string | undefined;
    if (hasDamageScaling(ability.damage)) {
      try {
        const stats = player
          ? { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) }
          : champion
            ? championDamageContext(champion, extra).stats
            : null;
        if (!stats) return;
        const result = rollAbilityDamage(ability.damage!, stats, row.rank);
        headline = formatUseHeadline(row.seal, { kind: 'roll', total: result.total, type: ability.damage?.type });
        damageTotal = result.total;
        detail = formatDiceBreakdown(result);
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
    const cdDuration = typeof ability.cooldown === 'number' && ability.cooldown > 0 ? ability.cooldown : 0;
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
        const actions = spendAction('abilities');
        if (nextPhases || actions) {
          await combatPatchRef.current({ ...(nextPhases ? { abilityPhases: nextPhases } : {}), ...(actions ? { actionsLeft: actions } : {}) });
        }
      } else {
        const extra: Partial<CombatParticipant> = {};
        if (cdDuration > 0) extra.cooldowns = { ...participant.cooldowns, [cooldownKey]: cdDuration };
        if (selfEffect) extra.activeEffects = { ...participant.activeEffects, [effectKey]: effectDuration };
        if (nextPhases) extra.abilityPhases = nextPhases;
        const actions = spendAction('abilities');
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

      setLastUse({ headline, detail, undo });
      const kills = targetIds.length > 0 ? await applyToTargets(row, ability, damageTotal, targetIds) : [];
      const passive = await passivesFor('on-ability', targetIds, kills);
      setLastUse(current => (current ? withPassives(current, passive) : current));
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
  const passivesFor = async (trigger: 'on-hit' | 'on-ability', targetIds: string[], kills: string[] = []): Promise<PassiveResult> => {
    const base = participantContext(participant, level, extra);
    const items = base?.items ?? [];
    const prev = participant.bonuses ?? [];
    let bonuses = prev;
    let changed = false;
    const notes: string[] = [];
    const undos: (() => Promise<void>)[] = [];
    if (base) {
      const effects = activeNamedEffects(items, effectData);
      const callbacks: EffectCallbacks = {
        onTargetDamage,
        onTargetBonuses,
        onApplySourcedEffect: (ids, input) => onApplySourcedEffect(ids, input),
        onSelfPool: onPoolChange,
      };
      const fire = async (name: EffectTriggerName, ids: string[]) => {
        const result = await fireEffectRules({ trigger: name, effects, ctx: base.ctx, bonuses, targetIds: ids, participants, level, callbacks });
        bonuses = result.bonuses;
        changed = changed || result.changed;
        notes.push(...result.notes, ...result.manual.map(text => `a mano: ${text}`));
        undos.push(...result.undos);
        return result;
      };
      if (trigger === 'on-ability') {
        const armed = armAfterAbility(effects, bonuses);
        if (armed.names.length) {
          bonuses = armed.bonuses;
          changed = true;
          notes.push(`${armed.names.join(', ')} armada (siguiente AA)`);
        }
      }
      const allKills = [...kills];
      if (targetIds.length > 0) allKills.push(...(await fire(trigger === 'on-hit' ? 'on-hit' : 'on-ability-hit', targetIds)).kills);
      for (const _kill of new Set(allKills)) await fire('on-takedown', []);
    }
    if (changed && onBonusesSave) {
      await onBonusesSave(bonuses);
      undos.unshift(() => onBonusesSave(prev));
    }
    const passive = await firePassives({ bonuses, items, trigger, targetIds, onBonusesSave, onTargetDamage });
    if (passive.undo) undos.push(passive.undo);
    const note = `${notes.length ? ` · ${notes.join(' · ')}` : ''}${passive.note}`;
    return {
      note,
      undo: undos.length ? async () => { for (const undo of [...undos].reverse()) await undo(); } : undefined,
    };
  };
  /** Suma la nota de las pasivas y encadena su Deshacer antes que el resto. */
  const withPassives = (use: LastUse, passive: PassiveResult): LastUse => {
    if (!passive.note && !passive.undo) return use;
    const previous = use.undo;
    const undoPassive = passive.undo;
    return {
      ...use,
      headline: `${use.headline}${passive.note}`,
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
    let headline: string;
    let detail: string | undefined;
    let total: number;
    try {
      const roll = rollDamageStat(source);
      // AP: % del AP total por tramo de nivel, redondeando hacia arriba. AD: el AD total.
      total = pct === 1 ? roll.total : Math.ceil(roll.total * pct);
      headline = `«AA» ${formatDamageAmount(total)} de ${formatDamageType(type === 'AP' ? 'magico' : 'fisico')}`;
      const dice = roll.groups.map(group => `${group.sign < 0 ? '−' : ''}${group.count}d${group.sides}: [${group.rolls.join(', ')}]`);
      const pctLabel = `${Math.round(pct * 1000) / 10}%`;
      detail = [
        pct === 1 ? null : `${type} ${formatDamageAmount(roll.total)} × ${pctLabel} = ${formatDamageAmount(total)}`,
        `${type} total ${String(source)}`,
        ...dice,
      ].filter(Boolean).join(' · ');
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
      const use: LastUse = {
        headline,
        detail,
        undo: actions ? () => { void combatPatchRef.current({ actionsLeft: prevActions }); setLastUse(null); } : undefined,
      };
      // On-hit: solo si golpea a alguien.
      const kills = damage && damage.before > 0 && damage.after <= 0 && target ? [target.id] : [];
      const passive = target ? await passivesFor('on-hit', [target.id], kills) : { note: '' };
      setLastUse(withPassives(withTargetDamage(use, damage), passive));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo aplicar el ataque');
    } finally {
      setBusy(false);
    }
  };

  /** Objetivos elegidos (uno o varios): el mismo daño a cada uno y el efecto enemigo a todos. */
  const applyToTargets = async (row: AbilityRow, ability: Ability, amount: number, targetIds: string[]): Promise<string[]> => {
    if (targetIds.length === 0) return [];
    let damaged = false;
    let kills: string[] = [];
    if (amount && onTargetDamage) {
      setBusy(true);
      try {
        const { damage, error: failed, kills: killed } = await damageTargets(onTargetDamage, targetIds, amount);
        kills = killed ?? [];
        if (damage) {
          damaged = true;
          setLastUse(current => (current ? withTargetDamage(current, damage) : current));
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
    if (typeof ability.effectDuration !== 'number' || ability.effectTarget !== 'enemy' || !(ability.effectDuration > 0)) return kills;
    await onApplySourcedEffect(targetIds, {
      source: `ability:${row.name}`,
      name: (ability.effectName ?? '').trim() || row.name,
      duration: ability.effectDuration,
      hasStacks: ability.hasStacks,
      maxStacks: ability.maxStacks,
    });
    return kills;
  };

  const picking = pickingKey ? rows.find(row => row.key === pickingKey) ?? null : null;
  const targets = participants.filter(entry => entry.id !== participant.id);
  const missing = participant.kind === 'player' ? !player : !champion;

  const rowState = (row: AbilityRow, phase?: number) => {
    const ability = activeAbility(row, phase);
    const spend = resolvedSpendKind(ability, row.ownerResource ? { resource: row.ownerResource } : undefined);
    const cost = spend.kind === 'none' ? 0 : (parseAbilityCost(ability.cost, row.rank) ?? 0);
    const spendPool = spend.kind === 'none' ? null : currentFor(spend.kind === 'hp' ? 'hp' : 'pool');
    const cdRemaining = player
      ? readCooldown(player.cooldowns, abilityCooldownKey(row.name))
      : readCooldown(participant.cooldowns, abilityCooldownKey(row.name));
    const effectRemaining = player
      ? readActiveEffect(player.activeEffects, abilityActiveEffectKey(row.name))
      : readActiveEffect(participant.activeEffects, abilityActiveEffectKey(row.name));
    let disabledReason: string | undefined;
    if (participant.defeated) disabledReason = 'Está derrotado';
    else if (left.abilities === 0) disabledReason = 'Sin habilidades este turno';
    else if (cdRemaining > 0) disabledReason = `En enfriamiento (CD ${cdRemaining})`;
    else if (hasDamageScaling(ability.damage) && row.rank < 1) disabledReason = 'Habilidad sin aprender (rango 0)';
    else if (spendPool && cost > spendPool.current) {
      disabledReason = `No hay ${spend.label.toLowerCase()} suficiente (${spendPool.current}/${spendPool.max})`;
    }
    return { spend, cost, spendPool, cdRemaining, effectRemaining, disabledReason };
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
                <button type="button" className="combat-btn combat-btn--small" onClick={() => setAttackPick(null)}>Cancelar</button>
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
                const note = [costLabel, state.effectRemaining > 0 ? `Efecto ${state.effectRemaining}` : ''].filter(Boolean).join(' · ') || undefined;
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
                    cooldown={typeof active.cooldown === 'number' && active.cooldown > 0 ? (
                      <CooldownControl
                        remaining={state.cdRemaining}
                        duration={active.cooldown}
                        disabled={player ? !canTrack : !isAdmin || saving || busy}
                        label={`CD · ${row.name}`}
                        onChange={next => {
                          if (player) void onPlayerPatch(player.name, { cooldowns: { ...player.cooldowns, [cdKey]: next } });
                          else onCombatPatch({ cooldowns: { ...participant.cooldowns, [cdKey]: next } });
                        }}
                      />
                    ) : undefined}
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
                          <button type="button" className="combat-btn combat-btn--small combat-btn--gold" disabled={locked || !!state.disabledReason} title={state.disabledReason ?? `Usar ${row.seal}`} onClick={() => { void useAbility(row); }}>
                            Usar
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
          {lastUse && (
            <div className="combat-panel__use-result" aria-live="polite">
              <p className="combat-panel__use-headline">{lastUse.headline}</p>
              {lastUse.detail && <p className="combat-panel__use-detail">{lastUse.detail}</p>}
              {lastUse.undo && (
                <button type="button" className="combat-btn combat-btn--small" disabled={saving || busy} onClick={lastUse.undo}>Deshacer</button>
              )}
            </div>
          )}
          {error && <p className="combat-page__error">{error}</p>}
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
                  {state.cdRemaining > 0 && (
                    <span className="combat-panel__badge combat-panel__badge--cd" title="Cooldown">
                      CD {state.cdRemaining}
                    </span>
                  )}
                  {state.effectRemaining > 0 && (
                    <span className="combat-panel__badge combat-panel__badge--effect" title="Efecto">
                      Efecto {state.effectRemaining}
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
                      Usar
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

      {lastUse && (
        <div className="combat-panel__use-result" aria-live="polite">
          <p className="combat-panel__use-headline">{lastUse.headline}</p>
          {lastUse.detail && <p className="combat-panel__use-detail">{lastUse.detail}</p>}
          {lastUse.undo && (
            <button
              type="button"
              className="combat-btn combat-btn--small"
              disabled={saving || busy}
              onClick={lastUse.undo}
            >
              Deshacer
            </button>
          )}
        </div>
      )}
      {error && <p className="combat-page__error">{error}</p>}

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
    </div>
  );
}
