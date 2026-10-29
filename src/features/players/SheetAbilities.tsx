import { useState } from 'react';
import {
  MILESTONE_LEVELS,
  MILESTONE_RANKS,
  ULT_LEVELS,
  canLower,
  canRaise,
  maxRank,
  milestoneRank,
  normalizeRanks,
  ultRankCap,
  unassignedPoints,
  type RankedSlot,
} from '../../data/abilityRanks';
import { findAbility, findAbilityRef, type Ability } from '../../data/champions';
import {
  PLAYER_ABILITY_SLOTS,
  basicAttackEntries,
  type Player,
  type PlayerAbilitySlot,
} from '../../data/players';
import { cx } from '../../lib/cx';
import AbilityCard from '../calculos/AbilityCard';
import AbilityAssignModal from '../habilidades/AbilityAssignModal';
import '../habilidades/Habilidades.css';
import './SheetAbilities.css';

type Props = {
  player: Player;
  /** Nivel del grupo (= nivel de personaje). */
  level: number;
  saving: boolean;
  error: string | null;
  onSelectAbility: (ability: Ability, rank?: number) => void;
  /** Guarda el hueco; rechaza si la API falla (el modal sigue abierto con el error). */
  onAbilityChange: (slot: PlayerAbilitySlot, name: string | null) => Promise<void>;
  onRankChange: (slot: RankedSlot, rank: number) => Promise<void>;
};

const RankPips = ({ rank, max, title }: { rank: number; max: number; title?: string }) => (
  <div className="sheet-rank__pips" title={title} aria-label={`Rango ${rank} de ${max}`}>
    {Array.from({ length: max }, (_, index) => (
      <span key={index} className={cx('sheet-rank__pip', index < rank && 'sheet-rank__pip--on')} />
    ))}
  </div>
);

const nextMilestone = (level: number) => MILESTONE_LEVELS.find(threshold => threshold > level);
const nextUltLevel = (level: number) => ULT_LEVELS.find(threshold => threshold > level);

const SheetAbilities = ({ player, level, saving, error, onSelectAbility, onAbilityChange, onRankChange }: Props) => {
  const [picking, setPicking] = useState<PlayerAbilitySlot | null>(null);
  const basicAttack = basicAttackEntries(player.basicAttack);
  const pickingEntry = PLAYER_ABILITY_SLOTS.find(entry => entry.slot === picking) ?? null;
  // Se recalcula en el cliente por si el nivel del grupo cambió tras cargar los players.
  const ranks = normalizeRanks(player.abilityRanks, level);
  const free = unassignedPoints(ranks, level);
  const autoRank = milestoneRank(level);
  const upcoming = nextMilestone(level);
  const autoTitle = upcoming
    ? `Rango ${autoRank}/${MILESTONE_RANKS} por nivel · sube solo al nivel ${upcoming}`
    : `Rango ${autoRank}/${MILESTONE_RANKS} por nivel (máximo)`;

  const choose = async (name: string | null) => {
    if (!picking || saving) return;
    try {
      await onAbilityChange(picking, name);
      setPicking(null);
    } catch {
      // El error se enseña dentro del modal.
    }
  };

  const rankHint = (slot: RankedSlot): string => {
    if (slot !== 'R') return `Rango ${ranks[slot]}/${maxRank(slot)}`;
    const cap = ultRankCap(level);
    const next = nextUltLevel(level);
    const base = `Rango ${ranks.R}/${maxRank('R')} · desbloqueados ${cap}`;
    return next ? `${base} · siguiente al nivel ${next}` : base;
  };

  return (
    <>
      <section className="sheet-panel">
        <div className="sheet-panel__title">Auto-ataques</div>
        <div className="calc-grid">
          {basicAttack.length > 0 ? (
            basicAttack.map((entry, index) => (
              <div key={entry.type + '-' + index} className="sheet-ability">
                <div className="calc-card calc-card--ability" title={'Ataque básico ' + entry.type}>
                  <div className="calc-card__key">[AA]</div>
                  <div className="calc-card__name">Ataque básico {entry.type}</div>
                  <div className="sheet-rank sheet-rank--auto">
                    <RankPips rank={autoRank} max={MILESTONE_RANKS} title={autoTitle} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="calc-card__name">Sin ataque básico definido</div>
          )}
        </div>
      </section>

      <section className="sheet-panel">
        <div className="sheet-panel__title sheet-abilities__title">
          <span>Habilidades</span>
          <span className={cx('sheet-points', free > 0 && 'sheet-points--free')}>
            Puntos sin asignar: {free}
          </span>
        </div>
        {error && !pickingEntry && <div className="sheet-abilities__error">{error}</div>}
        <div className="calc-grid">
          {PLAYER_ABILITY_SLOTS.map(({ slot, label }) => {
            const abilityName = player.abilities[slot];
            const ref = findAbilityRef(abilityName);
            const ranked = slot === 'P' ? null : (slot as RankedSlot);
            const rank = ranked ? ranks[ranked] : autoRank;
            return (
              <div key={slot} className="sheet-ability">
                <AbilityCard
                  label={label}
                  name={abilityName ?? 'No definida'}
                  ability={findAbility(abilityName)}
                  onSelect={ability => onSelectAbility(ability, rank)}
                  hideScaling
                >
                {ranked ? (
                  <div className="sheet-rank">
                    <button
                      type="button"
                      className="sheet-rank__btn"
                      disabled={saving || !canLower(ranks, ranked)}
                      onClick={() => { void onRankChange(ranked, ranks[ranked] - 1); }}
                      aria-label={`Bajar ${label}`}
                    >
                      −
                    </button>
                    <RankPips rank={ranks[ranked]} max={maxRank(ranked)} title={rankHint(ranked)} />
                    <button
                      type="button"
                      className="sheet-rank__btn"
                      disabled={saving || !canRaise(ranks, ranked, level)}
                      onClick={() => { void onRankChange(ranked, ranks[ranked] + 1); }}
                      aria-label={`Subir ${label}`}
                      title={ranked === 'R' && ranks.R >= ultRankCap(level) && ranks.R < maxRank('R')
                        ? `La definitiva sube en los niveles ${ULT_LEVELS.join(' / ')}`
                        : undefined}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <div className="sheet-rank sheet-rank--auto">
                    <RankPips rank={autoRank} max={MILESTONE_RANKS} title={autoTitle} />
                  </div>
                )}
                </AbilityCard>
                {ref?.champion && <div className="sheet-ability__origin">{ref.champion}</div>}
                <button
                  type="button"
                  className="sheet-ability__change"
                  disabled={saving}
                  onClick={() => setPicking(slot)}
                >
                  {abilityName ? 'Cambiar' : 'Asignar'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {pickingEntry && (
        <AbilityAssignModal
          playerName={player.name}
          rol={player.rol}
          slotLabel={pickingEntry.key}
          kind={pickingEntry.kind}
          currentName={player.abilities[pickingEntry.slot] ?? null}
          takenNames={PLAYER_ABILITY_SLOTS
            .filter(({ slot }) => slot !== pickingEntry.slot)
            .map(({ slot }) => player.abilities[slot])
            .filter((name): name is string => !!name)}
          revision={0}
          saving={saving}
          error={error}
          onChoose={name => { void choose(name); }}
          onClose={() => {
            if (!saving) setPicking(null);
          }}
        />
      )}
    </>
  );
};

export default SheetAbilities;
