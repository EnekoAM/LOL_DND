import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import type { Npc, NpcAbility } from '../../data/npcs';
import { newAbilityId } from '../../data/npcs';
import { formatPercentList } from '../../lib/format';
import {
  abilityToDraft,
  blankEffect,
  damageBonusOf,
  draftToAbility,
  type AbilityDraft,
  type EffectDraft,
} from '../habilidades/abilityDraft';

type Props = {
  npc: Npc;
  /** null = habilidad nueva (abre directamente el formulario). */
  ability: NpcAbility | null;
  canEdit: boolean;
  /** Empieza en modo edición (botón «Editar» de la tarjeta). */
  startEditing?: boolean;
  onClose: () => void;
  onSave: (ability: NpcAbility) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type Draft = AbilityDraft & { label: string };

const toDraft = (ability: NpcAbility | null): Draft => ({ ...abilityToDraft(ability), label: ability?.label ?? '' });

const listText = (values: number[] | undefined): string => (values ?? []).join(' / ');

const NpcAbilityModal = ({ npc, ability, canEdit, startEditing = false, onClose, onSave, onDelete }: Props) => {
  const isNew = ability === null;
  const [editing, setEditing] = useState(canEdit && (isNew || startEditing));
  const [draft, setDraft] = useState<Draft>(() => toDraft(ability));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (editing && !isNew) {
      setError(null);
      setEditing(false);
      return;
    }
    onClose();
  }, [editing, isNew, onClose, saving]);

  const change = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const changeEffect = (index: number, patch: Partial<EffectDraft>) => setDraft(current => ({
    ...current,
    effects: current.effects.map((effect, i) => (i === index ? { ...effect, ...patch } : effect)),
  }));

  const save = async () => {
    if (saving) return;
    let next: NpcAbility;
    try {
      // learned no aplica a los NPCs: se descarta.
      const { learned: _learned, ...parsed } = draftToAbility(draft);
      next = { ...parsed, id: ability?.id ?? newAbilityId() };
      const label = draft.label.trim();
      if (label) next.label = label;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo leer el formulario');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      if (isNew) onClose();
      else setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!ability || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(ability.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo borrar');
      setSaving(false);
    }
  };

  const damage = ability?.damage;
  const bonus = damageBonusOf(damage);
  const effects = ability?.effect ?? [];

  return createPortal(
    <Modal onClose={requestClose} backdropClassName="hab-modal-backdrop" className="hab-modal">
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
      <div className="hab-modal__body">
        <div className="hab-modal__kicker">
          {npc.image && <img src={npc.image} alt="" />}
          <span>{(editing ? draft.label : ability?.label) || 'Habilidad'} · {npc.name}</span>
        </div>

        {editing ? (
          <>
            <label className="hab-field">
              <span>Nombre</span>
              <input value={draft.name} autoFocus maxLength={80} onChange={e => change({ name: e.target.value })} />
            </label>
            <label className="hab-field">
              <span>Etiqueta (opcional)</span>
              <input value={draft.label} maxLength={20} placeholder="Pasiva, Ataque, Q, Fase 2…" onChange={e => change({ label: e.target.value })} />
            </label>
            <label className="hab-field">
              <span>Descripción / efecto</span>
              <textarea rows={5} maxLength={2000} value={draft.description} onChange={e => change({ description: e.target.value })} />
            </label>
            <label className="hab-field">
              <span>Coste</span>
              <input value={draft.cost} maxLength={200} placeholder="30 maná, 1/día, recarga 5-6…" onChange={e => change({ cost: e.target.value })} />
            </label>

            <div className="hab-modal__block">
              <span className="hab-modal__tag">Daño (opcional)</span>
              <label className="hab-field">
                <span>Tipo</span>
                <input value={draft.damageType} placeholder="mágico, físico, 2d6 fuego…" onChange={e => change({ damageType: e.target.value })} />
              </label>
              <label className="hab-field">
                <span>Escalado de AP (%)</span>
                <input value={draft.ap} placeholder="30, 35, 40, 45" onChange={e => change({ ap: e.target.value })} />
              </label>
              <label className="hab-field">
                <span>Escalado de AD (%)</span>
                <input value={draft.ad} placeholder="30, 35, 40, 45" onChange={e => change({ ad: e.target.value })} />
              </label>
              <label className="hab-field">
                <span>Multiplicador a objetivo único</span>
                <input value={draft.damageBonus} placeholder="2" onChange={e => change({ damageBonus: e.target.value })} />
              </label>
            </div>

            <div className="hab-modal__block">
              <span className="hab-modal__tag">Efectos (opcional)</span>
              {draft.effects.map((effect, index) => (
                <div key={index} className="hab-modal__effect-edit">
                  <label className="hab-field">
                    <span>Nombre</span>
                    <input value={effect.name} onChange={e => changeEffect(index, { name: e.target.value })} />
                  </label>
                  <label className="hab-field">
                    <span>Valores</span>
                    <input value={effect.values} placeholder="10, 20, 30" onChange={e => changeEffect(index, { values: e.target.value })} />
                  </label>
                  <label className="hab-field">
                    <span>Duración</span>
                    <input value={effect.duration} placeholder="2, 2, 3" onChange={e => changeEffect(index, { duration: e.target.value })} />
                  </label>
                  <button
                    type="button"
                    className="hab-modal__btn hab-modal__btn--ghost"
                    onClick={() => setDraft(current => ({ ...current, effects: current.effects.filter((_, i) => i !== index) }))}
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="hab-modal__btn hab-modal__btn--ghost"
                onClick={() => setDraft(current => ({ ...current, effects: [...current.effects, blankEffect()] }))}
              >
                Añadir efecto
              </button>
            </div>

            {error && <p className="hab-modal__error" role="alert">{error}</p>}

            <div className="hab-modal__actions">
              <button type="button" className="hab-modal__btn" onClick={() => { void save(); }} disabled={saving}>
                {saving ? 'Guardando…' : isNew ? 'Añadir habilidad' : 'Guardar'}
              </button>
              <button
                type="button"
                className="hab-modal__btn hab-modal__btn--ghost"
                disabled={saving}
                onClick={() => {
                  if (isNew) onClose();
                  else {
                    setDraft(toDraft(ability));
                    setError(null);
                    setEditing(false);
                  }
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        ) : ability ? (
          <>
            <h2 className="hab-modal__title">{ability.name || 'Sin nombre'}</h2>
            <p className="hab-modal__desc npc-ability__desc">{ability.description || 'Sin descripción'}</p>

            {ability.cost && (
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

            {error && <p className="hab-modal__error" role="alert">{error}</p>}

            {canEdit && (
              <div className="hab-modal__actions">
                <button type="button" className="hab-modal__btn" disabled={saving} onClick={() => { setDraft(toDraft(ability)); setEditing(true); }}>
                  Editar
                </button>
                {confirmDelete ? (
                  <>
                    <button type="button" className="hab-modal__btn npc-btn--danger" disabled={saving} onClick={() => { void remove(); }}>
                      {saving ? 'Borrando…' : 'Sí, borrar'}
                    </button>
                    <button type="button" className="hab-modal__btn hab-modal__btn--ghost" disabled={saving} onClick={() => setConfirmDelete(false)}>
                      No
                    </button>
                  </>
                ) : (
                  <button type="button" className="hab-modal__btn hab-modal__btn--ghost" onClick={() => setConfirmDelete(true)}>
                    Borrar
                  </button>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    </Modal>,
    document.body,
  );
};

export default NpcAbilityModal;
