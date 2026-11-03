import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import { RELATION_NOTE_MAX } from '../../data/relations';

type Props = {
  title: string;
  initial: string;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
};

/** Nota de una relación (hermano, rival, mentor…). */
const RelationNoteModal = ({ title, initial, onClose, onSubmit }: Props) => {
  const [note, setNote] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(note.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
      setSaving(false);
    }
  };

  return createPortal(
    <Modal onClose={() => { if (!saving) onClose(); }} backdropClassName="hab-modal-backdrop" className="hab-modal rel-modal">
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
      <form className="hab-modal__body" onSubmit={e => { void submit(e); }}>
        <div className="hab-modal__kicker">Relación</div>
        <h2 className="hab-modal__title">{title}</h2>
        <label className="hab-field">
          <span>Nota</span>
          <input
            type="text"
            autoFocus
            maxLength={RELATION_NOTE_MAX}
            value={note}
            placeholder="Hermano, rival, mentor, le debe un favor…"
            onChange={e => setNote(e.target.value)}
          />
        </label>
        {error && <p className="hab-modal__error" role="alert">{error}</p>}
        <div className="hab-modal__actions">
          <button type="submit" className="hab-modal__btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="hab-modal__btn hab-modal__btn--ghost" disabled={saving} onClick={onClose}>Cancelar</button>
        </div>
      </form>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    </Modal>,
    document.body,
  );
};

export default RelationNoteModal;
