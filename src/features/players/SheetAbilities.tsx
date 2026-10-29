import { useState, type ReactNode } from 'react';
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
import { findAbilityRef, type Ability } from '../../data/champions';
import {
  PLAYER_ABILITY_SLOTS,
  basicAttackEntries,
  type Player,
  type PlayerAbilitySlot,
} from '../../data/players';
import { cx } from '../../lib/cx';
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

type Tone = 'pasiva' | 'basica' | 'definitiva' | 'auto';

const TYPE_LABEL: Record<Exclude<Tone, 'auto'>, string> = {
  pasiva: 'Pasiva',
  basica: 'Básica',
  definitiva: 'Definitiva',
};

const RankPips = ({ rank, max, title }: { rank: number; max: number; title?: string }) => (
  <div className="sheet-rank__pips" title={title} aria-label={`Rango ${rank} de ${max}`}>
    {Array.from({ length: max }, (_, index) => (
      <span key={index} className={cx('sheet-rank__pip', index < rank && 'sheet-rank__pip--on')} />
    ))}
  </div>
);

type SpellCardProps = {
  tone: Tone;
  /** Letra del sello: P, Q, W, E, R, AA. */
  seal: string;
  name: string;
  type: string;
  champion?: string;
  image?: string;
  empty?: boolean;
  note?: string;
  onOpen?: () => void;
  ranks: ReactNode;
  action?: ReactNode;
};

const SpellCard = ({ tone, seal, name, type, champion, image, empty, note, onOpen, ranks, action }: SpellCardProps) => (
  <article
    className={cx(
      'spell',
      `spell--${tone}`,
      empty && 'spell--empty',
      onOpen && 'spell--clickable',
    )}
    onClick={onOpen}
    title={onOpen ? 'Ver cálculo' : undefined}
  >
    <span className="spell__corner spell__corner--tl" aria-hidden />
    <span className="spell__corner spell__corner--br" aria-hidden />
    <header className="spell__head">
      <div className="spell__icon" aria-hidden>
        {image && !empty ? <img src={image} alt="" loading="lazy" /> : <span className="spell__glyph">{empty ? '?' : '✦'}</span>}
        <span className="spell__seal">{seal}</span>
      </div>
      <div className="spell__titles">
        <div className="spell__type">{type}</div>
        <div className="spell__name">{name}</div>
        {champion && <div className="spell__origin">{champion}</div>}
        {note && <div className="spell__note">{note}</div>}
      </div>
    </header>
    <div className="spell__ranks" onClick={event => event.stopPropagation()}>
      {ranks}
    </div>
    {action && (
      <div className="spell__action" onClick={event => event.stopPropagation()}>
        {action}
      </div>
    )}
  </article>
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

  const autoRanks = (
    <div className="sheet-rank sheet-rank--auto">
      <RankPips rank={autoRank} max={MILESTONE_RANKS} title={autoTitle} />
    </div>
  );

  return (
    <>
      <section className="sheet-panel">
        <div className="sheet-panel__title">Auto-ataques</div>
        <div className="spell-grid spell-grid--auto">
          {basicAttack.length > 0 ? (
            basicAttack.map((entry, index) => (
              <SpellCard
                key={entry.type + '-' + index}
                tone="auto"
                seal="AA"
                type={entry.type === 'AP' ? 'Daño mágico' : 'Daño físico'}
                name={`Ataque básico ${entry.type}`}
                ranks={autoRanks}
              />
            ))
          ) : (
            <div className="spell-grid__empty">Sin ataque básico definido</div>
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
        <div className="spell-grid">
          {PLAYER_ABILITY_SLOTS.map(({ slot, key, label, kind }) => {
            const abilityName = player.abilities[slot];
            const ref = findAbilityRef(abilityName);
            const ability = ref?.ability ?? null;
            const ranked = slot === 'P' ? null : (slot as RankedSlot);
            const rank = ranked ? ranks[ranked] : autoRank;
            const tone = kind as Exclude<Tone, 'auto'>;
            const empty = !abilityName;
            const note = empty
              ? 'Sin asignar'
              : !ability
                ? 'No implementada'
                : undefined;

            const rankControls = ranked ? (
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
            ) : autoRanks;

            return (
              <SpellCard
                key={slot}
                tone={tone}
                seal={key}
                type={TYPE_LABEL[tone]}
                name={abilityName ?? 'No definida'}
                champion={ref?.champion}
                image={ref?.image}
                empty={empty}
                note={note}
                onOpen={ability?.damage ? () => onSelectAbility(ability, rank) : undefined}
                ranks={rankControls}
                action={(
                  <button
                    type="button"
                    className={cx('spell__btn', empty && 'spell__btn--primary')}
                    disabled={saving}
                    onClick={() => setPicking(slot)}
                  >
                    {empty ? '+ Asignar' : 'Cambiar'}
                  </button>
                )}
              />
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
