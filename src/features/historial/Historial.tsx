import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { findItem } from '../../data/items';
import {
  loadHistory,
  revertHistory,
  revertHistoryBatch,
  type HistoryEntry,
  type HistoryKind,
} from '../../data/history';
import { useLiveRevision } from '../../data/live';
import { useCanEdit } from '../../data/appRoleContext';
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

const entryKey = (entry: { id: string; kind: HistoryKind }) => `${entry.kind}:${entry.id}`;

const Historial = () => {
  const canEdit = useCanEdit();
  const canRevert = (entry: HistoryEntry) => canEdit || entry.kind === 'compra' || entry.kind === 'venta';
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('todo');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<HistoryEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [summary, setSummary] = useState<{ text: string; error: boolean } | null>(null);
  // Tiradas, compras o reversiones hechas en otra pestaña: se vuelve a pedir el historial.
  const historyRevision = useLiveRevision('history');
  const [refreshTick, setRefreshTick] = useState(0);

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
  }, [historyRevision, refreshTick]);

  const visible = filter === 'todo' ? entries : entries.filter(entry => entry.kind === filter);
  const selectable = canEdit ? visible.filter(entry => !entry.reverted) : [];
  const selectedVisible = selectable.filter(entry => selected.has(entryKey(entry)));
  const allSelected = selectable.length > 0 && selectedVisible.length === selectable.length;
  const busy = bulkBusy || busyId !== null;

  // Al cambiar de filtro o recargar, se olvida lo que ya no se ve.
  useEffect(() => {
    setSelected(current => {
      if (current.size === 0) return current;
      const keep = new Set(visible.filter(entry => !entry.reverted).map(entryKey));
      const next = new Set([...current].filter(key => keep.has(key)));
      return next.size === current.size ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, filter]);

  const toggle = (entry: HistoryEntry) => {
    const key = entryKey(entry);
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectable.map(entryKey)));
  };

  const clearRowError = (key: string) => {
    setRowErrors(current => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const revert = async () => {
    if (!pending || pending.reverted || busy || !canRevert(pending)) return;
    const entry = pending;
    const key = entryKey(entry);
    setBusyId(entry.id);
    clearRowError(key);
    try {
      await revertHistory(entry.id, entry.kind);
      setEntries(current => current.filter(item => item.id !== entry.id || item.kind !== entry.kind));
      setPending(null);
    } catch (error) {
      setRowErrors(current => ({ ...current, [key]: error instanceof Error ? error.message : 'No se pudo revertir' }));
      setPending(null);
    } finally {
      setBusyId(null);
    }
  };

  const revertSelected = async () => {
    if (busy || selectedVisible.length === 0) return;
    const targets = selectedVisible.map(entry => ({ id: entry.id, kind: entry.kind }));
    setBulkBusy(true);
    setSummary(null);
    try {
      const { ok, failed } = await revertHistoryBatch(targets);
      const okKeys = new Set(ok.map(entryKey));
      setEntries(current => current.filter(item => !okKeys.has(entryKey(item))));
      setRowErrors(current => {
        const next = { ...current };
        for (const key of okKeys) delete next[key];
        for (const fail of failed) next[entryKey(fail)] = fail.error;
        return next;
      });
      setSelected(new Set(failed.map(entryKey)));
      const done = ok.length === 1 ? '1 entrada revertida' : `${ok.length} entradas revertidas`;
      setSummary(failed.length === 0
        ? { text: `${done}.`, error: false }
        : { text: `${done}; ${failed.length} no se pudieron revertir (mira el motivo en cada una).`, error: true });
      setRefreshTick(tick => tick + 1);
    } catch (error) {
      setSummary({ text: error instanceof Error ? error.message : 'No se pudo revertir', error: true });
    } finally {
      setBulkBusy(false);
      setBulkConfirm(false);
    }
  };

  const bulkCounts = (Object.keys(KIND_LABEL) as HistoryKind[])
    .map(kind => ({ kind, count: selectedVisible.filter(entry => entry.kind === kind).length }))
    .filter(row => row.count > 0);

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

      {canEdit && selectable.length > 0 && (
        <div className="hist-bulk">
          <label className="hist-select-all">
            <input
              type="checkbox"
              className="hist-check"
              checked={allSelected}
              disabled={busy}
              onChange={toggleAll}
            />
            Seleccionar todo
          </label>
          {selectedVisible.length > 0 && (
            <>
              <span className="hist-bulk__count">
                {selectedVisible.length === 1 ? '1 seleccionada' : `${selectedVisible.length} seleccionadas`}
              </span>
              <span className="hist-bulk__spacer" />
              <button type="button" className="hist-confirm__cancel" disabled={busy} onClick={() => setSelected(new Set())}>
                Quitar selección
              </button>
              <button type="button" className="hist-revert" disabled={busy} onClick={() => setBulkConfirm(true)}>
                {bulkBusy ? 'Revirtiendo' : `Borrar ${selectedVisible.length}`}
              </button>
            </>
          )}
        </div>
      )}

      {summary && <p className={cx('hist-summary', summary.error && 'hist-summary--error')}>{summary.text}</p>}

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
          const key = entryKey(entry);
          const error = rowErrors[key] ?? null;
          const isSelected = canEdit && selected.has(key);
          return (
            <article
              key={`${entry.kind}-${entry.id}`}
              className={cx('hist-row', entry.reverted && 'hist-row--reverted', isSelected && 'hist-row--selected')}
            >
              {canEdit && (
                <input
                  type="checkbox"
                  className="hist-check"
                  aria-label={`Seleccionar ${entry.item}`}
                  checked={isSelected}
                  disabled={entry.reverted || busy}
                  onChange={() => toggle(entry)}
                />
              )}
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

              {canRevert(entry) ? (
                <button
                  type="button"
                  className="hist-revert"
                  disabled={entry.reverted || busy}
                  onClick={() => setPending(entry)}
                >
                  {entry.reverted ? 'Revertido' : busyId === entry.id ? 'Revirtiendo' : 'Revertir'}
                </button>
              ) : (
                entry.reverted ? <span className="hist-revert" style={{ opacity: 0.5 }}>Revertido</span> : null
              )}
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

      {bulkConfirm && (
        <Modal onClose={() => { if (!bulkBusy) setBulkConfirm(false); }} backdropClassName="hist-confirm-backdrop" className="hist-confirm">
          <h2 className="hist-confirm__title">
            Borrar {selectedVisible.length === 1 ? '1 entrada' : `${selectedVisible.length} entradas`}
          </h2>
          <p className="hist-confirm__text">
            Cada una se revierte como si pulsaras «Revertir»: se deshace su efecto en stock y oro y desaparece del historial.
          </p>
          <ul className="hist-confirm__list">
            {bulkCounts.map(row => (
              <li key={row.kind}>{KIND_LABEL[row.kind]}: {row.count}</li>
            ))}
          </ul>
          <div className="hist-confirm__actions">
            <button type="button" className="hist-confirm__cancel" disabled={bulkBusy} onClick={() => setBulkConfirm(false)}>
              Cancelar
            </button>
            <button type="button" className="hist-revert" disabled={bulkBusy} onClick={() => { void revertSelected(); }}>
              {bulkBusy ? 'Revirtiendo' : `Borrar ${selectedVisible.length}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Historial;
