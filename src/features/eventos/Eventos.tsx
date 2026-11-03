import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { useCanEdit } from '../../data/appRoleContext';
import {
  EVENT_BODY_MAX,
  EVENT_SESSION_MAX,
  EVENT_TITLE_MAX,
  createEvent,
  deleteEvent,
  loadEvents,
  reorderEvents,
  sortEvents,
  updateEvent,
  type CampaignEvent,
  type EventDraft,
} from '../../data/events';
import { useLiveRevision } from '../../data/live';
import { cx } from '../../lib/cx';
import FaqText from '../mecanicas/FaqText';
import '../mecanicas/Mecanicas.css';
import './Eventos.css';

/** Solo admin: los players ya solo reciben los visibles. Visible = ya pasó; oculto = planeado. */
type Filter = 'todos' | 'visibles' | 'ocultos';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'visibles', label: 'Visibles' },
  { id: 'ocultos', label: 'Ocultos' },
];

/** Sin tildes ni mayúsculas, para buscar «dragon» y encontrar «Dragón». */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

type Editing = {
  id: string | null;
  /** Solo al crear: se inserta debajo de este evento. */
  afterId?: string;
  draft: EventDraft;
};

const emptyDraft = (visibleToPlayers = false): EventDraft => ({
  title: '',
  body: '',
  session: '',
  visibleToPlayers,
});

const draftOf = (event: CampaignEvent): EventDraft => ({
  title: event.title,
  body: event.body,
  session: event.session ?? '',
  visibleToPlayers: event.visibleToPlayers,
});

/** Mueve el elemento `from` a la posición `to` (índices de la lista completa). */
function moveId(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return ids;
  next.splice(to, 0, moved);
  return next;
}

const Eventos = () => {
  const canEdit = useCanEdit();
  const revision = useLiveRevision('events');
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CampaignEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEvents(await loadEvents());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los eventos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, revision, canEdit]);

  /** Número de cada evento en la línea temporal completa (1, 2, 3…). */
  const position = useMemo(() => new Map(events.map((event, index) => [event.id, index + 1])), [events]);

  const visible = useMemo(() => {
    const needle = fold(query.trim());
    return events.filter(event => {
      if (filter === 'visibles' && !event.visibleToPlayers) return false;
      if (filter === 'ocultos' && event.visibleToPlayers) return false;
      if (!needle) return true;
      return fold(`${event.title}\n${event.body}\n${event.session ?? ''}`).includes(needle);
    });
  }, [events, query, filter]);

  const counts = useMemo(() => ({
    todos: events.length,
    visibles: events.filter(event => event.visibleToPlayers).length,
    ocultos: events.filter(event => !event.visibleToPlayers).length,
  }), [events]);

  const searching = query.trim() !== '';
  /** Arrastrar solo con la lista completa a la vista (si no, el hueco de destino es ambiguo). */
  const canDrag = canEdit && !busy && !searching && filter === 'todos';
  const allOpen = visible.length > 0 && visible.every(event => open.has(event.id));

  const toggle = (id: string) => {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setOpen(allOpen ? new Set() : new Set(visible.map(event => event.id)));
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveOrder = (ids: string[]) => {
    const byId = new Map(events.map(event => [event.id, event]));
    // Al momento en pantalla; el servidor devuelve la lista buena.
    setEvents(ids.map((id, index) => ({ ...(byId.get(id) as CampaignEvent), order: (index + 1) * 10 })));
    void run(async () => {
      setEvents(await reorderEvents(ids));
    });
  };

  /** Sube o baja un evento una posición en la línea temporal completa. */
  const move = (event: CampaignEvent, direction: -1 | 1) => {
    const index = events.findIndex(item => item.id === event.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= events.length) return;
    saveOrder(moveId(events.map(item => item.id), index, target));
  };

  const onDragStart = (event: DragEvent<HTMLElement>, id: string) => {
    if (!canDrag) return;
    setDragId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  };

  const onDragOver = (event: DragEvent<HTMLElement>, index: number) => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDropIndex(after ? index + 1 : index);
  };

  const endDrag = () => {
    setDragId(null);
    setDropIndex(null);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const id = dragId;
    const slot = dropIndex;
    endDrag();
    if (!id || slot === null) return;
    const from = events.findIndex(item => item.id === id);
    if (from < 0) return;
    // Quitarlo primero desplaza los huecos que hay debajo.
    const to = slot > from ? slot - 1 : slot;
    if (to === from) return;
    saveOrder(moveId(events.map(item => item.id), from, to));
  };

  const toggleVisibility = (event: CampaignEvent) => {
    void run(async () => {
      const saved = await updateEvent(event.id, { visibleToPlayers: !event.visibleToPlayers });
      setEvents(list => list.map(item => (item.id === saved.id ? saved : item)));
    });
  };

  const save = (submit: FormEvent) => {
    submit.preventDefault();
    if (!editing) return;
    const { id, afterId, draft } = editing;
    void run(async () => {
      if (id) {
        const saved = await updateEvent(id, {
          title: draft.title.trim(),
          body: draft.body.trim(),
          session: draft.session.trim() || null,
          visibleToPlayers: draft.visibleToPlayers,
        });
        setEvents(list => sortEvents(list.map(item => (item.id === id ? saved : item))));
      } else {
        const saved = await createEvent(draft, afterId);
        // Insertar en medio renumera la lista: se vuelve a pedir entera.
        if (afterId) setEvents(await loadEvents());
        else setEvents(list => sortEvents([...list, saved]));
        setOpen(prev => new Set(prev).add(saved.id));
      }
      setEditing(null);
    });
  };

  const remove = () => {
    const target = confirmDelete;
    if (!target) return;
    void run(async () => {
      await deleteEvent(target.id);
      setEvents(list => list.filter(item => item.id !== target.id));
      setConfirmDelete(null);
    });
  };

  /** Nuevo evento: oculto (planeado) salvo que se inserte debajo de uno visible o se esté viendo «Visibles». */
  const startCreate = (afterId?: string, visibleToPlayers?: boolean) => {
    setError(null);
    setEditing({ id: null, afterId, draft: emptyDraft(visibleToPlayers ?? filter === 'visibles') });
  };

  const draft = editing?.draft;
  const setDraft = (patch: Partial<EventDraft>) =>
    setEditing(current => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));

  const afterTitle = editing?.afterId ? events.find(event => event.id === editing.afterId)?.title : undefined;

  return (
    <div className="mec-root ev-root">
      <header className="mec-head">
        <div className="mec-head__text">
          <h2 className="mec-head__title">📅 Eventos</h2>
          <p className="mec-head__lead">
            {canEdit
              ? 'La historia de la campaña. Visible = ya ha pasado (lo ven los players); oculto = planeado, solo lo ves tú. Arrastra (o usa ↑ ↓) para ordenar.'
              : 'La historia de la campaña, sesión a sesión. Pulsa un evento para leerlo.'}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="mec-btn mec-btn--primary" disabled={busy} onClick={() => startCreate()}>
            ＋ Nuevo evento
          </button>
        )}
      </header>

      <div className="mec-tools">
        <input
          className="mec-search"
          type="search"
          value={query}
          placeholder="Buscar en los eventos…"
          aria-label="Buscar en los eventos"
          onChange={change => setQuery(change.target.value)}
        />
        {canEdit && (
        <div className="mec-cats" role="tablist" aria-label="Filtrar eventos">
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={cx('mec-cat', filter === item.id && 'mec-cat--on')}
              onClick={() => setFilter(item.id)}
            >
              {item.label} · {counts[item.id]}
            </button>
          ))}
        </div>
        )}
        {visible.length > 0 && (
          <button type="button" className="mec-link" onClick={toggleAll}>
            {allOpen ? 'Cerrar todo' : 'Abrir todo'}
          </button>
        )}
      </div>

      {canEdit && !canDrag && !busy && events.length > 1 && (
        <p className="ev-hint">Para arrastrar, quita la búsqueda y el filtro (↑ ↓ siguen funcionando).</p>
      )}
      {error && <p className="mec-error" role="alert">{error}</p>}
      {loading && <p className="mec-status">Cargando los eventos…</p>}
      {loadError && <p className="mec-status mec-error">{loadError}</p>}
      {!loading && !loadError && events.length === 0 && (
        <div className="mec-empty">
          <span className="mec-empty__icon">📅</span>
          <p>{canEdit ? 'Todavía no hay eventos. Añade el primero con «＋ Nuevo evento».' : 'Todavía no hay eventos.'}</p>
        </div>
      )}
      {!loading && !loadError && events.length > 0 && visible.length === 0 && (
        <p className="mec-status">Nada coincide con la búsqueda.</p>
      )}

      <ol className="ev-timeline" onDragLeave={change => { if (change.currentTarget === change.target) setDropIndex(null); }}>
        {visible.map((event, viewIndex) => {
          const isOpen = searching || open.has(event.id);
          const index = events.findIndex(item => item.id === event.id);
          const dropBefore = dragId !== null && dropIndex === viewIndex;
          const dropAfter = dragId !== null && dropIndex === viewIndex + 1 && viewIndex === visible.length - 1;
          return (
            <li
              key={event.id}
              className={cx(
                'ev-item',
                event.visibleToPlayers ? 'ev-item--visible' : 'ev-item--planned',
                isOpen && 'ev-item--open',
                dragId === event.id && 'ev-item--dragging',
                dropBefore && 'ev-item--drop-before',
                dropAfter && 'ev-item--drop-after',
              )}
              draggable={canDrag}
              onDragStart={drag => onDragStart(drag, event.id)}
              onDragOver={drag => onDragOver(drag, viewIndex)}
              onDrop={onDrop}
              onDragEnd={endDrag}
            >
              <span className="ev-dot" aria-hidden="true">{position.get(event.id)}</span>
              <article className="ev-card">
                <div className="ev-card__head">
                  {canDrag && <span className="ev-grip" title="Arrastra para reordenar" aria-hidden="true">⠿</span>}
                  <button
                    type="button"
                    className="ev-card__toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggle(event.id)}
                  >
                    <span className="mec-item__chevron" aria-hidden="true">▸</span>
                    <span className="ev-card__title">{event.title}</span>
                  </button>
                  <div className="ev-card__meta">
                    {event.session && <span className="ev-chip">{event.session}</span>}
                  </div>
                  {canEdit && (
                    <div className="mec-item__admin ev-card__admin">
                      <button
                        type="button"
                        className={cx('ev-vis', event.visibleToPlayers ? 'ev-vis--on' : 'ev-vis--off')}
                        title={event.visibleToPlayers ? 'Los players lo ven. Pulsa para ocultarlo.' : 'Solo lo ves tú. Pulsa para mostrarlo a los players.'}
                        disabled={busy}
                        onClick={() => toggleVisibility(event)}
                      >
                        {event.visibleToPlayers ? '👁 Visible' : '🚫 Oculto'}
                      </button>
                      <button type="button" className="mec-icon" title="Subir" aria-label="Subir" disabled={busy || index <= 0} onClick={() => move(event, -1)}>↑</button>
                      <button type="button" className="mec-icon" title="Bajar" aria-label="Bajar" disabled={busy || index >= events.length - 1} onClick={() => move(event, 1)}>↓</button>
                      <button type="button" className="mec-icon" title="Insertar un evento debajo" aria-label="Insertar debajo" disabled={busy} onClick={() => startCreate(event.id, event.visibleToPlayers)}>＋</button>
                      <button
                        type="button"
                        className="mec-icon"
                        title="Editar"
                        aria-label="Editar"
                        disabled={busy}
                        onClick={() => { setError(null); setEditing({ id: event.id, draft: draftOf(event) }); }}
                      >
                        ✎
                      </button>
                      <button type="button" className="mec-icon mec-icon--danger" title="Borrar" aria-label="Borrar" disabled={busy} onClick={() => setConfirmDelete(event)}>✕</button>
                    </div>
                  )}
                </div>
                {isOpen && (
                  <div className="ev-card__body">
                    {event.body.trim()
                      ? <FaqText body={event.body} />
                      : <p className="mec-status ev-card__empty">Sin descripción.</p>}
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>

      {editing && draft && canEdit && (
        <Modal onClose={() => { if (!busy) setEditing(null); }} backdropClassName="mec-modal-backdrop" className="mec-modal">
          <form className="mec-form" onSubmit={save}>
            <h2 className="mec-modal__title">{editing.id ? 'Editar evento' : 'Nuevo evento'}</h2>
            {afterTitle && <p className="ev-hint">Se insertará justo debajo de «{afterTitle}».</p>}
            <label className="mec-field">
              <span className="mec-field__label">Título</span>
              <input
                className="mec-input"
                type="text"
                value={draft.title}
                maxLength={EVENT_TITLE_MAX}
                required
                autoFocus
                placeholder="Emboscada en el paso de Freljord"
                onChange={change => setDraft({ title: change.target.value })}
              />
            </label>
            <label className="mec-field">
              <span className="mec-field__label">Sesión o etiqueta (opcional)</span>
              <input
                className="mec-input"
                type="text"
                value={draft.session}
                maxLength={EVENT_SESSION_MAX}
                placeholder="Sesión 4"
                onChange={change => setDraft({ session: change.target.value })}
              />
            </label>
            <label className="ev-check">
              <input
                type="checkbox"
                checked={draft.visibleToPlayers}
                onChange={change => setDraft({ visibleToPlayers: change.target.checked })}
              />
              <span>{draft.visibleToPlayers ? 'Visible para los players: ya ha pasado' : 'Oculto: planeado, solo lo ves tú'}</span>
            </label>
            <label className="mec-field">
              <span className="mec-field__label">Descripción (opcional)</span>
              <textarea
                className="mec-input mec-input--body"
                value={draft.body}
                maxLength={EVENT_BODY_MAX}
                rows={8}
                placeholder="Cuenta el evento en unas líneas."
                onChange={change => setDraft({ body: change.target.value })}
              />
              <span className="mec-field__hint">
                Formato: línea en blanco = párrafo nuevo · «- » lista · «1. » lista numerada · **negrita** · {draft.body.length}/{EVENT_BODY_MAX}
              </span>
            </label>
            {draft.body.trim() && (
              <div className="mec-preview">
                <span className="mec-field__label">Vista previa</span>
                <FaqText body={draft.body} />
              </div>
            )}
            {error && <p className="mec-error" role="alert">{error}</p>}
            <div className="mec-modal__actions">
              <button type="button" className="mec-btn mec-btn--ghost" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="mec-btn mec-btn--primary" disabled={busy || !draft.title.trim()}>
                {busy ? 'Guardando' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && canEdit && (
        <Modal onClose={() => { if (!busy) setConfirmDelete(null); }} backdropClassName="mec-modal-backdrop" className="mec-modal mec-modal--small">
          <h2 className="mec-modal__title">Borrar evento</h2>
          <p className="mec-modal__text">«{confirmDelete.title}» desaparece de la línea temporal para todos. No se puede deshacer.</p>
          {error && <p className="mec-error" role="alert">{error}</p>}
          <div className="mec-modal__actions">
            <button type="button" className="mec-btn mec-btn--ghost" disabled={busy} onClick={() => setConfirmDelete(null)}>Cancelar</button>
            <button type="button" className="mec-btn mec-btn--danger" disabled={busy} onClick={remove}>{busy ? 'Borrando' : 'Borrar'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Eventos;
