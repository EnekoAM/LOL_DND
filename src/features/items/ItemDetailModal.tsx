import { Fragment, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { formatStatValue } from './stats';
import { HASTE_KEY, HASTE_BASIC_KEY, HASTE_ULT_KEY, itemStatRows } from '../../data/abilityHaste';

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
        {itemStatRows(item.stats).map(({ key: stat, label, value, title }) => (
          <li key={stat} className="modal-stat" title={title}>
            <span className="modal-stat__key">{label}</span>
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

/** Modal (encima del editor del item) para la velocidad de habilidades solo b\u00e1sicas / solo definitiva. */
const HASTE_INPUT_STYLE = { background: '#0f0c06', color: '#fff', border: '1px solid #c9a227', borderRadius: 6, padding: '6px 8px', fontSize: 15, minWidth: 0 } as const;
const HasteModal = ({ basic, ult, saving, onBasic, onUlt, onClose }: {
  basic: string; ult: string; saving: boolean; onBasic: (value: string) => void; onUlt: (value: string) => void; onClose: () => void;
}) => {
  useEffect(() => {
    // Captura en window: Esc cierra solo este modal, no el del item (que escucha Esc en window al burbujear).
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div
      role="presentation"
      onClick={e => { e.stopPropagation(); onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(0, 0, 0, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="haste-modal-title"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(360px, 100%)', boxSizing: 'border-box', background: '#17130b', color: '#fff3c4', border: '2px solid #f2c94c', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)' }}
      >
        <h3 id="haste-modal-title" style={{ margin: 0, color: '#ffe08a', fontSize: 18 }}>{'Velocidad de habilidades'}</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>{'B\u00e1sicas (Q/W/E)'}</span>
          <input autoFocus inputMode="decimal" value={basic} placeholder="0" disabled={saving} style={HASTE_INPUT_STYLE} onChange={e => onBasic(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>{'Definitiva (R)'}</span>
          <input inputMode="decimal" value={ult} placeholder="0" disabled={saving} style={HASTE_INPUT_STYLE} onChange={e => onUlt(e.target.value)} />
        </label>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, whiteSpace: 'normal', overflowWrap: 'anywhere', color: '#e8dcb0' }}>{'Se suman a la global (Ab haste) solo en esas habilidades. Vac\u00edo = sin valor.'}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '6px 14px', fontWeight: 700, color: '#1b160c', background: '#f2c94c', border: '1px solid #ffe08a', borderRadius: 8, cursor: 'pointer' }}>{'Cerrar'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const ItemForm = ({ item, draft, saving, error, onChange, onStatChange, onLolChange, onSave, onCancel }: FormProps) => {
  // Velocidad de habilidades: «Ab haste» es la global; el engranaje abre la de solo b\u00e1sicas (Q/W/E) / solo definitiva (R).
  const hasteScopedCount = [HASTE_BASIC_KEY, HASTE_ULT_KEY].filter(key => { const text = (draft.stats[key] ?? '').trim(); return !!text && Number(text.replace(',', '.')) !== 0; }).length;
  const [hasteOpen, setHasteOpen] = useState(false);
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
        <p className="item-edit__hint">{'AD / AP del LoL: escribe el n\u00famero que da el LoL y los dados se rellenan solos: 1d6 cada 15 AD / 20 AP, y lo que sobra +1d2 o +1d4 (fuera del editor solo se ven los dados).'}</p>
        <div className="item-edit__stats">
          {Object.entries(draft.stats).map(([key, value]) => {
            const hasHaste = HASTE_KEY in draft.stats;
            if (hasHaste && (key === HASTE_BASIC_KEY || key === HASTE_ULT_KEY)) return null;
            if (hasHaste && key === HASTE_KEY) {
              const gearTitle = 'Ajustes de velocidad de habilidades';
              return (
                <Fragment key={key}>
                  <div className="item-field item-field--haste">
                    <span>{'Ab haste (global: Q/W/E y R)'}</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        value={value}
                        placeholder="0"
                        disabled={saving}
                        aria-label={'Ab haste global'}
                        style={{ minWidth: 0, flex: '1 1 4em' }}
                        onChange={e => onStatChange(key, e.target.value)}
                      />
                      <button
                        type="button"
                        title={gearTitle}
                        aria-label={gearTitle}
                        aria-expanded={hasteOpen}
                        onClick={() => setHasteOpen(open => !open)}
                        style={{ position: 'relative', flex: '0 0 auto', padding: '2px 8px', fontSize: 16, lineHeight: 1.2, cursor: 'pointer', color: '#ffe08a', background: hasteOpen ? '#3a2e12' : '#1b160c', border: '1px solid #f2c94c', borderRadius: 6 }}
                      >
                        {'\u2699'}
                        {hasteScopedCount > 0 && (
                          <span aria-hidden="true" style={{ position: 'absolute', top: -7, right: -7, minWidth: 15, padding: '0 3px', borderRadius: 999, background: '#f87171', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '15px', textAlign: 'center' }}>{hasteScopedCount}</span>
                        )}
                      </button>
                    </span>
                  </div>
                  {hasteOpen && (
                    <HasteModal
                      basic={draft.stats[HASTE_BASIC_KEY] ?? ''}
                      ult={draft.stats[HASTE_ULT_KEY] ?? ''}
                      saving={saving}
                      onBasic={next => onStatChange(HASTE_BASIC_KEY, next)}
                      onUlt={next => onStatChange(HASTE_ULT_KEY, next)}
                      onClose={() => setHasteOpen(false)}
                    />
                  )}
                </Fragment>
              );
            }
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
                    <small className="item-field__lol-note">{converted ? `= ${lolDiceNote(converted)}` : 'Rellena los dados (1d6 cada 15 AD / 20 AP)'}</small>
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
