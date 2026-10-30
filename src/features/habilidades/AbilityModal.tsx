import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import { saveChampionAbility, type Ability, type AbilityKey, type Champion } from '../../data/champions';
import { useCanEdit } from '../../data/appRoleContext';
import { cx } from '../../lib/cx';
import { formatPercentList } from '../../lib/format';
import { ABILITY_LABELS } from './championStyle';
import {
  abilityToDraft,
  blankEffect,
  damageBonusOf,
  draftToAbility,
  type AbilityDraft,
  type EffectDraft,
} from './abilityDraft';

type Props = {
  champion: Champion;
  slot: AbilityKey;
  onClose: () => void;
  onSaved: () => void;
};

const listText = (values: number[] | undefined): string => (values ?? []).join(' / ');

const AbilityView = ({ ability, onEdit, canEdit }: { ability: Ability | null; onEdit: () => void; canEdit: boolean }) => {
  const damage = ability?.damage;
  const bonus = damageBonusOf(damage);
  const effects = ability?.effect ?? [];

  if (!ability) {
    return (
      <>
        <p className="hab-modal__desc">Esta habilidad no está definida.</p>
        {canEdit && (
        <div className="hab-modal__actions">
          <button type="button" className="hab-modal__btn" onClick={onEdit}>Editar</button>
        </div>
      )}
      </>
    );
  }

  return (
    <>
      <h2 className="hab-modal__title">{ability.name || 'Sin nombre'}</h2>
      <p className="hab-modal__desc">{ability?.description || 'Sin descripción'}</p>

      {ability?.cost && (
        <div className="hab-modal__block">
          <span className="hab-modal__tag">Coste</span>
          <p>{ability.cost}</p>
        </div>
      )}

      {damage && (
        <div className="hab-modal__block">
          <span className="hab-modal__tag">Daño</span>
          <ul className="hab-modal__stats">
            {damage.type && <li><span>Tipo</span><span>{damage.type}</span></li>}
            {damage.ap && <li><span>AP</span><span>{formatPercentList(damage.ap)}</span></li>}
            {damage.ad && <li><span>AD</span><span>{formatPercentList(damage.ad)}</span></li>}
            {bonus !== undefined && <li><span>Objetivo único</span><span>×{bonus}</span></li>}
          </ul>
        </div>
      )}

      {effects.length > 0 && (
        <div className="hab-modal__block">
          <span className="hab-modal__tag">Efectos</span>
          {effects.map((effect, index) => (
            <div key={`${effect.name}-${index}`} className="hab-modal__effect">
              <strong>{effect.name}</strong>
              {effect.values && <span>Valores: {listText(effect.values)}</span>}
              {effect.duration && <span>Duración: {listText(effect.duration)}</span>}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="hab-modal__actions">
          <button type="button" className="hab-modal__btn" onClick={onEdit}>Editar</button>
        </div>
      )}
    </>
  );
};

type FormProps = {
  draft: AbilityDraft;
  originalName: string;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<AbilityDraft>) => void;
  onEffectChange: (index: number, patch: Partial<EffectDraft>) => void;
  onAddEffect: () => void;
  onRemoveEffect: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
};

const AbilityForm = ({
  draft,
  originalName,
  saving,
  error,
  onChange,
  onEffectChange,
  onAddEffect,
  onRemoveEffect,
  onSave,
  onCancel,
}: FormProps) => {
  const renamed = originalName !== '' && draft.name.trim() !== originalName;

  return (
    <>
      <label className="hab-field">
        <span>Nombre</span>
        <input value={draft.name} onChange={e => onChange({ name: e.target.value })} />
      </label>
      {renamed && (
        <p className="hab-modal__hint">Si cambias el nombre, los jugadores que la tenían asignada dejan de encontrarla.</p>
      )}

      <label className="hab-field">
        <span>Descripción</span>
        <textarea rows={4} value={draft.description} onChange={e => onChange({ description: e.target.value })} />
      </label>

      <button
        type="button"
        className={cx('hab-learned', draft.learned && 'hab-learned--on')}
        aria-pressed={draft.learned}
        disabled={saving}
        onClick={() => onChange({ learned: !draft.learned })}
      >
        <span>Aprendida</span>
        <span className="hab-learned__switch" aria-hidden="true" />
      </button>

      <label className="hab-field">
        <span>Coste</span>
        <input value={draft.cost} onChange={e => onChange({ cost: e.target.value })} />
      </label>

      <div className="hab-modal__block">
        <span className="hab-modal__tag">Daño</span>
        <label className="hab-field">
          <span>Tipo</span>
          <input value={draft.damageType} placeholder="mágico, físico…" onChange={e => onChange({ damageType: e.target.value })} />
        </label>
        <label className="hab-field">
          <span>Escalado de AP (%)</span>
          <input value={draft.ap} placeholder="30, 35, 40, 45" onChange={e => onChange({ ap: e.target.value })} />
        </label>
        <label className="hab-field">
          <span>Escalado de AD (%)</span>
          <input value={draft.ad} placeholder="30, 35, 40, 45" onChange={e => onChange({ ad: e.target.value })} />
        </label>
        <label className="hab-field">
          <span>Multiplicador a objetivo único</span>
          <input value={draft.damageBonus} placeholder="2" onChange={e => onChange({ damageBonus: e.target.value })} />
        </label>
      </div>

      <div className="hab-modal__block">
        <span className="hab-modal__tag">Efectos</span>
        {draft.effects.map((effect, index) => (
          <div key={index} className="hab-modal__effect-edit">
            <label className="hab-field">
              <span>Nombre</span>
              <input value={effect.name} onChange={e => onEffectChange(index, { name: e.target.value })} />
            </label>
            <label className="hab-field">
              <span>Valores</span>
              <input value={effect.values} placeholder="10, 20, 30" onChange={e => onEffectChange(index, { values: e.target.value })} />
            </label>
            <label className="hab-field">
              <span>Duración</span>
              <input value={effect.duration} placeholder="2, 2, 3" onChange={e => onEffectChange(index, { duration: e.target.value })} />
            </label>
            <button type="button" className="hab-modal__btn hab-modal__btn--ghost" onClick={() => onRemoveEffect(index)}>
              Quitar
            </button>
          </div>
        ))}
        <button type="button" className="hab-modal__btn hab-modal__btn--ghost" onClick={onAddEffect}>
          Añadir efecto
        </button>
      </div>

      {error && <p className="hab-modal__error">{error}</p>}

      <div className="hab-modal__actions">
        <button type="button" className="hab-modal__btn" onClick={onSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="hab-modal__btn hab-modal__btn--ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </>
  );
};

const AbilityModal = ({ champion, slot, onClose, onSaved }: Props) => {
  const canEdit = useCanEdit();
  const ability = champion.abilities[slot] ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AbilityDraft>(() => abilityToDraft(ability));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (editing) {
      setError(null);
      setEditing(false);
      return;
    }
    onClose();
  }, [editing, onClose, saving]);

  const startEditing = () => {
    setDraft(abilityToDraft(ability));
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    if (saving) return;
    let next: Ability;
    try {
      next = draftToAbility(draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo leer el formulario');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveChampionAbility(champion.champion, slot, next);
      onSaved();
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <Modal onClose={requestClose} backdropClassName="hab-modal-backdrop" className="hab-modal">
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
      <div className="hab-modal__body">
        <div className="hab-modal__kicker">
          {champion.image && <img src={champion.image} alt="" />}
          <span>{ABILITY_LABELS[slot]} · {champion.champion}</span>
        </div>

        {editing ? (
          <AbilityForm
            draft={draft}
            originalName={ability?.name ?? ''}
            saving={saving}
            error={error}
            onChange={patch => setDraft(current => ({ ...current, ...patch }))}
            onEffectChange={(index, patch) => setDraft(current => ({
              ...current,
              effects: current.effects.map((effect, effectIndex) => (
                effectIndex === index ? { ...effect, ...patch } : effect
              )),
            }))}
            onAddEffect={() => setDraft(current => ({ ...current, effects: [...current.effects, blankEffect()] }))}
            onRemoveEffect={index => setDraft(current => ({
              ...current,
              effects: current.effects.filter((_, effectIndex) => effectIndex !== index),
            }))}
            onSave={() => { void save(); }}
            onCancel={cancelEditing}
          />
        ) : (
          <AbilityView ability={ability} onEdit={startEditing} canEdit={canEdit} />
        )}
      </div>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    </Modal>,
    document.body,
  );
};

export default AbilityModal;
