import { useEffect, useRef, useState } from 'react';
import { useAppRole } from '../../data/appRoleContext';
import { useLiveRevision } from '../../data/live';
import { PLAYER_NOTE_MAX, loadPlayerNote, savePlayerNote, type PlayerNoteKind } from '../../data/playerNotes';
import './PrivateNotes.css';

type Props = {
  kind: PlayerNoteKind;
  /** Campeón = su nombre; NPC = su id. */
  id: string;
  name: string;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Pestaña «Notas privadas» de las fichas de campeón y NPC: una nota libre por player y ficha.
 * Solo la ve el propio player (la API filtra por X-App-Player). Invitado: aviso. Admin: aviso (no tiene notas).
 */
const PrivateNotesPanel = ({ kind, id, name }: Props) => {
  const { role, playerName } = useAppRole();
  const revision = useLiveRevision('playerNotes');
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const dirtyRef = useRef(false);
  const dirty = draft !== saved;
  dirtyRef.current = dirty;

  // Al cambiar de ficha o de player se empieza de cero.
  useEffect(() => {
    setSaved('');
    setDraft('');
    setUpdatedAt(null);
    setError(null);
    setFlash(false);
    dirtyRef.current = false;
  }, [kind, id, playerName]);

  useEffect(() => {
    if (role === 'admin' || !playerName) return;
    let active = true;
    setLoading(true);
    loadPlayerNote(playerName, kind, id)
      .then(note => {
        if (!active) return;
        setSaved(note.text);
        // Si llega un cambio en vivo mientras escribes, no se pisa el borrador.
        if (!dirtyRef.current) setDraft(note.text);
        setUpdatedAt(note.updatedAt);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No se pudo cargar la nota');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role, playerName, kind, id, revision]);

  if (role === 'admin') {
    return (
      <section className="sheet-panel pnotes">
        <div className="sheet-panel__title">Notas privadas</div>
        <p className="pnotes__notice">Cada player tiene sus propias notas privadas; el admin no las ve.</p>
      </section>
    );
  }

  if (!playerName) {
    return (
      <section className="sheet-panel pnotes">
        <div className="sheet-panel__title">Notas privadas</div>
        <p className="pnotes__notice">Entra con tu player (no como invitado) para guardar notas privadas sobre {name}.</p>
      </section>
    );
  }

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const note = await savePlayerNote(playerName, kind, id, draft);
      setSaved(note.text);
      setDraft(note.text);
      setUpdatedAt(note.updatedAt);
      setFlash(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la nota');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="sheet-panel pnotes">
      <div className="sheet-panel__title">
        Notas privadas
        <span className="sheet-panel__meta">Solo las ves tú ({playerName})</span>
      </div>
      <form
        className="pnotes__form"
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
      >
        <textarea
          className="pnotes__text"
          rows={10}
          maxLength={PLAYER_NOTE_MAX}
          value={draft}
          disabled={loading && !dirty && !saved}
          placeholder={loading ? 'Cargando…' : `Lo que sabes o sospechas de ${name}…`}
          aria-label={`Notas privadas sobre ${name}`}
          onChange={e => {
            setDraft(e.target.value);
            setFlash(false);
          }}
          onKeyDown={e => {
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div className="pnotes__actions">
          <span className="pnotes__status">
            {dirty
              ? 'Cambios sin guardar'
              : flash
                ? 'Guardado'
                : updatedAt
                  ? `Guardado el ${formatDate(updatedAt)}`
                  : ''}
            <span className="pnotes__count">{draft.length}/{PLAYER_NOTE_MAX}</span>
          </span>
          {dirty && (
            <button type="button" className="calc-ability-edit" disabled={saving} onClick={() => setDraft(saved)}>
              Descartar
            </button>
          )}
          <button type="submit" className="calc-ability-edit" disabled={saving || !dirty}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        {error && <p className="sheet-hp__error" role="alert">{error}</p>}
      </form>
    </section>
  );
};

export default PrivateNotesPanel;
