import { useEffect, useState } from 'react';
import type { CombatParticipant } from '../../data/combat';
import type { ParticipantHp } from './combatHp';

type Props = {
  participant: CombatParticipant;
  hp: ParticipantHp | null;
  canSee: boolean;
  saving: boolean;
  onSave: (current: number, max?: number) => Promise<void>;
};

/** Vida en el panel lateral: el admin la de todos, cada player solo la suya. */
export default function CombatHpSection({ participant, hp, canSee, saving, onSave }: Props) {
  const [draft, setDraft] = useState('');
  const [maxDraft, setMaxDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(hp ? String(hp.current) : '');
    setMaxDraft(hp?.max !== undefined ? String(hp.max) : '');
    setError(null);
  }, [participant.id, hp?.current, hp?.max]);

  if (!canSee) {
    return (
      <div className="combat-panel__section">
        <h3 className="combat-panel__label">Vida</h3>
        <p className="combat-page__hint">Oculta: solo la ve su player y el admin.</p>
      </div>
    );
  }
  if (!hp) return null;

  const max = hp.max;
  const locked = saving || busy;
  const save = async (current: number, nextMax?: number) => {
    const cap = nextMax ?? max;
    const value = Math.max(0, Math.min(cap ?? Number.MAX_SAFE_INTEGER, Math.floor(current)));
    if (value === hp.current && (nextMax === undefined || nextMax === max)) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(value, nextMax);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la vida');
    } finally {
      setBusy(false);
    }
  };
  const pct = max && max > 0 ? Math.min(100, Math.round((hp.current / max) * 100)) : 100;

  return (
    <div className="combat-panel__section">
      <h3 className="combat-panel__label">Vida</h3>
      <div className="combat-resource">
        <div className="combat-resource__head">
          <span>{hp.current}{max !== undefined ? ` / ${max}` : ''}</span>
          <span className="combat-resource__steps">
            <button type="button" className="combat-btn combat-btn--small" disabled={locked || hp.current <= 0} aria-label="Quitar 1 de vida" onClick={() => { void save(hp.current - 1); }}>−</button>
            <button type="button" className="combat-btn combat-btn--small" disabled={locked || (max !== undefined && hp.current >= max)} aria-label="Añadir 1 de vida" onClick={() => { void save(hp.current + 1); }}>+</button>
          </span>
        </div>
        <div className="combat-resource__track" aria-hidden="true">
          <div className="combat-resource__fill combat-resource__fill--hp" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <form
        className="combat-panel__row combat-hp__form"
        onSubmit={event => {
          event.preventDefault();
          const value = Number.parseInt(draft, 10);
          const nextMax = maxDraft.trim() === '' ? undefined : Number.parseInt(maxDraft, 10);
          if (!Number.isFinite(value) || value < 0) { setError('La vida tiene que ser un número ≥ 0'); return; }
          if (nextMax !== undefined && (!Number.isFinite(nextMax) || nextMax < 0)) { setError('El máximo tiene que ser un número ≥ 0'); return; }
          void save(value, nextMax !== max ? nextMax : undefined);
        }}
      >
        <label className="combat-hp__field">
          <span>Actual</span>
          <input type="number" min={0} value={draft} disabled={locked} onChange={e => setDraft(e.target.value)} />
        </label>
        <label className="combat-hp__field">
          <span>Máx.</span>
          <input type="number" min={0} value={maxDraft} disabled={locked} placeholder="—" onChange={e => setMaxDraft(e.target.value)} />
        </label>
        <button type="submit" className="combat-btn combat-btn--small" disabled={locked}>Guardar</button>
      </form>
      {error && <p className="combat-page__error">{error}</p>}
    </div>
  );
}
