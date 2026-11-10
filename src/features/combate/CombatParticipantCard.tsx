import type { CombatParticipant } from '../../data/combat';
import { cx } from '../../lib/cx';
import { effectIcon, formatEffectLabel } from './combatHelpers';

type Props = {
  participant: CombatParticipant;
  isTurn: boolean;
  onOpen: () => void;
};

/** Minitarjeta: foto + nombre + ini + chips de estado. */
export default function CombatParticipantCard({ participant, isTurn, onOpen }: Props) {
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
    </button>
  );
}
