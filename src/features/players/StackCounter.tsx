import { cx } from '../../lib/cx';
import './StackCounter.css';

type Props = {
  value: number;
  max?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  label?: string;
};

/** Contador compacto (− n +) para stacks de ítems/habilidades en la ficha. */
export default function StackCounter({ value, max, disabled, onChange, label }: Props) {
  const capped = typeof max === 'number' && max > 0 ? Math.min(value, max) : value;
  const atMax = typeof max === 'number' && max > 0 && capped >= max;
  const atMin = capped <= 0;

  return (
    <div className="stack-counter" title={label ?? 'Stacks'} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="stack-counter__btn"
        aria-label="Bajar stacks"
        disabled={disabled || atMin}
        onClick={() => onChange(Math.max(0, capped - 1))}
      >
        −
      </button>
      <span className={cx('stack-counter__value', atMax && 'stack-counter__value--max')}>
        {capped}{typeof max === 'number' && max > 0 ? `/${max}` : ''}
      </span>
      <button
        type="button"
        className="stack-counter__btn"
        aria-label="Subir stacks"
        disabled={disabled || atMax}
        onClick={() => onChange(capped + 1)}
      >
        +
      </button>
      <button
        type="button"
        className="stack-counter__reset"
        aria-label="Reset stacks"
        title="Reset"
        disabled={disabled || capped === 0}
        onClick={() => onChange(0)}
      >
        ⌂
      </button>
    </div>
  );
}
