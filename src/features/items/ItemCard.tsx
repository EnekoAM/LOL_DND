import type { Item } from '../../data/items';
import { cx } from '../../lib/cx';
import ItemStock from './ItemStock';
import { rarityClass } from './rarity';
import { formatStatValue, getVisibleStats } from './stats';
import { itemAvailability } from './stock';

type Props = {
  item: Item;
  onSelect: (item: Item) => void;
};

const ItemCard = ({ item, onSelect }: Props) => {
  const owned = itemAvailability(item).owned > 0;
  const rarity = rarityClass(item.rareza);

  return (
    <div className={cx('item-card', rarity, !owned && 'item-card--empty')} onClick={() => onSelect(item)}>
      <div className={cx('item-card__rarity', rarity)}>{item.rareza}</div>

      <div className="item-card__img-wrap">
        {item.imagen
          ? <img src={item.imagen} alt={item.nombre} className="item-card__img" />
          : <span className="item-card__no-img">—</span>
        }
      </div>

      <div className="item-card__name">{item.nombre}</div>

      <ul className="item-card__stats">
        {getVisibleStats(item.stats).map(([stat, value]) => (
          <li key={stat} className="item-card__stat">
            <span className="item-card__stat-key">{stat}</span>
            <span className="item-card__stat-val">{formatStatValue(value)}</span>
          </li>
        ))}
      </ul>

      <ItemStock item={item} />
    </div>
  );
};

export default ItemCard;
