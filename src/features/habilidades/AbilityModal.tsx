import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import ScalingSourceFields from './ScalingSourceFields';
import { saveChampionAbility, type Ability, type AbilityKey, type Champion } from '../../data/champions';
import { RESOURCE_IDS, RESOURCE_LABELS, resolveAbilityResource, type ResourceId } from '../../data/resources';
import ResourceChip from '../../components/ResourceChip';
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

const AbilityView = ({ ability, championResource, onEdit, canEdit }: { ability: Ability | null; championResource?: ResourceId; onEdit: () => void; canEdit: boolean }) => {
  const damage = ability?.damage;
  const bonus = damageBonusOf(damage);
  const effects = ability?.effect ?? [];
  const resolved = resolveAbilityResource(ability ?? undefined, championResource ? { resource: championResource } : undefined);
  const resourceChip = resolved ? <ResourceChip resource={resolved.id} inherited={resolved.inherited} /> : null;

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

      {(ability?.cost || resourceChip) && (
        <div className="hab-modal__block">
          <span className="hab-modal__tag">{ability?.cost ? 'Coste' : 'Recurso'}</span>
          <p className="hab-modal__cost">{ability?.cost}{resourceChip}</p>
        </div>
      )}
      {ability?.hasStacks && (
        <p className="hab-modal__meta"><strong>Stacks:</strong> sí{typeof ability.maxStacks === 'number' ? ` (máx. ${ability.maxStacks})` : ''}</p>
      )}
      {typeof ability?.cooldown === 'number' && (
        <p className="hab-modal__meta"><strong>Cooldown:</strong> {ability.cooldown} turno{ability.cooldown === 1 ? '' : 's'}</p>
      )}
      {typeof ability?.effectDuration === 'number' && (
        <p className="hab-modal__meta"><strong>Efecto:</strong> {ability.effectDuration} turno{ability.effectDuration === 1 ? '' : 's'}</p>
      )}
      {ability?.effectTarget === 'enemy' && (
        <p className="hab-modal__meta"><strong>Objetivo:</strong> enemigo</p>
      )}
      {ability?.effectName && (
        <p className="hab-modal__meta"><strong>Nombre del efecto:</strong> {ability.effectName}</p>
      )}

      {damage && (
        <div className="hab-modal__block">
          <span className="hab-modal__tag">Daño</span>
          <ul className="hab-modal__stats">
            {damage.type && <li><span>Tipo</span><span>{damage.type}</span></li>}
            {damage.ap && <li><span>AP {damage.apSource === 'bonus' ? 'bonus' : 'total'}</span><span>{formatPercentList(damage.ap)}</span></li>}
            {damage.ad && <li><span>AD {damage.adSource === 'bonus' ? 'bonus' : 'total'}</span><span>{formatPercentList(damage.ad)}</span></li>}
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
  championResource?: ResourceId;
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
  championResource,
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

      <label className="hab-field">
        <span>Recurso</span>
        <select value={draft.resource} onChange={e => onChange({ resource: e.target.value })}>
          <option value="">{championResource ? `Del campeón (${RESOURCE_LABELS[championResource]})` : 'Del campeón'}</option>
          {RESOURCE_IDS.map(id => (
            <option key={id} value={id}>{RESOURCE_LABELS[id]}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className={cx('hab-learned', draft.hasStacks && 'hab-learned--on')}
        aria-pressed={draft.hasStacks}
        disabled={saving}
        onClick={() => onChange({ hasStacks: !draft.hasStacks })}
      >
        <span>Stacks</span>
        <span className="hab-learned__switch" aria-hidden="true" />
      </button>
      {draft.hasStacks && (
        <label className="hab-field">
          <span>Máx. stacks (opcional)</span>
          <input value={draft.maxStacks} placeholder="Sin tope" onChange={e => onChange({ maxStacks: e.target.value })} />
        </label>
      )}

      <label className="hab-field">
        <span>Cooldown (turnos)</span>
        <input value={draft.cooldown} placeholder="Sin cooldown" onChange={e => onChange({ cooldown: e.target.value })} />
      </label>

      <label className="hab-field">
        <span>Efecto (turnos)</span>
        <input value={draft.effectDuration} placeholder="Sin duración" onChange={e => onChange({ effectDuration: e.target.value })} />
      </label>

      <label className="hab-field">
        <span>Objetivo del efecto</span>
        <select value={draft.effectTarget} onChange={e => onChange({ effectTarget: e.target.value === 'enemy' ? 'enemy' : 'self' })}>
          <option value="self">Propio</option>
          <option value="enemy">Enemigo</option>
        </select>
      </label>

      <label className="hab-field">
        <span>Nombre del efecto (opcional)</span>
        <input value={draft.effectName} placeholder="El de la habilidad" onChange={e => onChange({ effectName: e.target.value })} />
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
        <ScalingSourceFields draft={draft} disabled={saving} onChange={onChange} />
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
            championResource={champion.resource}
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
          <AbilityView ability={ability} championResource={champion.resource} onEdit={startEditing} canEdit={canEdit} />
        )}
      </div>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    </Modal>,
    document.body,
  );
};

export default AbilityModal;
