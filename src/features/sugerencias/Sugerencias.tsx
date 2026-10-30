import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { useCanEdit } from '../../data/appRoleContext';
import { useLiveRevision } from '../../data/live';
import {
  TICKET_AUTHOR_MAX,
  TICKET_TEXT_MAX,
  createTicket,
  deleteTicket,
  loadTickets,
  type Ticket,
} from '../../data/tickets';
import './Sugerencias.css';

const AUTHOR_KEY = 'lol-dnd:ticket-author';

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
};

const sortNewest = (list: Ticket[]): Ticket[] =>
  [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const Sugerencias = () => {
  const canEdit = useCanEdit();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState(() => localStorage.getItem(AUTHOR_KEY) ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<Ticket | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  // Sugerencias creadas o borradas en otra pestaña: se vuelve a pedir la lista.
  const ticketsRevision = useLiveRevision('tickets');

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

  const trimmed = text.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const saved = await createTicket(trimmed, author);
      localStorage.setItem(AUTHOR_KEY, author.trim());
      setTickets(current => sortNewest([saved, ...current.filter(item => item.id !== saved.id)]));
      setText('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar la sugerencia');
    } finally {
      setSaving(false);
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
        <textarea
          className="sug-form__text"
          value={text}
          maxLength={TICKET_TEXT_MAX}
          rows={4}
          placeholder="¿Qué mejorarías, qué falla o qué echas en falta?"
          onChange={event => setText(event.target.value)}
        />
        <div className="sug-form__row">
          <input
            className="sug-form__author"
            type="text"
            value={author}
            maxLength={TICKET_AUTHOR_MAX}
            placeholder="Tu nombre (opcional)"
            onChange={event => setAuthor(event.target.value)}
          />
          <span className="sug-form__count">{text.length}/{TICKET_TEXT_MAX}</span>
          <button type="submit" className="sug-btn" disabled={!trimmed || saving}>
            {saving ? 'Enviando' : 'Enviar'}
          </button>
        </div>
        {formError && <p className="sug-error">{formError}</p>}
      </form>

      <div className="sug-head">
        <span className="sug-head__label">Sugerencias</span>
        <span className="sug-count">{tickets.length}</span>
      </div>

      {loading && <p className="sug-status">Cargando las sugerencias…</p>}
      {loadError && <p className="sug-status sug-error">{loadError}</p>}

      {!loading && !loadError && tickets.length === 0 && (
        <div className="sug-empty">
          <span className="sug-empty__icon">💡</span>
          <p>Todavía no hay sugerencias</p>
        </div>
      )}

      <div className="sug-list">
        {tickets.map(ticket => {
          const error = rowError?.id === ticket.id ? rowError.text : null;
          return (
            <article key={ticket.id} className="sug-row">
              <div className="sug-row__body">
                <div className="sug-row__title">
                  <span className="sug-row__author">{ticket.author || 'Anónimo'}</span>
                  <time className="sug-row__time" dateTime={ticket.createdAt}>{formatDate(ticket.createdAt)}</time>
                </div>
                <p className="sug-row__text">{ticket.text}</p>
                {error && <p className="sug-error">{error}</p>}
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="sug-btn"
                  disabled={busyId === ticket.id}
                  onClick={() => setPending(ticket)}
                >
                  {busyId === ticket.id ? 'Borrando' : 'Borrar'}
                </button>
              )}
            </article>
          );
        })}
      </div>

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
