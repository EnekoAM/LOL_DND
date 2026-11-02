import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import {
  NPC_DESCRIPTION_MAX,
  NPC_KINDS,
  NPC_LEVEL_MAX,
  NPC_LEVEL_MIN,
  NPC_NAME_MAX,
  NPC_STATS,
  NPC_TAG_MAX,
  type NpcInput,
  type NpcKind,
  type NpcStatKey,
  type NpcStats,
} from '../../data/npcs';
import { cx } from '../../lib/cx';

type Props = {
  title: string;
  initial: NpcInput;
  /** Sugerencias para tipo/región (los que ya existen). */
  types: string[];
  regions: string[];
  submitLabel: string;
  onClose: () => void;
  onSubmit: (input: NpcInput) => Promise<void>;
};

type StatDraft = Record<NpcStatKey, string>;

const toStatDraft = (stats: NpcStats): StatDraft =>
  Object.fromEntries(NPC_STATS.map(({ key }) => [key, stats[key] === undefined ? '' : String(stats[key])])) as StatDraft;

/** Alta / edición de los datos del NPC (las habilidades se editan desde la ficha). */
const NpcEditorModal = ({ title, initial, types, regions, submitLabel, onClose, onSubmit }: Props) => {
  const [draft, setDraft] = useState<NpcInput>(initial);
  const [stats, setStats] = useState<StatDraft>(() => toStatDraft(initial.stats));
  const [level, setLevel] = useState(String(initial.level));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (patch: Partial<NpcInput>) => setDraft(current => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Pon un nombre al NPC');
      return;
    }
    const parsedLevel = Number(level);
    if (!Number.isInteger(parsedLevel) || parsedLevel < NPC_LEVEL_MIN || parsedLevel > NPC_LEVEL_MAX) {
      setError(`El nivel tiene que ser un entero entre ${NPC_LEVEL_MIN} y ${NPC_LEVEL_MAX}`);
      return;
    }
    const nextStats: NpcStats = {};
    for (const { key, label } of NPC_STATS) {
      const raw = stats[key].trim().replace(',', '.');
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        setError(`${label} tiene que ser un número`);
        return;
      }
      nextStats[key] = value;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...draft,
        name,
        type: draft.type.trim(),
        region: draft.region.trim(),
        image: draft.image.trim(),
        background: draft.background?.trim() || null,
        description: draft.description.trim(),
        level: parsedLevel,
        stats: nextStats,
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
        <h2 className="hab-modal__title">{title}</h2>

        <div className="npc-kind-switch" role="radiogroup" aria-label="Clase">
          {NPC_KINDS.map(kind => (
            <button
              key={kind.value}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind.value}
              className={cx('npc-kind-switch__btn', draft.kind === kind.value && 'npc-kind-switch__btn--on')}
              onClick={() => change({ kind: kind.value as NpcKind })}
            >
              {kind.icon} {kind.label}
            </button>
          ))}
        </div>

        <label className="hab-field">
          <span>Nombre</span>
          <input value={draft.name} autoFocus maxLength={NPC_NAME_MAX} onChange={e => change({ name: e.target.value })} />
        </label>

        <div className="npc-editor__row">
          <label className="hab-field">
            <span>Tipo</span>
            <input value={draft.type} list="npc-types" maxLength={NPC_TAG_MAX} placeholder="Bestia, Mercader, Jefe…" onChange={e => change({ type: e.target.value })} />
            <datalist id="npc-types">{types.map(t => <option key={t} value={t} />)}</datalist>
          </label>
          <label className="hab-field">
            <span>Región</span>
            <input value={draft.region} list="npc-regions" maxLength={NPC_TAG_MAX} placeholder="Demacia, Freljord…" onChange={e => change({ region: e.target.value })} />
            <datalist id="npc-regions">{regions.map(r => <option key={r} value={r} />)}</datalist>
          </label>
          <label className="hab-field npc-editor__level">
            <span>Nivel</span>
            <input type="number" min={NPC_LEVEL_MIN} max={NPC_LEVEL_MAX} step={1} value={level} onChange={e => setLevel(e.target.value)} />
          </label>
        </div>

        <label className="hab-field">
          <span>Foto (URL)</span>
          <input type="url" value={draft.image} placeholder="https://…" onChange={e => change({ image: e.target.value })} />
        </label>
        <label className="hab-field">
          <span>Fondo de la ficha (URL, opcional)</span>
          <input type="url" value={draft.background ?? ''} placeholder="https://…" onChange={e => change({ background: e.target.value })} />
        </label>

        <label className="hab-field">
          <span>Descripción / trasfondo</span>
          <textarea rows={4} maxLength={NPC_DESCRIPTION_MAX} value={draft.description} onChange={e => change({ description: e.target.value })} />
        </label>

        <div className="hab-modal__block">
          <span className="hab-modal__tag">Estadísticas (vacío = no se muestra)</span>
          <div className="npc-editor__stats">
            {NPC_STATS.map(({ key, label, title: statTitle }) => (
              <label key={key} className="hab-field" title={statTitle}>
                <span>{label}</span>
                <input inputMode="decimal" value={stats[key]} onChange={e => setStats(current => ({ ...current, [key]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          className={cx('hab-learned', draft.visible && 'hab-learned--on')}
          aria-pressed={draft.visible}
          onClick={() => change({ visible: !draft.visible })}
        >
          <span>Visible para players</span>
          <span className="hab-learned__switch" aria-hidden="true" />
        </button>

        {error && <p className="hab-modal__error" role="alert">{error}</p>}

        <div className="hab-modal__actions">
          <button type="submit" className="hab-modal__btn" disabled={saving}>
            {saving ? 'Guardando…' : submitLabel}
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

export default NpcEditorModal;
