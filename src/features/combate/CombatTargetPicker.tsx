import { useState } from 'react';
import type { CombatParticipant } from '../../data/combat';
import { cx } from '../../lib/cx';

type Props = {
  title: string;
  targets: CombatParticipant[];
  disabled?: boolean;
  /** Objetivos elegidos (uno o varios, daño en área). */
  onConfirm: (targetIds: string[]) => void;
  /** Sin objetivo: no se aplica nada a nadie. */
  onSkip: () => void;
  /** Cancelar: no se usa (no se gasta nada). */
  onCancel?: () => void;
  confirmLabel?: string;
};

/** Lista con casillas para elegir uno o varios objetivos + Atacar / Sin objetivo. */
export default function CombatTargetPicker({ title, targets, disabled, onConfirm, onSkip, onCancel, confirmLabel = 'Atacar' }: Props) {
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (id: string) => setChosen(current => (current.includes(id) ? current.filter(entry => entry !== id) : [...current, id]));
  // En el orden de la lista (iniciativa), no en el de los clics.
  const ordered = targets.filter(target => chosen.includes(target.id)).map(target => target.id);
  return (
    <div className="combat-panel__picker">
      <p className="combat-panel__picker-title">{title}</p>
      {targets.length === 0 && <p className="combat-page__hint">No hay otros participantes.</p>}
      <ul className="combat-panel__picker-list">
        {targets.map(target => {
          const on = chosen.includes(target.id);
          return (
            <li key={target.id}>
              <label className={cx('combat-panel__picker-item', 'combat-panel__picker-item--check', on && 'combat-panel__picker-item--on', target.defeated && 'combat-panel__picker-item--defeated')}>
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(target.id)} />
                {target.image ? <img src={target.image} alt="" width={28} height={28} /> : <span className="combat-panel__picker-fallback" aria-hidden>⚔</span>}
                <span>{target.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="combat-panel__picker-actions">
        <button type="button" className="combat-btn combat-btn--small combat-btn--gold" disabled={disabled || ordered.length === 0} onClick={() => onConfirm(ordered)}>
          {confirmLabel}{ordered.length > 1 ? ` (${ordered.length})` : ''}
        </button>
        <button type="button" className="combat-btn combat-btn--small" disabled={disabled} onClick={onSkip}>Sin objetivo</button>
        {onCancel && <button type="button" className="combat-btn combat-btn--small" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}
