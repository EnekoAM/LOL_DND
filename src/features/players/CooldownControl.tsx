import { cx } from '../../lib/cx';
import './CooldownControl.css';

type Props = {
  /** Turnos restantes (0 = listo). */
  remaining: number;
  /** Duración al usar. */
  duration: number;
  disabled?: boolean;
  label?: string;
  onChange: (next: number) => void;
};

/** Tracker de cooldown: Usar / CD n con − y reset. */
export default function CooldownControl({ remaining, duration, disabled, label, onChange }: Props) {
  const active = remaining > 0;
  return (
    <div
      className={cx('cooldown-control', active && 'cooldown-control--active')}
      title={label ?? 'Cooldown'}
      onClick={e => e.stopPropagation()}
    >
      {active ? (
        <>
          <span className="cooldown-control__badge">CD {remaining}</span>
          <button
            type="button"
            className="cooldown-control__btn"
            aria-label="Bajar cooldown"
            disabled={disabled}
            onClick={() => onChange(Math.max(0, remaining - 1))}
          >
            −
          </button>
          <button
            type="button"
            className="cooldown-control__reset"
            aria-label="Reset cooldown"
            title="Reset"
            disabled={disabled}
            onClick={() => onChange(0)}
          >
            ⌂
          </button>
        </>
      ) : (
        <button
          type="button"
          className="cooldown-control__use"
          disabled={disabled || duration < 1}
          onClick={() => onChange(duration)}
        >
          Usar
        </button>
      )}
    </div>
  );
}
