import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import { NPC_DESCRIPTION_MAX, type Npc, type NpcPlayerPatch } from '../../data/npcs';

type Props = {
  npc: Npc;
  onClose: () => void;
  onSubmit: (patch: NpcPlayerPatch) => Promise<void>;
};

/** Edición de un player: descripción y notas públicas compartidas. */
const NpcPlayerEditModal = ({ npc, onClose, onSubmit }: Props) => {
  const [description, setDescription] = useState(npc.description);
  const [publicNotes, setPublicNotes] = useState(npc.publicNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        description: description.trim(),
        publicNotes: publicNotes.trim(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
      setSaving(false);
    }
  };

  return createPortal(
    <Modal onClose={() => { if (!saving) onClose(); }} backdropClassName="hab-modal-backdrop" className="hab-modal npc-editor">
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
      <form className="hab-modal__body" onSubmit={e => { void submit(e); }}>
        <h2 className="hab-modal__title">Editar {npc.name}</h2>

        <label className="hab-field">
          <span>Descripción</span>
          <textarea
            rows={6}
            autoFocus
            maxLength={NPC_DESCRIPTION_MAX}
            value={description}
            placeholder="Notas, vida, resistencias…"
            onChange={e => setDescription(e.target.value)}
          />
        </label>

        <label className="hab-field">
          <span>Notas públicas (visibles a toda la party)</span>
          <textarea
            rows={4}
            maxLength={NPC_DESCRIPTION_MAX}
            value={publicNotes}
            placeholder="Lo que vea todo el grupo…"
            onChange={e => setPublicNotes(e.target.value)}
          />
        </label>

        {error && <p className="hab-modal__error" role="alert">{error}</p>}

        <div className="hab-modal__actions">
          <button type="submit" className="hab-modal__btn" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="hab-modal__btn hab-modal__btn--ghost" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    </Modal>,
    document.body,
  );
};

export default NpcPlayerEditModal;
