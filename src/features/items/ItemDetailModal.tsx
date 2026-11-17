import { Fragment, useCallback, useState } from 'react';
import { lolDiceNote, lolToDice } from '../../data/lolDiceTable';
import Modal from '../../components/Modal';
import { saveItemUpdate, type Item, type ItemUpdate } from '../../data/items';
import { cx } from '../../lib/cx';
import { draftToItemUpdate, itemToDraft, lolDiceStatOf, lolStatDice, type ItemDraft } from './itemDraft';
import ItemStock from './ItemStock';
import { RARITIES, rarityClass } from './rarity';
import { useCanEdit } from '../../data/appRoleContext';
import { describeNamedEffect, namedEffectArea, namedEffectBonus, namedEffectOnHit, useNamedEffectDescriptions } from '../../data/namedEffectDescriptions';
import { configSummary } from '../../data/effectBonus';
import { AreaGridView } from '../../components/AreaGrid';
import { formatStatValue, getVisibleStats } from './stats';

import { NAMED_EFFECTS, NAMED_EFFECT_KIND_LABEL, baseNamedEffectId, findNamedEffect, groupNamedEffects, namedEffectDescription, namedEffectName, namedEffectOptions } from '../../data/namedEffects';

type Props = {
  item: Item;
  onClose: () => void;
  onSaved?: (item: Item) => void;
  readOnly?: boolean;
};

const ItemView = ({ item, onEdit, canEdit }: { item: Item; onEdit: () => void; canEdit: boolean }) => {
  const rarity = rarityClass(item.rareza);
  const effectDescriptions = useNamedEffectDescriptions();

  return (
    <>
      <div className={cx('modal-rarity', rarity)}>{item.rareza}</div>

      <h2 className="modal-title">{item.nombre}</h2>

      <ItemStock item={item} className={cx('item-stock--modal', rarity)} />
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

      <div className="modal-rule">
        <span className="modal-rule__ornament">⚜</span>
      </div>

      {item.imagen && (
        <div className="modal-img-wrap">
          <img src={item.imagen} alt={item.nombre} className="modal-img" />
        </div>
      )}

      <div className="modal-effects">
        {item.description && (
          <div className="modal-effect">
            <span className="modal-effect__tag">{'Descripci\u00f3n'}</span>
            <p className="modal-effect__text">{item.description}</p>
          </div>
        )}
        {!item.description && !item.namedEffects?.length && <p className="modal-no-effect">- Sin efectos registrados -</p>}
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
  /** AD / AP del LoL: guarda el numero y rellena los dados de la stat (key). */
  onLolChange: (lol: 'AD' | 'AP', key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

const ItemForm = ({ item, draft, saving, error, onChange, onStatChange, onLolChange, onSave, onCancel }: FormProps) => {
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
        <span>{'Descripci\u00f3n'}</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={draft.description}
          placeholder={'Descripci\u00f3n del \u00edtem (opcional)'}
          disabled={saving}
          onChange={e => onChange({ description: e.target.value })}
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

      <div className="item-edit__block">
        <span className="modal-effect__tag">Efectos con nombre</span>
        <p className="item-edit__hint">{'Bonus, CD, duraci\u00f3n, cargas y \u00e1rea se configuran en la pantalla Efectos.'}</p>
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
      </div>

      <div className="item-edit__block">
        <span className="modal-effect__tag">Estadísticas</span>
        <p className="item-edit__hint">Vacío es 0. AD y AP admiten dados, como 1d4.</p>
        <p className="item-edit__hint">{'AD / AP del LoL: escribe el n\u00famero que da el LoL y los dados se rellenan con tu tabla (fuera del editor solo se ven los dados).'}</p>
        <div className="item-edit__stats">
          {Object.entries(draft.stats).map(([key, value]) => {
            const lolStat = lolDiceStatOf(key);
            const lolKey: 'AD' | 'AP' = lolStat === 'ap' ? 'AP' : 'AD';
            const lolText = lolStat ? draft.lol[lolKey] ?? '' : '';
            const lolNumber = Number(lolText.trim().replace(',', '.'));
            const converted = lolStat && lolText.trim() && Number.isFinite(lolNumber) ? lolToDice(lolStat, lolNumber) : null;
            return (
              <Fragment key={key}>
                <label className="item-field">
                  <span>{key}</span>
                  <input
                    value={value}
                    placeholder="0"
                    disabled={saving}
                    onChange={e => onStatChange(key, e.target.value)}
                  />
                </label>
                {lolStat && (
                  <label className="item-field item-field--lol">
                    <span>{`${lolKey} del LoL`}</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={lolText}
                      placeholder={'p. ej. 40'}
                      disabled={saving}
                      onChange={e => onLolChange(lolKey, key, e.target.value)}
                    />
                    <small className="item-field__lol-note">{converted ? `= ${lolDiceNote(converted)}` : 'Rellena los dados con la tabla'}</small>
                  </label>
                )}
              </Fragment>
            );
          })}
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
            onStatChange={(key, value) => setDraft(current => {
              // Dados escritos a mano: ya no salen del valor del LoL.
              const stat = lolDiceStatOf(key);
              const lol = { ...current.lol };
              if (stat) delete lol[stat === 'ap' ? 'AP' : 'AD'];
              return { ...current, stats: { ...current.stats, [key]: value }, lol };
            })}
            onLolChange={(lolKey, key, value) => setDraft(current => ({
              ...current,
              lol: { ...current.lol, [lolKey]: value },
              stats: { ...current.stats, [key]: lolStatDice(key, value) },
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
