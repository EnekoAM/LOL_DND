import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppRole } from '../../data/appRoleContext';
import { useLiveRevision } from '../../data/live';
import { COMBAT_NOTE_MAX, addCombatNote, clearCombatNotes, deleteCombatNote, loadCombatNotes, type CombatNote } from '../../data/combatNotes';
import './CombatNotes.css';

const TIME = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : TIME.format(date);
}

/**
 * Notas públicas del combate: panel lateral derecho por encima de todo (sin fondo oscuro, el combate sigue usable).
 * Toda la party las ve y escribe; en vivo (aviso 'combat'). Se cierra con ✕, Esc o el botón «Notas».
 */
export default function CombatNotes({ onClose }: { onClose: () => void }) {
  const { role, playerName } = useAppRole();
  const isAdmin = role === 'admin';
  const rev = useLiveRevision('combat');
  const [notes, setNotes] = useState<CombatNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    loadCombatNotes()
      .then(list => { if (alive) { setNotes(list); setError(null); } })
      .catch(caught => { if (alive) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar las notas'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [rev]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = (task: () => Promise<CombatNote[]>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    task()
      .then(list => { setNotes(list); after?.(); })
      .catch(caught => setError(caught instanceof Error ? caught.message : 'No se pudo guardar'))
      .finally(() => setBusy(false));
  };
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    run(() => addCombatNote(text), () => setDraft(''));
  };
  const canDelete = (note: CombatNote) => isAdmin
    || (!!playerName && note.author.toLocaleLowerCase('es') === playerName.toLocaleLowerCase('es'));
  // Las más recientes arriba.
  const shown = [...notes].reverse();

  return createPortal(
    <aside className="combat-notes" role="dialog" aria-label="Notas del combate">
      <header className="combat-notes__head">
        <div>
          <h2 className="combat-notes__title">Notas del combate</h2>
          <p className="combat-notes__hint">Públicas: las ve y escribe toda la party. Se quedan entre combates.</p>
        </div>
        <button type="button" className="combat-notes__close" aria-label="Cerrar notas" title="Cerrar (Esc)" onClick={onClose}>✕</button>
      </header>
      <div className="combat-notes__form">
        <textarea
          ref={inputRef}
          rows={3}
          maxLength={COMBAT_NOTE_MAX}
          placeholder="Apunta algo para todos… (Ctrl+Enter para guardar)"
          value={draft}
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
          aria-label="Nueva nota"
        />
        <div className="combat-notes__form-row">
          {isAdmin && notes.length > 0 && (
            <button
              type="button"
              className="combat-btn combat-btn--small combat-btn--danger"
              disabled={busy}
              onClick={() => { if (window.confirm('¿Borrar todas las notas del combate?')) run(clearCombatNotes); }}
            >
              Vaciar
            </button>
          )}
          <button type="button" className="combat-btn combat-btn--small combat-btn--gold" disabled={busy || !draft.trim()} onClick={submit}>Apuntar</button>
        </div>
        {error && <p className="combat-page__error">{error}</p>}
      </div>
      <div className="combat-notes__body">
        {loading ? (
          <p className="combat-notes__empty">Cargando…</p>
        ) : shown.length === 0 ? (
          <p className="combat-notes__empty">Sin notas todavía.</p>
        ) : (
          <ul className="combat-notes__list">
            {shown.map(note => (
              <li key={note.id} className="combat-notes__item">
                <div className="combat-notes__meta">
                  <b>{note.author}</b>
                  <span>{when(note.createdAt)}</span>
                  {canDelete(note) && (
                    <button type="button" className="combat-notes__del" aria-label="Borrar nota" title="Borrar nota" disabled={busy} onClick={() => run(() => deleteCombatNote(note.id))}>✕</button>
                  )}
                </div>
                <p className="combat-notes__text">{note.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>,
    document.body,
  );
}
