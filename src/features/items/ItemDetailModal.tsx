import { useCallback, useState } from 'react';
import Modal from '../../components/Modal';
import { PASSIVE_TRIGGERS, saveItemUpdate, type Item, type ItemUpdate, type PassiveTrigger } from '../../data/items';
import { STAT_COLUMNS, formatStat } from '../calculos/statLine';
import { cx } from '../../lib/cx';
import { draftToItemUpdate, itemToDraft, type ItemDraft } from './itemDraft';
import ItemStock from './ItemStock';
import { RARITIES, rarityClass } from './rarity';
import { useCanEdit } from '../../data/appRoleContext';
import { describeNamedEffect, namedEffectArea, namedEffectBonus, namedEffectOnHit, useNamedEffectDescriptions } from '../../data/namedEffectDescriptions';
import { configSummary } from '../../data/effectBonus';
import { AreaGridView } from '../../components/AreaGrid';
import { formatStatValue, getVisibleStats } from './stats';

import { NAMED_EFFECTS, NAMED_EFFECT_KIND_LABEL, baseNamedEffectId, findNamedEffect, groupNamedEffects, namedEffectDescription, namedEffectName, namedEffectOptions } from '../../data/namedEffects';

const triggerLabel = (trigger: PassiveTrigger): string => PASSIVE_TRIGGERS.find(entry => entry.id === trigger)?.label ?? trigger;
const statTitle = (key: string): string => STAT_COLUMNS.find(column => column.key === key)?.title ?? key;

type Props = {
  item: Item;
  onClose: () => void;
  onSaved?: (item: Item) => void;
  readOnly?: boolean;
};

const EFFECTS = [
  { key: 'pasiva', label: 'Pasiva' },
  { key: 'activa', label: 'Activa' },
] as const;

/** El TSV marca con "-" los ítems sin ese efecto. */
const isEffectDefined = (text: string | undefined): boolean =>
  !!text && text.trim() !== '' && text.trim() !== '-';

const ItemView = ({ item, onEdit, canEdit }: { item: Item; onEdit: () => void; canEdit: boolean }) => {
  const effects = EFFECTS.filter(({ key }) => isEffectDefined(item.efecto?.[key]));
  const rarity = rarityClass(item.rareza);
  const effectDescriptions = useNamedEffectDescriptions();

  return (
    <>
      <div className={cx('modal-rarity', rarity)}>{item.rareza}</div>

      <h2 className="modal-title">{item.nombre}</h2>

      <ItemStock item={item} className={cx('item-stock--modal', rarity)} />
      {item.hasStacks && (
        <p className="item-edit__hint">
          Stacks activos{typeof item.maxStacks === 'number' ? ` (máx. ${item.maxStacks})` : ''}
        </p>
      )}
      {typeof item.cooldown === 'number' && (
        <p className="item-edit__hint">Cooldown: {item.cooldown} turno{item.cooldown === 1 ? '' : 's'}</p>
      )}
      {typeof item.effectDuration === 'number' && (
        <p className="item-edit__hint">Efecto: {item.effectDuration} turno{item.effectDuration === 1 ? '' : 's'}</p>
      )}
      {item.effectTarget === 'enemy' && (
        <p className="item-edit__hint">Objetivo: enemigo</p>
      )}
      {item.effectName && (
        <p className="item-edit__hint">Nombre del efecto: {item.effectName}</p>
      )}
      {item.passiveBonus && (
        <p className="item-edit__hint">
          Pasiva ({triggerLabel(item.passiveBonus.trigger)}): {item.passiveBonus.amount > 0 ? '+' : ''}{formatStat(item.passiveBonus.amount)} {statTitle(item.passiveBonus.stat)}
          {typeof item.passiveBonus.maxStacks === 'number' ? ` · hasta ${item.passiveBonus.maxStacks} stacks` : ''}
          {typeof item.passiveBonus.durationTurns === 'number' ? ` · ${item.passiveBonus.durationTurns} turno${item.passiveBonus.durationTurns === 1 ? '' : 's'}` : ''}
        </p>
      )}
      {item.namedEffects && item.namedEffects.length > 0 && (
        <ul className="item-effects-list">
          {item.namedEffects.map(id => {
            const effect = findNamedEffect(id);
            const text = describeNamedEffect(effectDescriptions, id);
            return (
              <li key={id}>
                <strong>{namedEffectName(id)}</strong>
                {effect && <span className="item-effects-list__meta"> · {NAMED_EFFECT_KIND_LABEL[effect.kind]}{effect.exclusive ? ' · ★ único en la build' : ''}</span>}
                {namedEffectOnHit(effectDescriptions, id) && <span className="item-effect-badge">Efecto de impacto</span>}
                {text && <p className="item-effects-list__text">{text}</p>}
                {(() => {
                  const lines = configSummary(namedEffectBonus(effectDescriptions, id));
                  return lines.length ? <ul className="bonus-summary">{lines.map((line, i) => <li key={i}>{line}</li>)}</ul> : null;
                })()}
                <AreaGridView area={namedEffectArea(effectDescriptions, id)} cellPx={9} />
              </li>
            );
          })}
        </ul>
      )}
      {item.passiveDamage && (
        <p className="item-edit__hint">
          Daño de pasiva ({triggerLabel(item.passiveDamage.trigger)}): {formatStat(item.passiveDamage.currentHpPct)}% de la vida actual del objetivo
        </p>
      )}

      <div className="modal-rule">
        <span className="modal-rule__ornament">⚜</span>
      </div>

      {item.imagen && (
        <div className="modal-img-wrap">
          <img src={item.imagen} alt={item.nombre} className="modal-img" />
        </div>
      )}

      <div className="modal-effects">
        {effects.map(({ key, label }) => (
          <div key={key} className="modal-effect">
            <span className="modal-effect__tag">{label}</span>
            <p className="modal-effect__text">{item.efecto[key]}</p>
          </div>
        ))}
        {effects.length === 0 && <p className="modal-no-effect">— Sin efectos registrados —</p>}
      </div>

      <ul className="modal-stats">
        {getVisibleStats(item.stats).map(([stat, value]) => (
          <li key={stat} className="modal-stat">
            <span className="modal-stat__key">{stat}</span>
            <span className="modal-stat__val">{formatStatValue(value)}</span>
          </li>
        ))}
        {typeof item.coste === 'number' && (
          <li className="modal-stat">
            <span className="modal-stat__key">Coste</span>
            <span className="modal-stat__val">{item.coste.toLocaleString('es-ES')}</span>
          </li>
        )}
      </ul>

      {canEdit && (
        <div className="item-edit__actions">
          <button type="button" className="item-edit__btn" onClick={onEdit}>Editar</button>
        </div>
      )}
    </>
  );
};

type FormProps = {
  item: Item;
  draft: ItemDraft;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<ItemDraft>) => void;
  onStatChange: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

const ItemForm = ({ item, draft, saving, error, onChange, onStatChange, onSave, onCancel }: FormProps) => {
  const rarities = RARITIES.includes(draft.rareza) || !draft.rareza ? RARITIES : [draft.rareza, ...RARITIES];

  return (
    <div className="item-edit">
      <h2 className="modal-title">{item.nombre}</h2>
      <p className="item-edit__hint">
        El nombre no se edita: los jugadores, las builds y las recetas guardan el ítem por su nombre.
      </p>

      <label className="item-field">
        <span>Rareza</span>
        <select value={draft.rareza} disabled={saving} onChange={e => onChange({ rareza: e.target.value })}>
          {rarities.map(rarity => (
            <option key={rarity} value={rarity}>{rarity}</option>
          ))}
        </select>
      </label>

      <label className="item-field">
        <span>Pasiva</span>
        <textarea
          rows={3}
          value={draft.pasiva}
          placeholder="Sin pasiva"
          disabled={saving}
          onChange={e => onChange({ pasiva: e.target.value })}
        />
      </label>

      <label className="item-field">
        <span>Activa</span>
        <textarea
          rows={3}
          value={draft.activa}
          placeholder="Sin activa"
          disabled={saving}
          onChange={e => onChange({ activa: e.target.value })}
        />
      </label>

      <label className="item-field">
        <span>Coste</span>
        <input
          inputMode="numeric"
          value={draft.coste}
          placeholder="Sin precio de tienda"
          disabled={saving}
          onChange={e => onChange({ coste: e.target.value })}
        />
      </label>

      <div className="item-field">
        <span>Stacks</span>
        <button
          type="button"
          className={cx('item-edit__btn', draft.hasStacks && 'item-edit__btn--on')}
          aria-pressed={draft.hasStacks}
          disabled={saving}
          onClick={() => onChange({ hasStacks: !draft.hasStacks })}
        >
          {draft.hasStacks ? 'Con acumulaciones' : 'Sin acumulaciones'}
        </button>
      </div>
      {draft.hasStacks && (
        <label className="item-field">
          <span>Máx. stacks (opcional)</span>
          <input
            inputMode="numeric"
            value={draft.maxStacks}
            placeholder="Sin tope"
            disabled={saving}
            onChange={e => onChange({ maxStacks: e.target.value })}
          />
        </label>
      )}

      <label className="item-field">
        <span>Cooldown (turnos)</span>
        <input
          inputMode="numeric"
          value={draft.cooldown}
          placeholder="Sin cooldown"
          disabled={saving}
          onChange={e => onChange({ cooldown: e.target.value })}
        />
      </label>

      <label className="item-field">
        <span>Efecto (turnos)</span>
        <input
          inputMode="numeric"
          value={draft.effectDuration}
          placeholder="Sin duración"
          disabled={saving}
          onChange={e => onChange({ effectDuration: e.target.value })}
        />
      </label>

      <label className="item-field">
        <span>Objetivo del efecto</span>
        <select
          value={draft.effectTarget}
          disabled={saving}
          onChange={e => onChange({ effectTarget: e.target.value === 'enemy' ? 'enemy' : 'self' })}
        >
          <option value="self">Propio</option>
          <option value="enemy">Enemigo</option>
        </select>
      </label>

      <label className="item-field">
        <span>Nombre del efecto (opcional)</span>
        <input
          value={draft.effectName}
          placeholder="El del ítem"
          disabled={saving}
          onChange={e => onChange({ effectName: e.target.value })}
        />
      </label>

      <div className="item-edit__block">
        <span className="modal-effect__tag">Pasiva en combate</span>
        <p className="item-edit__hint">Bonus temporal que se suma / acumula al saltar (p. ej. +0,3 letalidad por golpe) y daño % de la vida actual del objetivo. Vacío = sin pasiva.</p>
        <div className="item-field">
          <span>Efectos con nombre (Vigor, Salvavidas…)</span>
          {draft.namedEffects.length > 0 && (
            <div className="item-named-effects">
              {draft.namedEffects.map(id => (
                <span key={id} className="item-named-effect" title={namedEffectDescription(id)}>
                  {namedEffectName(id)}{findNamedEffect(id)?.exclusive ? ' ★' : ''}
                  <button type="button" disabled={saving} aria-label={`Quitar ${namedEffectName(id)}`} onClick={() => onChange({ namedEffects: draft.namedEffects.filter(entry => entry !== id) })}>✕</button>
                </span>
              ))}
            </div>
          )}
          <select
            value=""
            disabled={saving || draft.namedEffects.length >= 10}
            onChange={e => { if (e.target.value) onChange({ namedEffects: [...draft.namedEffects, e.target.value] }); }}
          >
            <option value="">Añadir efecto…</option>
            {groupNamedEffects(NAMED_EFFECTS.filter(effect => !draft.namedEffects.some(id => baseNamedEffectId(id) === effect.id))).map(group => (
              <optgroup key={group.key} label={group.label}>
                {group.effects.flatMap(effect => namedEffectOptions(effect).map(option => (
                  <option key={option.id} value={option.id}>{option.name}{effect.name !== effect.en ? ` (${effect.en})` : ''}{effect.exclusive ? ' ★' : ''}</option>
                )))}
              </optgroup>
            ))}
          </select>
        </div>
        <label className="item-field">
          <span>Bonus: cuándo</span>
          <select value={draft.passiveTrigger} disabled={saving} onChange={e => onChange({ passiveTrigger: e.target.value as ItemDraft['passiveTrigger'] })}>
            <option value="">Sin bonus</option>
            {PASSIVE_TRIGGERS.map(trigger => <option key={trigger.id} value={trigger.id}>{trigger.label}</option>)}
          </select>
        </label>
        {draft.passiveTrigger && (
          <>
            <label className="item-field">
              <span>Bonus: stat</span>
              <select value={draft.passiveStat} disabled={saving} onChange={e => onChange({ passiveStat: e.target.value })}>
                {STAT_COLUMNS.map(column => <option key={column.key} value={column.key}>{column.title}</option>)}
              </select>
            </label>
            <label className="item-field">
              <span>Bonus: cantidad (por stack)</span>
              <input inputMode="decimal" value={draft.passiveAmount} placeholder="0,3" disabled={saving} onChange={e => onChange({ passiveAmount: e.target.value })} />
            </label>
            <label className="item-field">
              <span>Bonus: stacks máx. (opcional)</span>
              <input inputMode="numeric" value={draft.passiveMaxStacks} placeholder="Sin acumular" disabled={saving} onChange={e => onChange({ passiveMaxStacks: e.target.value })} />
            </label>
            <label className="item-field">
              <span>Bonus: turnos (opcional)</span>
              <input inputMode="numeric" value={draft.passiveTurns} placeholder="Hasta quitarlo" disabled={saving} onChange={e => onChange({ passiveTurns: e.target.value })} />
            </label>
          </>
        )}
        <label className="item-field">
          <span>Daño de pasiva: cuándo</span>
          <select value={draft.damageTrigger} disabled={saving} onChange={e => onChange({ damageTrigger: e.target.value as ItemDraft['damageTrigger'] })}>
            <option value="">Sin daño</option>
            {PASSIVE_TRIGGERS.map(trigger => <option key={trigger.id} value={trigger.id}>{trigger.label}</option>)}
          </select>
        </label>
        {draft.damageTrigger && (
          <label className="item-field">
            <span>Daño: % vida actual del objetivo</span>
            <input inputMode="decimal" value={draft.damagePct} placeholder="9" disabled={saving} onChange={e => onChange({ damagePct: e.target.value })} />
          </label>
        )}
      </div>

      <div className="item-edit__block">
        <span className="modal-effect__tag">Estadísticas</span>
        <p className="item-edit__hint">Vacío es 0. AD y AP admiten dados, como 1d4.</p>
        <div className="item-edit__stats">
          {Object.entries(draft.stats).map(([key, value]) => (
            <label key={key} className="item-field">
              <span>{key}</span>
              <input
                value={value}
                placeholder="0"
                disabled={saving}
                onChange={e => onStatChange(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      {error && <p className="item-edit__error">{error}</p>}

      <div className="item-edit__actions">
        <button type="button" className="item-edit__btn" onClick={onSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="item-edit__btn item-edit__btn--ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
  );
};

const ItemDetailModal = ({ item, onClose, onSaved, readOnly = false }: Props) => {
  const hasEditAccess = useCanEdit();
  const canEdit = hasEditAccess && !readOnly;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ItemDraft>(() => itemToDraft(item));
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
    setDraft(itemToDraft(item));
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    if (saving) return;
    let update: ItemUpdate;
    try {
      update = draftToItemUpdate(draft, item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo leer el formulario');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await saveItemUpdate(item.nombre, update);
      onSaved?.(saved);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={requestClose} backdropClassName="modal-backdrop" className="modal-scroll">
      <div className="modal-scroll__cap modal-scroll__cap--top">
        <div className="modal-scroll__rod" />
      </div>

      <div className="modal-scroll__body" role="dialog" aria-modal="true" aria-label={`Información de ${item.nombre}`}>
        {editing ? (
          <ItemForm
            item={item}
            draft={draft}
            saving={saving}
            error={error}
            onChange={patch => setDraft(current => ({ ...current, ...patch }))}
            onStatChange={(key, value) => setDraft(current => ({
              ...current,
              stats: { ...current.stats, [key]: value },
            }))}
            onSave={() => { void save(); }}
            onCancel={cancelEditing}
          />
        ) : (
          <ItemView item={item} onEdit={startEditing} canEdit={canEdit} />
        )}
        {!editing && (
          <button type="button" className="item-edit__btn item-edit__btn--ghost" onClick={requestClose} autoFocus>
            Cerrar
          </button>
        )}
      </div>

      <div className="modal-scroll__cap modal-scroll__cap--bottom">
        <div className="modal-scroll__rod" />
      </div>
    </Modal>
  );
};

export default ItemDetailModal;
