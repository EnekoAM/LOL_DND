import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { useCanEdit, useMyPlayerName } from '../../data/appRoleContext';
import { useLiveRevision } from '../../data/live';
import {
  TICKET_AUTHOR_MAX,
  TICKET_COMMENT_MAX,
  TICKET_TEXT_MAX,
  TICKET_TITLE_MAX,
  addTicketComment,
  createTicket,
  deleteTicket,
  loadTickets,
  setTicketArchived,
  setTicketStatus,
  type Ticket,
  type TicketStatus,
} from '../../data/tickets';
import './Sugerencias.css';

const AUTHOR_KEY = 'lol-dnd:ticket-author';

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  completed: 'Completada',
};

const STATUS_BUSY: Record<TicketStatus, string> = {
  pending: 'Reabriendo',
  accepted: 'Aceptando',
  rejected: 'Rechazando',
  completed: 'Completando',
};

type Filter = 'all' | 'pending' | 'accepted' | 'rejected' | 'completed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'accepted', label: 'Aceptados' },
  { key: 'rejected', label: 'Rechazados' },
  { key: 'completed', label: 'Completados' },
];

const PAGE_SIZE = 50;

/**
 * Borrador de la sugerencia en memoria (no en localStorage): se mantiene al cambiar de pestaña
 * dentro de la app y se pierde al recargar la página o al cambiar/cerrar sesión con el personaje.
 */
const draftMemo = { owner: '', title: '', text: '' };
const draftOwner = (name: string | null | undefined): string => name || '';

const sortNewest = (list: Ticket[]): Ticket[] =>
  [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const Sugerencias = () => {
  const canEdit = useCanEdit();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const myName = useMyPlayerName();
  const [title, setTitle] = useState(() => (draftMemo.owner === draftOwner(myName) ? draftMemo.title : ''));
  const [text, setText] = useState(() => (draftMemo.owner === draftOwner(myName) ? draftMemo.text : ''));
  // Si entró como player y nunca escribió un nombre, se propone el suyo.
  const [author, setAuthor] = useState(() => localStorage.getItem(AUTHOR_KEY) || myName || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<Ticket | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyStatus, setBusyStatus] = useState<TicketStatus | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  /** Ver las archivadas (solo admin) en vez de las normales. */
  const [showArchived, setShowArchived] = useState(false);
  const [busyArchive, setBusyArchive] = useState(false);
  /** Borrador del comentario por sugerencia y la que se está enviando. */
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentBusy, setCommentBusy] = useState<string | null>(null);
  /** Caja de comentario abierta por sugerencia (cerrada por defecto). */
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const setOpen = (id: string, open: boolean) => setCommentOpen(current => ({ ...current, [id]: open }));
  // Sugerencias creadas o borradas en otra pestaña: se vuelve a pedir la lista.
  const ticketsRevision = useLiveRevision('tickets');

  // Al cambiar de personaje (o cerrar sesión) se descarta el borrador del anterior.
  useEffect(() => {
    const owner = draftOwner(myName);
    if (draftMemo.owner === owner) return;
    draftMemo.owner = owner;
    draftMemo.title = '';
    draftMemo.text = '';
    setTitle('');
    setText('');
  }, [myName]);

  useEffect(() => {
    if (draftMemo.owner !== draftOwner(myName)) return;
    draftMemo.title = title;
    draftMemo.text = text;
  }, [title, text, myName]);

  useEffect(() => {
    let active = true;
    loadTickets()
      .then(next => {
        if (active) {
          setTickets(sortNewest(next));
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las sugerencias');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ticketsRevision]);

  // Archivadas: fuera de las listas normales; el admin las ve con el botón «Archivadas».
  const archivedCount = useMemo(() => tickets.filter(item => item.archived).length, [tickets]);
  const viewing = showArchived && canEdit;
  const base = useMemo(() => tickets.filter(item => !!item.archived === viewing), [tickets, viewing]);
  const counts = useMemo<Record<Filter, number>>(() => ({
    all: base.length,
    pending: base.filter(item => item.status === 'pending').length,
    accepted: base.filter(item => item.status === 'accepted').length,
    rejected: base.filter(item => item.status === 'rejected').length,
    completed: base.filter(item => item.status === 'completed').length,
  }), [base]);
  const filtered = useMemo(
    () => (filter === 'all' ? base : base.filter(item => item.status === filter)),
    [base, filter],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Si al borrar/cambiar estado la página se queda vacía, se baja a la última que exista.
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const trimmed = text.trim();
  const trimmedTitle = title.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || !trimmedTitle || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const saved = await createTicket(trimmedTitle, trimmed, author);
      localStorage.setItem(AUTHOR_KEY, author.trim());
      setTickets(current => sortNewest([saved, ...current.filter(item => item.id !== saved.id)]));
      setTitle('');
      setText('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar la sugerencia');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (ticket: Ticket, status: TicketStatus) => {
    if (busyId || !canEdit || ticket.status === status) return;
    setBusyId(ticket.id);
    setBusyStatus(status);
    setRowError(null);
    try {
      const saved = await setTicketStatus(ticket.id, status);
      setTickets(current => current.map(item => (item.id === saved.id ? saved : item)));
    } catch (error) {
      setRowError({ id: ticket.id, text: error instanceof Error ? error.message : 'No se pudo cambiar el estado' });
    } finally {
      setBusyId(null);
      setBusyStatus(null);
    }
  };

  const sendComment = async (ticket: Ticket) => {
    const draft = (commentDrafts[ticket.id] ?? '').trim();
    if (!draft || commentBusy || ticket.status !== 'pending') return;
    setCommentBusy(ticket.id);
    setRowError(null);
    try {
      const saved = await addTicketComment(ticket.id, draft, author.trim() || myName || '');
      setTickets(current => current.map(item => (item.id === saved.id ? saved : item)));
      setCommentDrafts(current => {
        const next = { ...current };
        delete next[ticket.id];
        return next;
      });
      setOpen(ticket.id, false);
    } catch (error) {
      setRowError({ id: ticket.id, text: error instanceof Error ? error.message : 'No se pudo guardar el comentario' });
    } finally {
      setCommentBusy(null);
    }
  };

  const toggleArchive = async (ticket: Ticket) => {
    if (busyId || !canEdit) return;
    setBusyId(ticket.id);
    setBusyArchive(true);
    setRowError(null);
    try {
      const saved = await setTicketArchived(ticket.id, !ticket.archived);
      setTickets(current => current.map(item => (item.id === saved.id ? { ...saved, archived: saved.archived === true } : item)));
    } catch (error) {
      setRowError({ id: ticket.id, text: error instanceof Error ? error.message : 'No se pudo archivar' });
    } finally {
      setBusyId(null);
      setBusyArchive(false);
    }
  };

  const remove = async () => {
    if (!pending || busyId || !canEdit) return;
    const ticket = pending;
    setBusyId(ticket.id);
    setRowError(null);
    try {
      await deleteTicket(ticket.id);
      setTickets(current => current.filter(item => item.id !== ticket.id));
    } catch (error) {
      setRowError({ id: ticket.id, text: error instanceof Error ? error.message : 'No se pudo borrar' });
    } finally {
      setPending(null);
      setBusyId(null);
    }
  };

  return (
    <div className="sug-root">
      <form className="sug-form" onSubmit={event => { void submit(event); }}>
        <h2 className="sug-form__title">Nueva sugerencia</h2>
        <label className="sug-field">
          <span className="sug-field__label">Nombre</span>
          <input
            className="sug-form__author"
            type="text"
            value={author}
            maxLength={TICKET_AUTHOR_MAX}
            placeholder="Tu nombre (opcional)"
            onChange={event => setAuthor(event.target.value)}
          />
        </label>
        <label className="sug-field">
          <span className="sug-field__label">Título de la sugerencia</span>
          <input
            className="sug-form__titleinput"
            type="text"
            value={title}
            maxLength={TICKET_TITLE_MAX}
            required
            placeholder="Resumen en pocas palabras"
            onChange={event => setTitle(event.target.value)}
          />
        </label>
        <label className="sug-field">
          <span className="sug-field__label">Texto</span>
          <textarea
            className="sug-form__text"
            value={text}
            maxLength={TICKET_TEXT_MAX}
            rows={4}
            placeholder="¿Qué mejorarías, qué falla o qué echas en falta?"
            required
            onChange={event => setText(event.target.value)}
          />
        </label>
        <div className="sug-form__row">
          <span className="sug-form__count">{text.length}/{TICKET_TEXT_MAX}</span>
          <button type="submit" className="sug-btn" disabled={!trimmed || !trimmedTitle || saving}>
            {saving ? 'Enviando' : 'Enviar'}
          </button>
        </div>
        {formError && <p className="sug-error">{formError}</p>}
      </form>

      <div className="sug-head">
        <span className="sug-head__label">Sugerencias</span>
        <div className="sug-filters" role="tablist" aria-label="Filtrar sugerencias">
          {FILTERS.map(item => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={`sug-filter${filter === item.key ? ' sug-filter--active' : ''}`}
              onClick={() => { setFilter(item.key); setPage(1); }}
            >
              {item.label}
              <span className="sug-filter__count">{counts[item.key]}</span>
            </button>
          ))}
        </div>
        {canEdit && (archivedCount > 0 || viewing) && (
          <button
            type="button"
            className={`sug-filter${viewing ? ' sug-filter--active' : ''}`}
            aria-pressed={viewing}
            title={viewing ? 'Volver a las sugerencias normales' : 'Ver las sugerencias archivadas'}
            onClick={() => { setShowArchived(on => !on); setPage(1); }}
          >
            Archivadas
            <span className="sug-filter__count">{archivedCount}</span>
          </button>
        )}
        <span className="sug-count">{filtered.length}</span>
      </div>

      {loading && <p className="sug-status">Cargando las sugerencias…</p>}
      {loadError && <p className="sug-status sug-error">{loadError}</p>}

      {!loading && !loadError && tickets.length === 0 && (
        <div className="sug-empty">
          <span className="sug-empty__icon">💡</span>
          <p>Todavía no hay sugerencias</p>
        </div>
      )}

      {!loading && !loadError && tickets.length > 0 && filtered.length === 0 && (
        <p className="sug-status">No hay sugerencias con este filtro</p>
      )}

      <div className="sug-list">
        {visible.map(ticket => {
          const error = rowError?.id === ticket.id ? rowError.text : null;
          const busy = busyId === ticket.id;
          return (
            <article key={ticket.id} className={`sug-row sug-row--${ticket.status}`}>
              <div className="sug-row__body">
                <div className="sug-row__title">
                  <span className="sug-row__author">{ticket.author || 'Anónimo'}</span>
                  <time className="sug-row__time" dateTime={ticket.createdAt}>{formatDate(ticket.createdAt)}</time>
                  <span className={`sug-badge sug-badge--${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span>
                </div>
                <h3 className={`sug-row__heading${ticket.title ? '' : ' sug-row__heading--empty'}`}>
                  {ticket.title || 'Sin título'}
                </h3>
                <p className="sug-row__text">{ticket.text}</p>
                {(ticket.comments?.length ?? 0) > 0 && (
                  <ul className="sug-comments">
                    {ticket.comments!.map(comment => (
                      <li key={comment.id || comment.createdAt} className="sug-comment">
                        <div className="sug-comment__head">
                          <span className="sug-comment__author">{comment.author || 'Anónimo'}</span>
                          <time className="sug-comment__time" dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
                        </div>
                        <p className="sug-comment__text">{comment.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {ticket.status === 'pending' && !ticket.archived && !commentOpen[ticket.id] && (
                  <button type="button" className="sug-cancel sug-comment-open" onClick={() => setOpen(ticket.id, true)}>
                    Añadir comentario
                  </button>
                )}
                {ticket.status === 'pending' && !ticket.archived && commentOpen[ticket.id] && (
                  <div className="sug-comment-form">
                    <textarea
                      className="sug-comment-form__text"
                      rows={2}
                      autoFocus
                      maxLength={TICKET_COMMENT_MAX}
                      placeholder="Añadir o corregir algo (no se puede editar ni borrar)"
                      value={commentDrafts[ticket.id] ?? ''}
                      disabled={commentBusy === ticket.id}
                      onChange={event => {
                        const value = event.target.value;
                        setCommentDrafts(current => ({ ...current, [ticket.id]: value }));
                      }}
                    />
                    <button
                      type="button"
                      className="sug-btn"
                      disabled={!(commentDrafts[ticket.id] ?? '').trim() || commentBusy === ticket.id}
                      onClick={() => { void sendComment(ticket); }}
                    >
                      {commentBusy === ticket.id ? 'Enviando' : 'Comentar'}
                    </button>
                    <button
                      type="button"
                      className="sug-cancel"
                      disabled={commentBusy === ticket.id}
                      onClick={() => setOpen(ticket.id, false)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {error && <p className="sug-error">{error}</p>}
              </div>
              {canEdit && (
                <div className="sug-row__actions">
                  {ticket.status !== 'accepted' && (
                    <button
                      type="button"
                      className={ticket.status === 'completed' ? 'sug-cancel' : 'sug-btn sug-btn--accept'}
                      disabled={busy}
                      onClick={() => { void changeStatus(ticket, 'accepted'); }}
                    >
                      {busy && busyStatus === 'accepted'
                        ? (ticket.status === 'completed' ? 'Reabriendo' : STATUS_BUSY.accepted)
                        : (ticket.status === 'completed' ? 'Reabrir' : 'Aceptar')}
                    </button>
                  )}
                  {(ticket.status === 'pending' || ticket.status === 'accepted') && (
                    <button
                      type="button"
                      className="sug-btn sug-btn--reject"
                      disabled={busy}
                      onClick={() => { void changeStatus(ticket, 'rejected'); }}
                    >
                      {busy && busyStatus === 'rejected' ? STATUS_BUSY.rejected : 'Rechazar'}
                    </button>
                  )}
                  {(ticket.status === 'accepted' || ticket.status === 'rejected') && (
                    <button
                      type="button"
                      className="sug-cancel"
                      disabled={busy}
                      onClick={() => { void changeStatus(ticket, 'pending'); }}
                    >
                      {busy && busyStatus === 'pending' ? STATUS_BUSY.pending : 'Volver a pendiente'}
                    </button>
                  )}
                  {(ticket.status === 'completed' || ticket.status === 'rejected' || ticket.archived) && (
                    <button
                      type="button"
                      className="sug-cancel"
                      disabled={busy}
                      title={ticket.archived ? 'Vuelve a salir en la lista' : 'Deja de salir en la lista (no se borra)'}
                      onClick={() => { void toggleArchive(ticket); }}
                    >
                      {busy && busyArchive ? (ticket.archived ? 'Desarchivando' : 'Archivando') : (ticket.archived ? 'Desarchivar' : 'Archivar')}
                    </button>
                  )}
                  {ticket.status === 'accepted' ? (
                    <button
                      type="button"
                      className="sug-btn sug-btn--complete"
                      disabled={busy}
                      onClick={() => { void changeStatus(ticket, 'completed'); }}
                    >
                      {busy && busyStatus === 'completed' ? STATUS_BUSY.completed : 'Completado'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="sug-btn"
                      disabled={busy}
                      onClick={() => setPending(ticket)}
                    >
                      {busy && !busyStatus && !busyArchive ? 'Borrando' : 'Borrar'}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {pageCount > 1 && (
        <nav className="sug-pager" aria-label="Páginas de sugerencias">
          <button type="button" className="sug-cancel" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
            Anterior
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(number => (
            <button
              key={number}
              type="button"
              className={`sug-filter${number === currentPage ? ' sug-filter--active' : ''}`}
              aria-current={number === currentPage ? 'page' : undefined}
              onClick={() => setPage(number)}
            >
              {number}
            </button>
          ))}
          <button type="button" className="sug-cancel" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
            Siguiente
          </button>
        </nav>
      )}

      {pending && canEdit && (
        <Modal onClose={() => { if (!busyId) setPending(null); }} backdropClassName="sug-confirm-backdrop" className="sug-confirm">
          <h2 className="sug-confirm__title">Borrar sugerencia</h2>
          <p className="sug-confirm__text">Esta sugerencia desaparece para todos. No se puede deshacer.</p>
          <div className="sug-confirm__actions">
            <button type="button" className="sug-cancel" disabled={busyId === pending.id} onClick={() => setPending(null)}>
              Cancelar
            </button>
            <button type="button" className="sug-btn" disabled={busyId === pending.id} onClick={() => { void remove(); }}>
              {busyId === pending.id ? 'Borrando' : 'Borrar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Sugerencias;
