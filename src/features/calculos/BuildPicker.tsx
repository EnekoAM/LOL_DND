import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { ITEMS } from '../../data/items';
import { itemAvailability } from '../items/stock';
import { matchesSearch, normalizeName } from '../../lib/text';

type Props = {
  title: string;
  busy: boolean;
  /** Solo copias que el grupo tiene y nadie lleva equipadas. */
  onlyAvailable?: boolean;
  /** Si se pasa, esos ítems no se pueden volver a añadir. */
  taken?: string[];
  takenLabel?: string;
  onAdd: (itemName: string) => void;
  onClose: () => void;
};

const BuildPicker = ({ title, busy, onlyAvailable = false, taken, takenLabel = 'Ya añadido', onAdd, onClose }: Props) => {
  const [search, setSearch] = useState('');
  const takenKeys = useMemo(() => new Set((taken ?? []).map(normalizeName)), [taken]);
  const results = ITEMS
    .filter(item => (!onlyAvailable || itemAvailability(item).available > 0) && matchesSearch(item.nombre, search))
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <Modal onClose={onClose} backdropClassName="calc-modal-backdrop" className="calc-modal calc-modal--picker">
      <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>

      <div className="calc-modal__body">
        <div className="calc-modal__title">{title}</div>
        <input
          className="calc-picker-search"
          type="text"
          autoFocus
          placeholder="Buscar ítem..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />

        <div className="calc-picker-grid">
          {results.length === 0 && (
            <div className="calc-picker-empty">
              {search.trim() || !onlyAvailable ? 'Ningún ítem coincide' : 'No hay ítems disponibles'}
            </div>
          )}
          {results.map(item => {
            const included = taken !== undefined && takenKeys.has(normalizeName(item.nombre));
            return (
              <button
                key={item.nombre}
                type="button"
                className="calc-picker-item"
                disabled={busy || included}
                onClick={() => onAdd(item.nombre)}
              >
                {item.imagen
                  ? <img src={item.imagen} alt="" />
                  : <span className="calc-picker-item__fallback">✦</span>
                }
                <span className="calc-picker-item__name" title={item.nombre}>{item.nombre}</span>
                {included && <span className="calc-picker-item__tag">{takenLabel}</span>}
              </button>
            );
          })}
        </div>

        <button type="button" className="calc-modal__close" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>
    </Modal>
  );
};

export default BuildPicker;
