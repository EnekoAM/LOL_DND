import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import ThumbImg from '../../components/ThumbImg';
import { ITEMS } from '../../data/items';
import { itemAvailability } from '../items/stock';
import { matchesSearch, normalizeName } from '../../lib/text';
import ItemCompareModal from './ItemCompareModal';

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
  /** Optional slot actions; absent in the normal add picker. */
  onRemove?: () => void;
  description?: string;
  allowSelection?: boolean;
  /** Ítem actualmente equipado en el hueco (activa la lupa de comparación). */
  compareWith?: string;
};

const BuildPicker = ({
  title,
  busy,
  onlyAvailable = false,
  taken,
  takenLabel = 'Ya añadido',
  onAdd,
  onClose,
  onRemove,
  description,
  allowSelection = true,
  compareWith,
}: Props) => {
  const [search, setSearch] = useState('');
  const [compareName, setCompareName] = useState<string | null>(null);
  const takenKeys = useMemo(() => new Set((taken ?? []).map(normalizeName)), [taken]);
  const results = ITEMS
    .filter(item => (!onlyAvailable || itemAvailability(item).available > 0) && matchesSearch(item.nombre, search))
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  if (compareName && compareWith) {
    return (
      <ItemCompareModal
        currentName={compareWith}
        candidateName={compareName}
        busy={busy}
        onBack={() => setCompareName(null)}
        onAccept={() => {
          onAdd(compareName);
        }}
      />
    );
  }

  return (
    <Modal onClose={onClose} backdropClassName="calc-modal-backdrop" className="calc-modal calc-modal--picker">
      <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>

      <div className="calc-modal__body" role="dialog" aria-modal="true" aria-label={title}>
        <div className="calc-modal__title">{title}</div>
        {description && <p className="hab-modal__hint">{description}</p>}
        {onRemove && (
          <button type="button" className="calc-modal__close" disabled={busy} onClick={onRemove}>
            Quitar ítem del equipamiento
          </button>
        )}
        {allowSelection && <span className="search-clear-wrap">
          <input
            className="calc-picker-search"
            type="text"
            autoFocus
            placeholder="Buscar ítem..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          {search && (
            <button type="button" className="search-clear" aria-label="Borrar búsqueda" title="Borrar" onClick={() => setSearch('')}>×</button>
          )}
        </span>}

        {allowSelection && <div className="calc-picker-grid">
          {results.length === 0 && (
            <div className="calc-picker-empty">
              {search.trim() || !onlyAvailable ? 'Ningún ítem coincide' : 'No hay ítems disponibles'}
            </div>
          )}
          {results.map(item => {
            const included = taken !== undefined && takenKeys.has(normalizeName(item.nombre));
            return (
              <div key={item.nombre} className="calc-picker-item-wrap">
                {compareWith && (
                  <button
                    type="button"
                    className="calc-picker-item__lupa"
                    aria-label={`Comparar ${item.nombre} con ${compareWith}`}
                    title="Comparar con el equipado"
                    disabled={busy}
                    onClick={event => {
                      event.stopPropagation();
                      setCompareName(item.nombre);
                    }}
                  >
                    🔍
                  </button>
                )}
                <button
                  type="button"
                  className="calc-picker-item"
                  disabled={busy || included}
                  onClick={() => onAdd(item.nombre)}
                >
                  {item.imagen
                    ? <ThumbImg src={item.imagen} thumbWidth={128} alt="" />
                    : <span className="calc-picker-item__fallback">✦</span>
                  }
                  <span className="calc-picker-item__name" title={item.nombre}>{item.nombre}</span>
                  {included && <span className="calc-picker-item__tag">{takenLabel}</span>}
                </button>
              </div>
            );
          })}
        </div>}

        <button type="button" className="calc-modal__close" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>
    </Modal>
  );
};

export default BuildPicker;
