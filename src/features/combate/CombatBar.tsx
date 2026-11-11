import { useEffect, useState } from 'react';
import { cx } from '../../lib/cx';

/** Actual (y Máx. en players) escritos a mano; −/+ siguen arriba. */
export function BarInputs({ current, max, editMax, disabled, onSave, onError }: {
  current: number;
  max: number;
  editMax: boolean;
  disabled: boolean;
  onSave: (current: number, max?: number) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(String(current));
  const [maxDraft, setMaxDraft] = useState(String(max));
  useEffect(() => { setDraft(String(current)); }, [current]);
  useEffect(() => { setMaxDraft(String(max)); }, [max]);
  return (
    <form
      className="combat-panel__row combat-hp__form"
      onSubmit={event => {
        event.preventDefault();
        const value = Number.parseInt(draft, 10);
        const nextMax = editMax ? Number.parseInt(maxDraft, 10) : undefined;
        if (!Number.isFinite(value) || value < 0) { onError('El valor tiene que ser un número ≥ 0'); return; }
        if (nextMax !== undefined && (!Number.isFinite(nextMax) || nextMax < 0)) { onError('El máximo tiene que ser un número ≥ 0'); return; }
        onSave(value, nextMax !== undefined && nextMax !== max ? nextMax : undefined);
      }}
    >
      <label className="combat-hp__field">
        <span>Actual</span>
        <input type="number" min={0} max={editMax ? undefined : max} value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} />
      </label>
      {editMax && (
        <label className="combat-hp__field">
          <span>Máx.</span>
          <input type="number" min={0} value={maxDraft} disabled={disabled} onChange={e => setMaxDraft(e.target.value)} />
        </label>
      )}
      <button type="submit" className="combat-btn combat-btn--small" disabled={disabled}>Guardar</button>
    </form>
  );
}


type BarProps = {
  label: string;
  current: number;
  max: number;
  /** Clase de color (combat-resource__fill--energia…); vida usa --hp. */
  fillClass?: string;
  canEdit: boolean;
  /** Muestra Máx. en la edición (players: su ficha). */
  editMax?: boolean;
  disabled?: boolean;
  onSave: (current: number, max?: number) => Promise<void>;
};

/** Barra estilo ficha (Puntos de golpe / Maná…) con lápiz que abre Actual/Máx y −/+. */
export default function CombatBar({ label, current, max, fillClass, canEdit, editMax = false, disabled, onSave }: BarProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((current / max) * 100))) : 0;
  const locked = disabled || busy;
  const save = (next: number, nextMax?: number) => {
    const cap = nextMax ?? max;
    const value = Math.max(0, Math.min(cap, Math.floor(next)));
    if (value === current && (nextMax === undefined || nextMax === max)) return;
    setBusy(true);
    setError(null);
    void onSave(value, nextMax)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo guardar'))
      .finally(() => setBusy(false));
  };
  return (
    <div className="sheet-resource combat-bar">
      <div className="sheet-resource__top">
        <div className="sheet-resource__label">{label}</div>
        {canEdit && (
          <span className="combat-bar__tools">
            <button type="button" className="sheet-hp__icon-btn" disabled={locked || current <= 0} aria-label={`Quitar 1 de ${label}`} onClick={() => save(current - 1)}>−</button>
            <button type="button" className="sheet-hp__icon-btn" disabled={locked || current >= max} aria-label={`Añadir 1 de ${label}`} onClick={() => save(current + 1)}>+</button>
            <button
              type="button"
              className={cx('sheet-hp__icon-btn', editing && 'combat-bar__pencil--on')}
              disabled={disabled}
              aria-label={`Editar ${label}`}
              title="Editar"
              onClick={() => setEditing(open => !open)}
            >
              ✎
            </button>
          </span>
        )}
      </div>
      <div className="sheet-resource__head sheet-resource__head--values">
        <span>{current} / {max}</span>
        <span>{pct}%</span>
      </div>
      <div className="sheet-resource__track" aria-hidden="true">
        <div className={cx('sheet-resource__fill', 'combat-resource__fill', fillClass)} style={{ width: `${pct}%` }} />
      </div>
      {canEdit && editing && (
        <BarInputs
          current={current}
          max={max}
          editMax={editMax}
          disabled={locked}
          onSave={(next, nextMax) => { save(next, nextMax); setEditing(false); }}
          onError={setError}
        />
      )}
      {error && <p className="sheet-hp__error">{error}</p>}
    </div>
  );
}
