import type { CombatParticipant } from '../../data/combat';
import { cx } from '../../lib/cx';
import { effectIcon, formatEffectLabel } from './combatHelpers';

type Props = {
  participant: CombatParticipant;
  isTurn: boolean;
  onOpen: () => void;
  /** Vida visible para este usuario (undefined = oculta). */
  hp?: { current: number; max: number | undefined };
  /** Columna del combate en curso: solo foto + iniciativa. */
  compact?: boolean;
  /** Es la ficha abierta en el área central. */
  selected?: boolean;
};

/** Minitarjeta: foto + nombre + ini + chips de estado. */
export default function CombatParticipantCard({ participant, isTurn, onOpen, hp, compact, selected }: Props) {
  if (compact) {
    return (
      <button
        type="button"
        className={cx('combat-mini combat-mini--compact', isTurn && 'combat-mini--turn', selected && 'combat-mini--selected', participant.defeated && 'combat-mini--down')}
        aria-pressed={selected}
        onClick={onOpen}
        title={`${participant.name} · Ini ${participant.initiative}`}
        aria-current={isTurn ? 'step' : undefined}
      >
        <span className="combat-mini__frame">
          {participant.image
            ? <img className="combat-mini__img" src={participant.image} alt={participant.name} />
            : <span className="combat-mini__img combat-mini__img--fallback" aria-hidden>⚔</span>}
          <span className="combat-mini__ini" title="Iniciativa">{participant.initiative}</span>
        </span>
      </button>
    );
  }
  const effects = participant.effects.slice(0, 4);
  const extra = participant.effects.length - effects.length;

  return (
    <button
      type="button"
      className={cx(
        'combat-mini',
        isTurn && 'combat-mini--turn',
        participant.defeated && 'combat-mini--down',
      )}
      onClick={onOpen}
      title={participant.name}
    >
      <span className="combat-mini__frame">
        {participant.image
          ? <img className="combat-mini__img" src={participant.image} alt="" />
          : <span className="combat-mini__img combat-mini__img--fallback" aria-hidden>⚔</span>}
        <span className="combat-mini__ini" title="Iniciativa">{participant.initiative}</span>
        {effects.length > 0 && (
          <span className="combat-mini__states" aria-label="Estados">
            {effects.map(effect => (
              <span
                key={effect.id}
                className="combat-mini__state"
                title={`${formatEffectLabel(effect)} · ${effect.duration}`}
              >
                {effectIcon(effect.name)}
              </span>
            ))}
            {extra > 0 && <span className="combat-mini__state combat-mini__state--more">+{extra}</span>}
          </span>
        )}
      </span>
      <span className="combat-mini__name">{participant.name}</span>
      {hp && hp.max !== undefined && hp.max > 0 && (
        <span className="combat-mini__hp" title={`Vida ${hp.current} / ${hp.max}`}>
          <span className="combat-mini__hp-fill" style={{ width: `${Math.min(100, Math.round((hp.current / hp.max) * 100))}%` }} />
        </span>
      )}
    </button>
  );
}
