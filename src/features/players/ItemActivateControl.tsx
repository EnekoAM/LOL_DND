import { cx } from '../../lib/cx';
import './CooldownControl.css';

type Props = {
  /** Turnos de CD restantes (0 = listo). */
  cdRemaining: number;
  /** Duración de CD al activar; undefined = sin CD. */
  cdDuration?: number;
  /** Turnos de efecto restantes. */
  effectRemaining: number;
  /** Duración del efecto al activar; undefined = sin efecto. */
  effectDuration?: number;
  disabled?: boolean;
  label?: string;
  onActivate: () => void;
  onCooldownChange: (next: number) => void;
  onEffectChange: (next: number) => void;
};

/** Activar ítem: arranca CD y/o duración de efecto. */
export default function ItemActivateControl({
  cdRemaining,
  cdDuration,
  effectRemaining,
  effectDuration,
  disabled,
  label,
  onActivate,
  onCooldownChange,
  onEffectChange,
}: Props) {
  const onCd = cdRemaining > 0;
  const onEffect = effectRemaining > 0;
  const canActivate = !onCd && ((cdDuration ?? 0) > 0 || (effectDuration ?? 0) > 0);

  return (
    <div
      className={cx('cooldown-control', (onCd || onEffect) && 'cooldown-control--active')}
      title={label ?? 'Ítem'}
      onClick={e => e.stopPropagation()}
    >
      {onCd ? (
        <>
          <span className="cooldown-control__badge">CD {cdRemaining}</span>
          <button
            type="button"
            className="cooldown-control__btn"
            aria-label="Bajar cooldown"
            disabled={disabled}
            onClick={() => onCooldownChange(Math.max(0, cdRemaining - 1))}
          >
            −
          </button>
          <button
            type="button"
            className="cooldown-control__reset"
            aria-label="Reset cooldown"
            title="Reset CD"
            disabled={disabled}
            onClick={() => onCooldownChange(0)}
          >
            ⌂
          </button>
        </>
      ) : canActivate ? (
        <button
          type="button"
          className="cooldown-control__use"
          disabled={disabled}
          onClick={onActivate}
        >
          Activar
        </button>
      ) : null}

      {onEffect && (
        <>
          <span className="cooldown-control__badge cooldown-control__badge--effect">Efecto {effectRemaining}</span>
          <button
            type="button"
            className="cooldown-control__btn"
            aria-label="Bajar efecto"
            disabled={disabled}
            onClick={() => onEffectChange(Math.max(0, effectRemaining - 1))}
          >
            −
          </button>
          <button
            type="button"
            className="cooldown-control__reset"
            aria-label="Quitar efecto"
            title="Quitar efecto"
            disabled={disabled}
            onClick={() => onEffectChange(0)}
          >
            ⌂
          </button>
        </>
      )}
    </div>
  );
}
