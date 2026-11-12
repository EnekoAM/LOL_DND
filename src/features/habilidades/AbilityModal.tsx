import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import ScalingSourceFields from './ScalingSourceFields';
import PhaseTabs from './PhaseTabs';
import { MAX_ABILITY_VARIANTS, abilityPhase, hasVariants, isChoosePhases, phaseLabels } from '../../data/abilityVariants';
import { saveChampionAbility, type Ability, type AbilityKey, type Champion } from '../../data/champions';
import { RESOURCE_IDS, RESOURCE_LABELS, resolveAbilityResource, type ResourceId } from '../../data/resources';
import ResourceChip from '../../components/ResourceChip';
import { AreaGridEditor, AreaGridView } from '../../components/AreaGrid';
import { useCanEdit } from '../../data/appRoleContext';
import { cx } from '../../lib/cx';
import { formatPercentList } from '../../lib/format';
import { ABILITY_LABELS } from './championStyle';
import {
  abilityToDraft,
  blankEffect,
  blankVariant,
  damageBonusOf,
  draftToAbility,
  type AbilityDraft,
  type EffectDraft,
  type VariantDraft,
} from './abilityDraft';

type Props = {
  champion: Champion;
  slot: AbilityKey;
  onClose: () => void;
  onSaved: () => void;
};

const listText = (values: number[] | undefined): string => (values ?? []).join(' / ');

const AbilityView = ({ ability: fullAbility, championResource, onEdit, canEdit }: { ability: Ability | null; championResource?: ResourceId; onEdit: () => void; canEdit: boolean }) => {
  const [phase, setPhase] = useState(0);
  const phased = hasVariants(fullAbility);
  const ability = fullAbility ? abilityPhase(fullAbility, phase) : null;
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
      {phased && (
        <div className="phase-tabs__row">
          <PhaseTabs labels={phaseLabels(fullAbility)} active={phase} onSelect={setPhase} />
          <span className="phase-tabs__mode-chip">{isChoosePhases(fullAbility) ? 'A elegir' : 'En orden'}</span>
        </div>
      )}
      <h2 className="hab-modal__title">{ability.name || 'Sin nombre'}</h2>
      <p className="hab-modal__desc">{ability?.description || 'Sin descripción'}</p>

      {(ability?.cost || resourceChip) && (
        <div className="hab-modal__block">
          <span className="hab-modal__tag">{ability?.cost ? 'Coste' : 'Recurso'}</span>
          <p className="hab-modal__cost">{ability?.cost}{resourceChip}</p>
        </div>
      )}
      {fullAbility?.appliesOnHit && (
        <p className="hab-modal__meta"><strong>Aplica efectos de impacto:</strong> sí</p>
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

      {fullAbility?.area && (
        <div className="hab-modal__block">
          <span className="hab-modal__tag">Área</span>
          <AreaGridView area={fullAbility.area} cellPx={12} />
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
  const [phase, setPhase] = useState(0);
  const labels = ['Fase 1', ...draft.variants.map((variant, index) => variant.name.trim() || `Fase ${index + 2}`)];
  const activePhase = Math.min(phase, draft.variants.length);
  const setVariants = (variants: VariantDraft[]) => onChange({ variants });
  const addVariant = () => {
    if (draft.variants.length >= MAX_ABILITY_VARIANTS) return;
    setVariants([...draft.variants, blankVariant()]);
    setPhase(draft.variants.length + 1);
  };
  const moveVariant = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.variants.length) return;
    const next = [...draft.variants];
    [next[index], next[target]] = [next[target], next[index]];
    setVariants(next);
    setPhase(target + 1);
  };
  const removeVariant = (index: number) => {
    setVariants(draft.variants.filter((_, i) => i !== index));
    setPhase(Math.min(index + 1, draft.variants.length - 1));
  };

  const tabs = (
    <div className="phase-tabs__row">
      <PhaseTabs
        labels={labels}
        active={activePhase}
        onSelect={setPhase}
        onAdd={addVariant}
        addDisabled={draft.variants.length >= MAX_ABILITY_VARIANTS}
        disabled={saving}
      />
      {labels.length >= 2 && (
        <label className="phase-tabs__mode" title="En orden: Usar pasa a la siguiente fase. A elegir: en combate se elige qué fase usar (combos).">
          <span>Fases</span>
          <select value={draft.phaseMode} disabled={saving} onChange={e => onChange({ phaseMode: e.target.value === 'choose' ? 'choose' : 'sequential' })}>
            <option value="sequential">En orden</option>
            <option value="choose">A elegir</option>
          </select>
        </label>
      )}
    </div>
  );

  const actions = (
    <>
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

  if (activePhase > 0) {
    const index = activePhase - 1;
    return (
      <>
        {tabs}
        <div className="phase-tabs__tools">
          <button type="button" className="hab-modal__btn hab-modal__btn--ghost" disabled={saving || index === 0} onClick={() => moveVariant(index, -1)}>◀ Mover</button>
          <button type="button" className="hab-modal__btn hab-modal__btn--ghost" disabled={saving || index === draft.variants.length - 1} onClick={() => moveVariant(index, 1)}>Mover ▶</button>
          <button type="button" className="hab-modal__btn hab-modal__btn--ghost" disabled={saving} onClick={() => removeVariant(index)}>Quitar fase</button>
        </div>
        <VariantFields
          key={index}
          base={draft}
          variant={draft.variants[index]}
          index={index}
          championResource={championResource}
          saving={saving}
          onChange={patch => setVariants(draft.variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)))}
        />
        {actions}
      </>
    );
  }

  return (
    <>
      {tabs}
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
        className={cx('hab-learned', draft.appliesOnHit && 'hab-learned--on')}
        aria-pressed={draft.appliesOnHit}
        disabled={saving}
        title="En combate, al acertar dispara también las reglas «Al aplicar efecto de impacto» de los ítems (no las de solo AA)"
        onClick={() => onChange({ appliesOnHit: !draft.appliesOnHit })}
      >
        <span>Aplica efectos de impacto</span>
        <span className="hab-learned__switch" aria-hidden="true" />
      </button>

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

      <div className="hab-modal__block">
        <span className="hab-modal__tag">Área (tablero)</span>
        <AreaGridEditor value={draft.area} disabled={saving} onChange={area => onChange({ area })} />
      </div>

      {actions}
    </>
  );
};

const inherit = (value: string, fallback = '—') => `Fase 1: ${value.trim() || fallback}`;

/** Campos de una fase 2+. Lo que se deja en blanco hereda de la fase 1. */
const VariantFields = ({ base, variant, index, championResource, saving, onChange }: {
  base: AbilityDraft;
  variant: VariantDraft;
  index: number;
  championResource?: ResourceId;
  saving: boolean;
  onChange: (patch: Partial<VariantDraft>) => void;
}) => {
  const baseResource = base.resource
    ? RESOURCE_LABELS[base.resource as ResourceId] ?? base.resource
    : championResource ? `del campeón (${RESOURCE_LABELS[championResource]})` : 'del campeón';
  const effectChange = (effectIndex: number, patch: Partial<EffectDraft>) => onChange({
    effects: variant.effects.map((effect, i) => (i === effectIndex ? { ...effect, ...patch } : effect)),
  });
  return (
    <>
      <p className="phase-tabs__hint">Lo que dejes en blanco se copia de la Fase 1.</p>
      <label className="hab-field">
        <span>Nombre de la fase</span>
        <input value={variant.name} placeholder={`Fase ${index + 2}`} onChange={e => onChange({ name: e.target.value })} />
      </label>
      <label className="hab-field">
        <span>Descripción</span>
        <textarea rows={4} value={variant.description} placeholder={base.description.trim() ? 'Igual que la Fase 1' : ''} onChange={e => onChange({ description: e.target.value })} />
      </label>
      <label className="hab-field">
        <span>Coste</span>
        <input value={variant.cost} placeholder={inherit(base.cost, 'sin coste')} onChange={e => onChange({ cost: e.target.value })} />
      </label>
      <label className="hab-field">
        <span>Recurso</span>
        <select value={variant.resource} onChange={e => onChange({ resource: e.target.value })}>
          <option value="">Igual que la Fase 1 ({baseResource})</option>
          {RESOURCE_IDS.map(id => (
            <option key={id} value={id}>{RESOURCE_LABELS[id]}</option>
          ))}
        </select>
      </label>
      <label className="hab-field">
        <span>Cooldown (turnos)</span>
        <input value={variant.cooldown} placeholder={inherit(base.cooldown, 'sin cooldown')} onChange={e => onChange({ cooldown: e.target.value })} />
      </label>
      <label className="hab-field">
        <span>Efecto (turnos)</span>
        <input value={variant.effectDuration} placeholder={inherit(base.effectDuration, 'sin duración')} onChange={e => onChange({ effectDuration: e.target.value })} />
      </label>
      <label className="hab-field">
        <span>Objetivo del efecto</span>
        <select value={variant.effectTarget} onChange={e => {
          const value = e.target.value;
          onChange({ effectTarget: value === 'enemy' || value === 'self' ? value : '' });
        }}>
          <option value="">Igual que la Fase 1 ({base.effectTarget === 'enemy' ? 'Enemigo' : 'Propio'})</option>
          <option value="self">Propio</option>
          <option value="enemy">Enemigo</option>
        </select>
      </label>
      <label className="hab-field">
        <span>Nombre del efecto (opcional)</span>
        <input value={variant.effectName} placeholder={inherit(base.effectName, 'el de la habilidad')} onChange={e => onChange({ effectName: e.target.value })} />
      </label>

      <div className="hab-modal__block">
        <span className="hab-modal__tag">Daño</span>
        <label className="hab-field">
          <span>Tipo</span>
          <input value={variant.damageType} placeholder={inherit(base.damageType)} onChange={e => onChange({ damageType: e.target.value })} />
        </label>
        <label className="hab-field">
          <span>Escalado de AP (%)</span>
          <input value={variant.ap} placeholder={inherit(base.ap)} onChange={e => onChange({ ap: e.target.value })} />
        </label>
        <label className="hab-field">
          <span>Escalado de AD (%)</span>
          <input value={variant.ad} placeholder={inherit(base.ad)} onChange={e => onChange({ ad: e.target.value })} />
        </label>
        {(['ad', 'ap'] as const).map(stat => {
          const key = stat === 'ad' ? 'adSource' : 'apSource';
          return (
            <label className="hab-field" key={stat}>
              <span>Origen del escalado de {stat.toUpperCase()}</span>
              <select className="hab-select" value={variant[key]} disabled={saving}
                onChange={event => {
                  const value = event.target.value;
                  onChange({ [key]: value === 'bonus' || value === 'total' ? value : '' });
                }}>
                <option value="">Igual que la Fase 1 ({base[key] === 'bonus' ? 'Bonus' : 'Total'})</option>
                <option value="total">Total (base por nivel + equipo + extras)</option>
                <option value="bonus">Bonus (solo equipo + extras, sin base por nivel)</option>
              </select>
            </label>
          );
        })}
        <label className="hab-field">
          <span>Multiplicador a objetivo único</span>
          <input value={variant.damageBonus} placeholder={inherit(base.damageBonus)} onChange={e => onChange({ damageBonus: e.target.value })} />
        </label>
      </div>

      <div className="hab-modal__block">
        <span className="hab-modal__tag">Efectos</span>
        {variant.effects.length === 0 && (
          <p className="phase-tabs__hint">
            {base.effects.some(effect => effect.name.trim()) ? 'Usa los efectos de la Fase 1. Si añades alguno, se sustituyen.' : 'Sin efectos.'}
          </p>
        )}
        {variant.effects.map((effect, effectIndex) => (
          <div key={effectIndex} className="hab-modal__effect-edit">
            <label className="hab-field">
              <span>Nombre</span>
              <input value={effect.name} onChange={e => effectChange(effectIndex, { name: e.target.value })} />
            </label>
            <label className="hab-field">
              <span>Valores</span>
              <input value={effect.values} placeholder="10, 20, 30" onChange={e => effectChange(effectIndex, { values: e.target.value })} />
            </label>
            <label className="hab-field">
              <span>Duración</span>
              <input value={effect.duration} placeholder="2, 2, 3" onChange={e => effectChange(effectIndex, { duration: e.target.value })} />
            </label>
            <button type="button" className="hab-modal__btn hab-modal__btn--ghost" onClick={() => onChange({ effects: variant.effects.filter((_, i) => i !== effectIndex) })}>
              Quitar
            </button>
          </div>
        ))}
        <button type="button" className="hab-modal__btn hab-modal__btn--ghost" onClick={() => onChange({ effects: [...variant.effects, blankEffect()] })}>
          Añadir efecto
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
