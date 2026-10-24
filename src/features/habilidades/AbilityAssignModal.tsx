import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import { learnedAbilities, sameAbilityName, type AbilityKind } from '../../data/champions';
import { cx } from '../../lib/cx';
import { matchesSearch } from '../../lib/text';

type Props = {
  playerName: string;
  rol?: string;
  slotLabel: string;
  kind: AbilityKind;
  currentName: string | null;
  /** Nombres ya puestos en otros huecos de este jugador. */
  takenNames: string[];
  revision: number;
  saving: boolean;
  error: string | null;
  onChoose: (name: string | null) => void;
  onClose: () => void;
};

const KIND_COPY: Record<AbilityKind, { title: string; empty: string }> = {
  pasiva: {
    title: 'Pasivas aprendidas',
    empty: 'Ninguna pasiva aprendida',
  },
  basica: {
    title: 'Habilidades básicas aprendidas',
    empty: 'Ninguna habilidad básica aprendida',
  },
  definitiva: {
    title: 'Definitivas aprendidas',
    empty: 'Ninguna definitiva aprendida',
  },
};

const AbilityAssignModal = ({
  playerName,
  rol,
  slotLabel,
  kind,
  currentName,
  takenNames,
  revision,
  saving,
  error,
  onChoose,
  onClose,
}: Props) => {
  const [search, setSearch] = useState('');
  const copy = KIND_COPY[kind];
  const role = rol?.trim() ?? '';
  const options = useMemo(() => {
    return learnedAbilities(kind, role || undefined)
      .filter(ref => !takenNames.some(name => sameAbilityName(ref.name, name)))
      .filter(ref => matchesSearch(ref.name, search) || matchesSearch(ref.champion, search))
      .sort((a, b) => a.champion.localeCompare(b.champion, 'es') || a.name.localeCompare(b.name, 'es'));
  }, [kind, revision, role, search, takenNames]);
  const empty = role
    ? `${copy.empty} de ${role}. Márcala como aprendida en un campeón de ese rol.`
    : `${copy.empty}. Márcala como aprendida en el campeón.`;

  return createPortal(
    <Modal onClose={saving ? () => undefined : onClose} backdropClassName="hab-modal-backdrop" className="hab-modal hab-modal--assign">
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
      <div className="hab-modal__body">
        <div className="hab-modal__kicker">
          <span>{playerName}{role ? ` · ${role}` : ''} · {slotLabel}</span>
        </div>
        <h2 className="hab-modal__title">{copy.title}</h2>

        <input
          className="hab-assign-search"
          type="text"
          autoFocus
          placeholder="Buscar habilidad o campeón..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />

        <div className="hab-assign-list">
          {options.length === 0 && <p className="hab-modal__hint">{search.trim() ? 'Ninguna habilidad coincide' : empty}</p>}
          {options.map(ref => {
            const current = sameAbilityName(ref.name, currentName);
            return (
              <button
                key={ref.name}
                type="button"
                className={cx('hab-assign-item', current && 'hab-assign-item--current')}
                disabled={saving}
                onClick={() => (current ? onClose() : onChoose(ref.name))}
              >
                {ref.image
                  ? <img src={ref.image} alt="" />
                  : <span className="hab-assign-item__fallback">{ref.champion.charAt(0)}</span>}
                <span className="hab-assign-item__text">
                  <span className="hab-assign-item__name">{ref.name}</span>
                  <span className="hab-assign-item__meta">{ref.champion}</span>
                </span>
                <span className="hab-assign-item__key">{current ? 'Asignada' : ref.slot}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="hab-modal__error">{error}</p>}

        <div className="hab-modal__actions">
          {currentName && (
            <button type="button" className="hab-modal__btn" onClick={() => onChoose(null)} disabled={saving}>
              {saving ? 'Guardando…' : 'Vaciar'}
            </button>
          )}
          <button type="button" className="hab-modal__btn hab-modal__btn--ghost" onClick={onClose} disabled={saving}>
            Cerrar
          </button>
        </div>
      </div>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    </Modal>,
    document.body,
  );
};

export default AbilityAssignModal;
