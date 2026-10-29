import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { findItem } from '../../data/items';
import {
  loadHistory,
  revertHistory,
  type HistoryEntry,
  type HistoryKind,
} from '../../data/history';
import { useLiveRevision } from '../../data/live';
import { cx } from '../../lib/cx';
import './Historial.css';

type Filter = 'todo' | HistoryKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'tirada', label: 'Tiradas' },
  { id: 'crafteo', label: 'Crafteos' },
  { id: 'compra', label: 'Compras' },
  { id: 'venta', label: 'Ventas' },
];

const KIND_LABEL: Record<HistoryKind, string> = {
  tirada: 'Tirada',
  crafteo: 'Crafteo',
  compra: 'Compra',
  venta: 'Venta',
};

const ROLL_LABEL: Record<string, string> = {
  basico: 'básica',
  epico: 'épica',
  legendario: 'legendaria',
};

const OUTCOME_LABEL: Record<string, string> = {
  basico: 'básico',
  epico: 'épico',
  legendario: 'legendario',
};

const rollDetail = (entry: HistoryEntry): string => {
  const rolled = (entry.tirada && ROLL_LABEL[entry.tirada]) || entry.tirada || '';
  const outcome = (entry.rareza && OUTCOME_LABEL[entry.rareza]) || entry.rareza || '';
  if (!rolled) return 'Tirada';
  if (!outcome || entry.tirada === entry.rareza) return `Tirada ${rolled}`;
  return `Tirada ${rolled} · salió ${outcome}`;
};

const craftDetail = (entry: HistoryEntry): string => {
  const lines = entry.ingredients ?? [];
  const parts = lines.map(line => `${line.nombre} ×${line.cantidad}`);
  if (typeof entry.oro === 'number' && entry.oro > 0) parts.push(`${entry.oro.toLocaleString('es-ES')} oro`);
  if (parts.length === 0) return 'Sin ingredientes';
  return parts.join(', ');
};

const shopDetail = (entry: HistoryEntry): string => {
  const copies = `×${entry.cantidad ?? 1}`;
  if (typeof entry.oro === 'number' && entry.oro > 0) return `${copies} · ${entry.oro.toLocaleString('es-ES')} oro`;
  return copies;
};

const revertText = (entry: HistoryEntry): string => {
  if (entry.kind === 'tirada') return 'Se quita una copia del stock y esta tirada desaparece del historial.';
  if (entry.kind === 'compra' || entry.kind === 'venta') {
    const copies = entry.cantidad ?? 1;
    const gold = typeof entry.oro === 'number' && entry.oro > 0
      ? entry.oro.toLocaleString('es-ES')
      : '';
    const removed = copies === 1 ? 'Se quita 1 copia' : `Se quitan ${copies} copias`;
    const restored = copies === 1 ? 'Se devuelve 1 copia' : `Se devuelven ${copies} copias`;
    if (entry.kind === 'compra') {
      const refund = gold ? `, se devuelven ${gold} de oro` : '';
      return `${removed}${refund}, y esta compra desaparece del historial.`;
    }
    const charge = gold ? `, se cobran ${gold} de oro` : '';
    return `${restored}${charge}, y esta venta desaparece del historial.`;
  }
  const gold = typeof entry.oro === 'number' && entry.oro > 0
    ? ` y ${entry.oro.toLocaleString('es-ES')} de oro`
    : '';
  return `Se quita el resultado, se devuelven los ingredientes${gold}, y este crafteo desaparece del historial.`;
};

const Historial = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('todo');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<HistoryEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  // Tiradas, compras o reversiones hechas en otra pestaña: se vuelve a pedir el historial.
  const historyRevision = useLiveRevision('history');

  useEffect(() => {
    let active = true;
    loadHistory()
      .then(next => {
        if (active) setEntries(next);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'No se pudo cargar el historial');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [historyRevision]);

  const visible = filter === 'todo' ? entries : entries.filter(entry => entry.kind === filter);

  const revert = async () => {
    if (!pending || pending.reverted || busyId) return;
    const entry = pending;
    setBusyId(entry.id);
    setRowError(null);
    try {
      await revertHistory(entry.id, entry.kind);
      setEntries(current => current.filter(item => item.id !== entry.id || item.kind !== entry.kind));
      setPending(null);
    } catch (error) {
      setRowError({ id: entry.id, text: error instanceof Error ? error.message : 'No se pudo revertir' });
      setPending(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="hist-root">
      <div className="hist-filters">
        {FILTERS.map(option => (
          <button
            key={option.id}
            type="button"
            className={cx('hist-filter', filter === option.id && 'hist-filter--active')}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
        <span className="hist-count">{visible.length}</span>
      </div>

      {loading && <p className="hist-status">Cargando el historial…</p>}
      {loadError && <p className="hist-status hist-status--error">{loadError}</p>}

      {!loading && !loadError && visible.length === 0 && (
        <div className="hist-empty">
          <span className="hist-empty__icon">📜</span>
          <p>Todavía no hay nada en el historial</p>
        </div>
      )}

      <div className="hist-list">
        {visible.map(entry => {
          const image = findItem(entry.item)?.imagen;
          const error = rowError?.id === entry.id ? rowError.text : null;
          return (
            <article key={`${entry.kind}-${entry.id}`} className={cx('hist-row', entry.reverted && 'hist-row--reverted')}>
              {image
                ? <img className="hist-row__img" src={image} alt="" />
                : <div className="hist-row__img hist-row__img--empty">✦</div>}

              <div className="hist-row__body">
                <div className="hist-row__title">
                  <span className={cx('hist-kind', `hist-kind--${entry.kind}`)}>
                    {KIND_LABEL[entry.kind]}
                  </span>
                  <h2 className="hist-row__name">{entry.item}</h2>
                  <time className="hist-row__time">{entry.timestamp}</time>
                </div>
                <p className="hist-row__detail">
                  {entry.kind === 'tirada'
                    ? rollDetail(entry)
                    : entry.kind === 'crafteo'
                      ? craftDetail(entry)
                      : shopDetail(entry)}
                </p>
                {error && <p className="hist-row__error">{error}</p>}
              </div>

              <button
                type="button"
                className="hist-revert"
                disabled={entry.reverted || busyId === entry.id}
                onClick={() => setPending(entry)}
              >
                {entry.reverted ? 'Revertido' : busyId === entry.id ? 'Revirtiendo' : 'Revertir'}
              </button>
            </article>
          );
        })}
      </div>

      {pending && (
        <Modal onClose={() => { if (!busyId) setPending(null); }} backdropClassName="hist-confirm-backdrop" className="hist-confirm">
          <h2 className="hist-confirm__title">Revertir {pending.item}</h2>
          <p className="hist-confirm__text">{revertText(pending)}</p>
          <div className="hist-confirm__actions">
            <button type="button" className="hist-confirm__cancel" disabled={busyId === pending.id} onClick={() => setPending(null)}>
              Cancelar
            </button>
            <button type="button" className="hist-revert" disabled={busyId === pending.id} onClick={() => { void revert(); }}>
              {busyId === pending.id ? 'Revirtiendo' : 'Revertir'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Historial;
