import Modal from '../../components/Modal';
import type { Item } from '../../data/items';
import { cx } from '../../lib/cx';
import ItemStock from './ItemStock';
import { rarityClass } from './rarity';
import { formatStatValue, getVisibleStats } from './stats';

type Props = {
  item: Item;
  onClose: () => void;
};

const EFFECTS = [
  { key: 'pasiva', label: 'Pasiva' },
  { key: 'activa', label: 'Activa' },
] as const;

/** El TSV marca con "-" los ítems sin ese efecto. */
const isEffectDefined = (text: string): boolean => text.trim() !== '' && text.trim() !== '-';

const ItemDetailModal = ({ item, onClose }: Props) => {
  const effects = EFFECTS.filter(({ key }) => isEffectDefined(item.efecto[key]));
  const rarity = rarityClass(item.rareza);

  return (
    <Modal onClose={onClose} backdropClassName="modal-backdrop" className="modal-scroll">
      <div className="modal-scroll__cap modal-scroll__cap--top">
        <div className="modal-scroll__rod" />
      </div>

      <div className="modal-scroll__body">
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
        </ul>
      </div>

      <div className="modal-scroll__cap modal-scroll__cap--bottom">
        <div className="modal-scroll__rod" />
      </div>
    </Modal>
  );
};

export default ItemDetailModal;
