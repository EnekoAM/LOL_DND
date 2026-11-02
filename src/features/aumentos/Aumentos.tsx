import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { useCanEdit } from '../../data/appRoleContext';
import {
  AUGMENT_DESCRIPTION_MAX,
  AUGMENT_NAME_MAX,
  createAugment,
  deleteAugment,
  loadAugments,
  updateAugment,
  type Augment,
  type AugmentDraft,
} from '../../data/augments';
import { useLiveRevision } from '../../data/live';
import { partyAumentosForPlayers, saveAumentosForPlayers, subscribeParty } from '../../data/party';
import './Aumentos.css';

const EMPTY_DRAFT: AugmentDraft = { name: '', description: '', price: 0 };

const sortByName = (list: Augment[]): Augment[] =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

const formatGold = (value: number) => value.toLocaleString('es-ES');

type Editing = { id: string | null; draft: AugmentDraft };

const Aumentos = () => {
  const isAdmin = useCanEdit();
  const forPlayers = useSyncExternalStore(subscribeParty, partyAumentosForPlayers);
  const [augments, setAugments] = useState<Augment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Augment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // Aumentos creados/editados/borrados en otra pestaña: se vuelve a pedir la lista.
  const revision = useLiveRevision('augments');

  useEffect(() => {
    let active = true;
    loadAugments()
      .then(next => {
        if (!active) return;
        setAugments(sortByName(next));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los aumentos');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const toggleForPlayers = async () => {
    if (!isAdmin || toggleBusy) return;
    setToggleBusy(true);
    setToggleError(null);
    try {
      await saveAumentosForPlayers(!forPlayers);
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'No se pudo cambiar la visibilidad');
    } finally {
      setToggleBusy(false);
    }
  };

  const openNew = () => {
    setFormError(null);
    setEditing({ id: null, draft: { ...EMPTY_DRAFT } });
  };

  const openEdit = (augment: Augment) => {
    setFormError(null);
    setEditing({ id: augment.id, draft: { name: augment.name, description: augment.description, price: augment.price } });
  };

  const setDraft = (patch: Partial<AugmentDraft>) =>
    setEditing(current => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || saving) return;
    const draft: AugmentDraft = {
      name: editing.draft.name.trim(),
      description: editing.draft.description.trim(),
      price: Math.max(0, Math.floor(Number(editing.draft.price) || 0)),
    };
    if (!draft.name) {
      setFormError('Pon un nombre al aumento');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing.id ? await updateAugment(editing.id, draft) : await createAugment(draft);
      setAugments(current => sortByName([saved, ...current.filter(item => item.id !== saved.id)]));
      setEditing(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar el aumento');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete || busyId) return;
    const augment = pendingDelete;
    setBusyId(augment.id);
    setRowError(null);
    try {
      await deleteAugment(augment.id);
      setAugments(current => current.filter(item => item.id !== augment.id));
    } catch (error) {
      setRowError({ id: augment.id, text: error instanceof Error ? error.message : 'No se pudo borrar' });
    } finally {
      setPendingDelete(null);
      setBusyId(null);
    }
  };

  return (
    <div className="aum-root">
      <header className="aum-head">
        <div className="aum-head__titles">
          <h2 className="aum-head__title">Aumentos</h2>
          <p className="aum-head__sub">
            {isAdmin
              ? 'Catálogo de aumentos que los players podrán comprar.'
              : 'Aumentos disponibles para comprar con el oro del grupo.'}
          </p>
        </div>
        {isAdmin && (
          <div className="aum-head__actions">
            <label
              className={`aum-toggle${forPlayers ? ' aum-toggle--on' : ''}`}
              title="Muestra u oculta Aumentos en la barra lateral de los players"
            >
              <input
                type="checkbox"
                checked={forPlayers}
                disabled={toggleBusy}
                onChange={() => { void toggleForPlayers(); }}
              />
              <span className="aum-toggle__track" aria-hidden="true"><span className="aum-toggle__thumb" /></span>
              <span className="aum-toggle__label">
                {forPlayers ? 'Visible para players' : 'Oculto para players'}
              </span>
            </label>
            <button type="button" className="aum-btn" onClick={openNew}>+ Añadir aumento</button>
          </div>
        )}
      </header>
      {toggleError && <p className="aum-error">{toggleError}</p>}

      {!isAdmin && (
        <div className="aum-soon">
          <span className="aum-soon__badge">Próximamente</span>
          <p>La compra de aumentos llegará pronto. De momento puedes ver el catálogo.</p>
        </div>
      )}

      {loading && <p className="aum-status">Cargando los aumentos…</p>}
      {loadError && <p className="aum-status aum-error">{loadError}</p>}

      {!loading && !loadError && augments.length === 0 && (
        <div className="aum-empty">
          <span className="aum-empty__icon">✨</span>
          <p>{isAdmin ? 'Todavía no hay aumentos. Añade el primero.' : 'Todavía no hay aumentos'}</p>
        </div>
      )}

      <div className="aum-grid">
        {augments.map(augment => {
          const error = rowError?.id === augment.id ? rowError.text : null;
          const busy = busyId === augment.id;
          return (
            <article key={augment.id} className="aum-card">
              <div className="aum-card__top">
                <h3 className="aum-card__name">{augment.name}</h3>
                <span className="aum-card__price" title="Precio en oro">{formatGold(augment.price)} 🪙</span>
              </div>
              <p className={`aum-card__desc${augment.description ? '' : ' aum-card__desc--empty'}`}>
                {augment.description || 'Sin descripción'}
              </p>
              {error && <p className="aum-error">{error}</p>}
              <div className="aum-card__actions">
                {isAdmin ? (
                  <>
                    <button type="button" className="aum-cancel" disabled={busy} onClick={() => openEdit(augment)}>
                      ✎ Editar
                    </button>
                    <button
                      type="button"
                      className="aum-btn aum-btn--danger"
                      disabled={busy}
                      onClick={() => setPendingDelete(augment)}
                    >
                      {busy ? 'Quitando' : '✕ Quitar'}
                    </button>
                  </>
                ) : (
                  <button type="button" className="aum-btn" disabled title="Próximamente">
                    Comprar · Próximamente
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {editing && isAdmin && (
        <Modal onClose={() => { if (!saving) setEditing(null); }} backdropClassName="aum-modal-backdrop" className="aum-modal">
          <form className="aum-form" onSubmit={event => { void submit(event); }}>
            <h2 className="aum-form__title">{editing.id ? 'Editar aumento' : 'Nuevo aumento'}</h2>
            <label className="aum-field">
              <span className="aum-field__label">Nombre</span>
              <input
                className="aum-input"
                type="text"
                value={editing.draft.name}
                maxLength={AUGMENT_NAME_MAX}
                required
                autoFocus
                placeholder="Nombre del aumento"
                onChange={event => setDraft({ name: event.target.value })}
              />
            </label>
            <label className="aum-field">
              <span className="aum-field__label">Precio (oro)</span>
              <input
                className="aum-input"
                type="number"
                min={0}
                step={1}
                value={editing.draft.price}
                onChange={event => setDraft({ price: Number(event.target.value) })}
              />
            </label>
            <label className="aum-field">
              <span className="aum-field__label">Descripción</span>
              <textarea
                className="aum-input aum-input--text"
                value={editing.draft.description}
                maxLength={AUGMENT_DESCRIPTION_MAX}
                rows={5}
                placeholder="Qué hace el aumento"
                onChange={event => setDraft({ description: event.target.value })}
              />
            </label>
            {formError && <p className="aum-error">{formError}</p>}
            <div className="aum-form__actions">
              <button type="button" className="aum-cancel" disabled={saving} onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button type="submit" className="aum-btn" disabled={saving || !editing.draft.name.trim()}>
                {saving ? 'Guardando' : editing.id ? 'Guardar' : 'Añadir'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && isAdmin && (
        <Modal onClose={() => { if (!busyId) setPendingDelete(null); }} backdropClassName="aum-modal-backdrop" className="aum-modal">
          <h2 className="aum-form__title">Quitar aumento</h2>
          <p className="aum-modal__text">«{pendingDelete.name}» desaparece del catálogo para todos. No se puede deshacer.</p>
          <div className="aum-form__actions">
            <button type="button" className="aum-cancel" disabled={busyId === pendingDelete.id} onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button type="button" className="aum-btn aum-btn--danger" disabled={busyId === pendingDelete.id} onClick={() => { void remove(); }}>
              {busyId === pendingDelete.id ? 'Quitando' : 'Quitar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Aumentos;
