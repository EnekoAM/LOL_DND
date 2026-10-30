import { useCallback, useState } from 'react';
import Modal from '../../components/Modal';
import { saveItemUpdate, type Item, type ItemUpdate } from '../../data/items';
import { cx } from '../../lib/cx';
import { draftToItemUpdate, itemToDraft, type ItemDraft } from './itemDraft';
import ItemStock from './ItemStock';
import { RARITIES, rarityClass } from './rarity';
import { useCanEdit } from '../../data/appRoleContext';
import { formatStatValue, getVisibleStats } from './stats';

type Props = {
  item: Item;
  onClose: () => void;
  onSaved?: (item: Item) => void;
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

  return (
    <>
      <div className={cx('modal-rarity', rarity)}>{item.rareza}</div>

      <h2 className="modal-title">{item.nombre}</h2>

      <ItemStock item={item} className={cx('item-stock--modal', rarity)} />

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

const ItemDetailModal = ({ item, onClose, onSaved }: Props) => {
  const canEdit = useCanEdit();
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

      <div className="modal-scroll__body">
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
      </div>

      <div className="modal-scroll__cap modal-scroll__cap--bottom">
        <div className="modal-scroll__rod" />
      </div>
    </Modal>
  );
};

export default ItemDetailModal;
