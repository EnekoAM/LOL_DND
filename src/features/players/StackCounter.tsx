import { useEffect, useState } from 'react';
import { cx } from '../../lib/cx';
import './StackCounter.css';

type Props = {
  value: number;
  max?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  label?: string;
};

function clampStacks(raw: number, max?: number): number {
  if (!Number.isFinite(raw)) return 0;
  let n = Math.max(0, Math.trunc(raw));
  if (typeof max === 'number' && max > 0) n = Math.min(n, max);
  return n;
}

/** Contador compacto (− input +) para stacks de ítems/habilidades. */
export default function StackCounter({ value, max, disabled, onChange, label }: Props) {
  const capped = clampStacks(value, max);
  const atMax = typeof max === 'number' && max > 0 && capped >= max;
  const atMin = capped <= 0;
  const [draft, setDraft] = useState(String(capped));

  useEffect(() => {
    setDraft(String(capped));
  }, [capped]);

  const commitDraft = () => {
    const parsed = Number(draft.replace(',', '.'));
    const next = clampStacks(Number.isFinite(parsed) ? parsed : 0, max);
    setDraft(String(next));
    if (next !== capped) onChange(next);
  };

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
      <input
        className={cx('stack-counter__input', atMax && 'stack-counter__value--max')}
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        aria-label={label ?? 'Stacks'}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
      />
      {typeof max === 'number' && max > 0 && <span className="stack-counter__max">/{max}</span>}
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
