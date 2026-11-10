import { useEffect, useMemo, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { milestoneRank, normalizeRanks, type RankedSlot } from '../../data/abilityRanks';
import { ABILITY_KEYS, CHAMPIONS, findAbilityRef, type Ability, type Champion } from '../../data/champions';
import type { CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { partyLevel, subscribeParty } from '../../data/party';
import { PLAYERS, PLAYER_ABILITY_SLOTS, type Player, type PlayerListPatch } from '../../data/players';
import { championResourceBar, type ResourceId } from '../../data/resources';
import { abilityActiveEffectKey, abilityCooldownKey, readActiveEffect, readCooldown } from '../../data/stacks';
import { cx } from '../../lib/cx';
import { abilityPhase, abilityPhaseCount, abilityPhaseKey, clampPhase, hasVariants, isChoosePhases, phaseLabels } from '../../data/abilityVariants';
import PhaseTabs from '../habilidades/PhaseTabs';
import { championAbilityRankCount, championDamageContext } from '../calculos/championDamage';
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
  saving: boolean;
  participants: CombatParticipant[];
  onApplySourcedEffect: (targetId: string, input: SourcedEffectInput) => void;
  onPlayerPatch: (playerName: string, patch: PlayerListPatch) => Promise<void>;
  onCombatPatch: (patch: Partial<CombatParticipant>) => void;
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
    const cap = ranked
      ? Math.max(1, ref.ability.damage?.ad?.length ?? 0, ref.ability.damage?.ap?.length ?? 0, stored)
      : Math.max(1, autoRank);
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

function championRows(champion: Champion, rankOverride: Record<string, number>): AbilityRow[] {
  const rows: AbilityRow[] = [];
  for (const slot of ABILITY_KEYS) {
    const ability = champion.abilities[slot];
    if (!ability?.name) continue;
    const maxRank = championAbilityRankCount(ability);
    const override = rankOverride[slot];
    const rank = typeof override === 'number' ? clampRank(override, maxRank) : 1;
    rows.push({
      key: slot,
      seal: slot,
      name: ability.name,
      ability,
      image: champion.image,
      rank,
      maxRank,
      rankAdjustable: maxRank > 1,
      ownerResource: champion.resource,
    });
  }
  return rows;
}

function clampRank(value: number, maxRank: number): number {
  return Math.min(maxRank, Math.max(1, Math.floor(value)));
}

type PoolView = {
  kind: 'hp' | 'pool';
  label: string;
  current: number;
  max: number;
  /** Recurso de la barra (para el color). */
  resourceId?: ResourceId;
};

function playerPool(player: Player, kind: 'hp' | 'pool'): PoolView {
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

function championPool(champion: Champion, participant: CombatParticipant, kind: 'hp' | 'pool'): PoolView {
  const { stats } = championDamageContext(champion);
  if (kind === 'hp') {
    const max = numericStat(stats.hp);
    const current = suggestedOr(participant.hp, max);
    return { kind, label: 'Vida', current, max };
  }
  const bar = championResourceBar(champion.resource, numericStat(stats.mana));
  const max = bar?.max ?? numericStat(stats.mana);
  const current = Math.min(max, suggestedOr(participant.currentResource, bar?.start === 'empty' ? 0 : max));
  return { kind, label: bar?.label ?? 'Maná', current, max, resourceId: bar?.id };
}

export default function CombatAbilityUseSection({
  participant,
  isAdmin,
  saving,
  participants,
  onApplySourcedEffect,
  onPlayerPatch,
  onCombatPatch,
}: Props) {
  const level = useSyncExternalStore(subscribeParty, partyLevel);
  const [rankOverride, setRankOverride] = useState<Record<string, number>>({});
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  /** Habilidad (ya en su fase) cuyo efecto se está aplicando a un objetivo. */
  const [pickingAbility, setPickingAbility] = useState<Ability | null>(null);
  /** Fase vista sin permiso para guardarla en el combate (solo pantalla). */
  const [localPhases, setLocalPhases] = useState<Record<string, number>>({});
  // El deshacer se ejecuta más tarde: usa siempre el último estado del combate.
  const combatPatchRef = useRef(onCombatPatch);
  combatPatchRef.current = onCombatPatch;
  const [lastUse, setLastUse] = useState<LastUse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRankOverride({});
    setPickingKey(null);
    setPickingAbility(null);
    setLocalPhases({});
    setLastUse(null);
    setError(null);
  }, [participant.id]);

  const player = participant.kind === 'player' && participant.sourceId
    ? PLAYERS.find(entry => entry.name === participant.sourceId) ?? null
    : null;
  const champion = participant.kind === 'champion' && participant.sourceId
    ? CHAMPIONS.find(entry => entry.champion === participant.sourceId) ?? null
    : null;

  const rows = useMemo(() => {
    if (player) return playerRows(player, level);
    if (champion) return championRows(champion, rankOverride);
    return [];
  }, [player, champion, level, rankOverride]);

  if (participant.kind !== 'player' && participant.kind !== 'champion') return null;

  const ownerResource = player
    ? rows.find(row => row.ownerResource)?.ownerResource
    : champion?.resource;
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
    onCombatPatch(patch);
  };

  const adjustBar = (delta: number) => {
    if (!pool || locked) return;
    const next = Math.max(0, Math.min(pool.max, pool.current + delta));
    if (next === pool.current) return;
    void persistSpend(pool.kind, next).catch(err => {
      setError(err instanceof Error ? err.message : 'No se pudo ajustar el recurso');
    });
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

  const useAbility = async (row: AbilityRow, chosenPhase?: number) => {
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
    let detail: string | undefined;
    if (hasDamageScaling(ability.damage)) {
      try {
        const stats = player
          ? { ...playerTotalLine(player.sheet, player.equipamiento, level), bonus: playerBonusLine(player.sheet, player.equipamiento) }
          : champion
            ? championDamageContext(champion).stats
            : null;
        if (!stats) return;
        const result = rollAbilityDamage(ability.damage!, stats, row.rank);
        headline = formatUseHeadline(row.seal, { kind: 'roll', total: result.total, type: ability.damage?.type });
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
        if (nextPhases) combatPatchRef.current({ abilityPhases: nextPhases });
      } else {
        const extra: Partial<CombatParticipant> = {};
        if (cdDuration > 0) extra.cooldowns = { ...participant.cooldowns, [cooldownKey]: cdDuration };
        if (selfEffect) extra.activeEffects = { ...participant.activeEffects, [effectKey]: effectDuration };
        if (nextPhases) extra.abilityPhases = nextPhases;
        if (spendPool && cost > 0) await persistSpend(spendPool.kind, nextCurrent, extra);
        else if (Object.keys(extra).length > 0) onCombatPatch(extra);
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
              if (nextPhases) combatPatchRef.current({ abilityPhases: prevPhases ?? {} });
            } else {
              const patch: Partial<CombatParticipant> = {};
              if (spendPool && cost > 0) {
                if (spendPool.kind === 'hp') patch.hp = prevCombat.hp ?? spendPool.current;
                else patch.currentResource = prevCombat.currentResource ?? spendPool.current;
              }
              if (cdDuration > 0) patch.cooldowns = prevCombat.cooldowns;
              if (selfEffect) patch.activeEffects = prevCombat.activeEffects;
              if (nextPhases) patch.abilityPhases = prevPhases ?? {};
              combatPatchRef.current(patch);
            }
            setLastUse(null);
          }
        : undefined;

      setLastUse({ headline, detail, undo });
      if (enemyEffect) {
        setPickingKey(row.key);
        setPickingAbility(ability);
      } else {
        setPickingKey(null);
        setPickingAbility(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo usar la habilidad');
    } finally {
      setBusy(false);
    }
  };

  const confirmTarget = (targetId: string) => {
    const row = rows.find(entry => entry.key === pickingKey);
    const ability = pickingAbility ?? row?.ability;
    setPickingKey(null);
    setPickingAbility(null);
    if (!row || !ability || typeof ability.effectDuration !== 'number') return;
    onApplySourcedEffect(targetId, {
      source: `ability:${row.name}`,
      name: (ability.effectName ?? '').trim() || row.name,
      duration: ability.effectDuration,
      hasStacks: ability.hasStacks,
      maxStacks: ability.maxStacks,
    });
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
    else if (cdRemaining > 0) disabledReason = `En enfriamiento (CD ${cdRemaining})`;
    else if (hasDamageScaling(ability.damage) && row.rank < 1) disabledReason = 'Habilidad sin aprender (rango 0)';
    else if (spendPool && cost > spendPool.current) {
      disabledReason = `No hay ${spend.label.toLowerCase()} suficiente (${spendPool.current}/${spendPool.max})`;
    }
    return { spend, cost, spendPool, cdRemaining, effectRemaining, disabledReason };
  };

  return (
    <div className="combat-panel__section">
      {showBar && pool && (
        <>
          <h3 className="combat-panel__label">{pool.label}</h3>
          <div className="combat-resource">
            <div className="combat-resource__head">
              <span>{pool.current} / {pool.max}</span>
              {isAdmin && (
                <span className="combat-resource__steps">
                  <button
                    type="button"
                    className="combat-btn combat-btn--small"
                    disabled={locked || pool.current <= 0}
                    aria-label={`Quitar 1 de ${pool.label}`}
                    onClick={() => adjustBar(-1)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="combat-btn combat-btn--small"
                    disabled={locked || pool.current >= pool.max}
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
                        onClick={() => setRankOverride(cur => ({ ...cur, [row.key]: row.rank - 1 }))}
                      >
                        −
                      </button>
                      <span title={`Rango ${row.rank}`}>{row.rank}</span>
                      <button
                        type="button"
                        className="combat-btn combat-btn--small"
                        disabled={locked || row.rank >= row.maxRank}
                        aria-label={`Subir rango de ${row.seal}`}
                        onClick={() => setRankOverride(cur => ({ ...cur, [row.key]: row.rank + 1 }))}
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
        <div className="combat-panel__picker">
          <p className="combat-panel__picker-title">Objetivo de {(pickingAbility ?? picking.ability).effectName || picking.name}</p>
          {targets.length === 0 && <p className="combat-page__hint">No hay otros participantes.</p>}
          <ul className="combat-panel__picker-list">
            {targets.map(target => (
              <li key={target.id}>
                <button
                  type="button"
                  className="combat-panel__picker-item"
                  disabled={saving || busy}
                  onClick={() => confirmTarget(target.id)}
                >
                  {target.image
                    ? <img src={target.image} alt="" width={28} height={28} />
                    : <span className="combat-panel__picker-fallback" aria-hidden>⚔</span>}
                  <span>{target.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="combat-btn combat-btn--small" onClick={() => { setPickingKey(null); setPickingAbility(null); }}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
