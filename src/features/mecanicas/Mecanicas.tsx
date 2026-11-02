import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { useCanEdit } from '../../data/appRoleContext';
import { useLiveRevision } from '../../data/live';
import {
  FAQ_BODY_MAX,
  FAQ_CATEGORY_MAX,
  FAQ_TITLE_MAX,
  createFaq,
  deleteFaq,
  loadFaq,
  updateFaq,
  type FaqDraft,
  type FaqEntry,
} from '../../data/faq';
import { cx } from '../../lib/cx';
import FaqText from './FaqText';
import './Mecanicas.css';

const ALL = '';
const NO_CATEGORY = 'General';

/** Sin tildes ni mayúsculas, para buscar «mecanica» y encontrar «Mecánica». */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const sortEntries = (list: FaqEntry[]) =>
  [...list].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

type Editing = { id: string | null; draft: FaqDraft };

const EMPTY_DRAFT: FaqDraft = { title: '', body: '', category: '' };

const Mecanicas = () => {
  const canEdit = useCanEdit();
  const revision = useLiveRevision('faq');
  const [entries, setEntries] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FaqEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEntries(sortEntries(await loadFaq()));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar las Mecánicas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, revision]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const entry of entries) {
      const name = entry.category || NO_CATEGORY;
      if (!seen.includes(name)) seen.push(name);
    }
    return seen;
  }, [entries]);

  useEffect(() => {
    if (category !== ALL && !categories.includes(category)) setCategory(ALL);
  }, [categories, category]);

  const visible = useMemo(() => {
    const needle = fold(query.trim());
    return entries.filter(entry => {
      if (category !== ALL && (entry.category || NO_CATEGORY) !== category) return false;
      if (!needle) return true;
      return fold(`${entry.title}\n${entry.body}\n${entry.category ?? ''}`).includes(needle);
    });
  }, [entries, query, category]);

  const searching = query.trim() !== '';
  const allOpen = visible.length > 0 && visible.every(entry => open.has(entry.id));

  const toggle = (id: string) => {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setOpen(allOpen ? new Set() : new Set(visible.map(entry => entry.id)));
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

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const { id, draft } = editing;
    void run(async () => {
      if (id) {
        const saved = await updateFaq(id, {
          title: draft.title.trim(),
          body: draft.body.trim(),
          category: draft.category.trim() || null,
        });
        setEntries(list => sortEntries(list.map(entry => (entry.id === id ? saved : entry))));
      } else {
        const saved = await createFaq(draft);
        setEntries(list => sortEntries([...list, saved]));
        setOpen(prev => new Set(prev).add(saved.id));
      }
      setEditing(null);
    });
  };

  /** Sube o baja una entrada en la lista completa (intercambia su orden con la vecina). */
  const move = (entry: FaqEntry, direction: -1 | 1) => {
    const index = entries.findIndex(item => item.id === entry.id);
    const other = entries[index + direction];
    if (index < 0 || !other) return;
    // Con órdenes distintos se intercambian; si coinciden basta con mover esta una unidad.
    const sameOrder = entry.order === other.order;
    const mine = sameOrder ? Math.max(0, other.order + direction) : other.order;
    void run(async () => {
      const updated = await Promise.all([
        updateFaq(entry.id, { order: mine }),
        ...(sameOrder ? [] : [updateFaq(other.id, { order: entry.order })]),
      ]);
      const byId = new Map(updated.map(item => [item.id, item]));
      setEntries(list => sortEntries(list.map(item => byId.get(item.id) ?? item)));
    });
  };

  const remove = () => {
    const target = confirmDelete;
    if (!target) return;
    void run(async () => {
      await deleteFaq(target.id);
      setEntries(list => list.filter(entry => entry.id !== target.id));
      setConfirmDelete(null);
    });
  };

  const draft = editing?.draft;
  const setDraft = (patch: Partial<FaqDraft>) =>
    setEditing(current => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));

  return (
    <div className="mec-root">
      <header className="mec-head">
        <div className="mec-head__text">
          <h2 className="mec-head__title">📖 Mecánicas</h2>
          <p className="mec-head__lead">Cómo funcionan las reglas de la mesa y de la app. Pulsa una pregunta para ver la respuesta.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="mec-btn mec-btn--primary"
            disabled={busy}
            onClick={() => { setError(null); setEditing({ id: null, draft: { ...EMPTY_DRAFT, category: category !== ALL && category !== NO_CATEGORY ? category : '' } }); }}
          >
            ＋ Nueva entrada
          </button>
        )}
      </header>

      <div className="mec-tools">
        <input
          className="mec-search"
          type="search"
          value={query}
          placeholder="Buscar: oro, descanso, portal…"
          aria-label="Buscar en Mecánicas"
          onChange={event => setQuery(event.target.value)}
        />
        <div className="mec-cats" role="tablist" aria-label="Categorías">
          {[ALL, ...categories].map(name => (
            <button
              key={name || 'all'}
              type="button"
              role="tab"
              aria-selected={category === name}
              className={cx('mec-cat', category === name && 'mec-cat--on')}
              onClick={() => setCategory(name)}
            >
              {name || 'Todas'}
            </button>
          ))}
        </div>
        {visible.length > 0 && (
          <button type="button" className="mec-link" onClick={toggleAll}>
            {allOpen ? 'Cerrar todo' : 'Abrir todo'}
          </button>
        )}
      </div>

      {error && <p className="mec-error" role="alert">{error}</p>}
      {loading && <p className="mec-status">Cargando las Mecánicas…</p>}
      {loadError && <p className="mec-status mec-error">{loadError}</p>}
      {!loading && !loadError && entries.length === 0 && (
        <div className="mec-empty">
          <span className="mec-empty__icon">📖</span>
          <p>{canEdit ? 'Todavía no hay entradas. Añade la primera con «＋ Nueva entrada».' : 'Todavía no hay entradas.'}</p>
        </div>
      )}
      {!loading && !loadError && entries.length > 0 && visible.length === 0 && (
        <p className="mec-status">Nada coincide con la búsqueda.</p>
      )}

      <div className="mec-list">
        {visible.map(entry => {
          const isOpen = searching || open.has(entry.id);
          const index = entries.findIndex(item => item.id === entry.id);
          return (
            <article key={entry.id} className={cx('mec-item', isOpen && 'mec-item--open')}>
              <div className="mec-item__head">
                <button
                  type="button"
                  className="mec-item__toggle"
                  aria-expanded={isOpen}
                  onClick={() => toggle(entry.id)}
                >
                  <span className="mec-item__chevron" aria-hidden="true">▸</span>
                  <span className="mec-item__title">{entry.title}</span>
                  <span className="mec-item__cat">{entry.category || NO_CATEGORY}</span>
                </button>
                {canEdit && (
                  <div className="mec-item__admin">
                    <button type="button" className="mec-icon" title="Subir" aria-label="Subir" disabled={busy || index <= 0} onClick={() => move(entry, -1)}>↑</button>
                    <button type="button" className="mec-icon" title="Bajar" aria-label="Bajar" disabled={busy || index >= entries.length - 1} onClick={() => move(entry, 1)}>↓</button>
                    <button
                      type="button"
                      className="mec-icon"
                      title="Editar"
                      aria-label="Editar"
                      disabled={busy}
                      onClick={() => { setError(null); setEditing({ id: entry.id, draft: { title: entry.title, body: entry.body, category: entry.category ?? '' } }); }}
                    >
                      ✎
                    </button>
                    <button type="button" className="mec-icon mec-icon--danger" title="Borrar" aria-label="Borrar" disabled={busy} onClick={() => setConfirmDelete(entry)}>✕</button>
                  </div>
                )}
              </div>
              {isOpen && (
                <div className="mec-item__body">
                  <FaqText body={entry.body} />
                </div>
              )}
            </article>
          );
        })}
      </div>

      {editing && draft && canEdit && (
        <Modal onClose={() => { if (!busy) setEditing(null); }} backdropClassName="mec-modal-backdrop" className="mec-modal">
          <form className="mec-form" onSubmit={save}>
            <h2 className="mec-modal__title">{editing.id ? 'Editar entrada' : 'Nueva entrada'}</h2>
            <label className="mec-field">
              <span className="mec-field__label">Pregunta o título</span>
              <input
                className="mec-input"
                type="text"
                value={draft.title}
                maxLength={FAQ_TITLE_MAX}
                required
                autoFocus
                placeholder="¿Cómo funciona…?"
                onChange={event => setDraft({ title: event.target.value })}
              />
            </label>
            <label className="mec-field">
              <span className="mec-field__label">Categoría (opcional)</span>
              <input
                className="mec-input"
                type="text"
                list="mec-categories"
                value={draft.category}
                maxLength={FAQ_CATEGORY_MAX}
                placeholder={NO_CATEGORY}
                onChange={event => setDraft({ category: event.target.value })}
              />
              <datalist id="mec-categories">
                {categories.filter(name => name !== NO_CATEGORY).map(name => <option key={name} value={name} />)}
              </datalist>
            </label>
            <label className="mec-field">
              <span className="mec-field__label">Respuesta</span>
              <textarea
                className="mec-input mec-input--body"
                value={draft.body}
                maxLength={FAQ_BODY_MAX}
                rows={8}
                required
                placeholder="Explica la mecánica en pocas líneas."
                onChange={event => setDraft({ body: event.target.value })}
              />
              <span className="mec-field__hint">
                Formato: línea en blanco = párrafo nuevo · «- » lista · «1. » lista numerada · **negrita** · {draft.body.length}/{FAQ_BODY_MAX}
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
              <button type="submit" className="mec-btn mec-btn--primary" disabled={busy || !draft.title.trim() || !draft.body.trim()}>
                {busy ? 'Guardando' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && canEdit && (
        <Modal onClose={() => { if (!busy) setConfirmDelete(null); }} backdropClassName="mec-modal-backdrop" className="mec-modal mec-modal--small">
          <h2 className="mec-modal__title">Borrar entrada</h2>
          <p className="mec-modal__text">«{confirmDelete.title}» desaparece para todos. No se puede deshacer.</p>
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

export default Mecanicas;
