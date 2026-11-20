import { memo } from 'react';
import ThumbImg from '../../components/ThumbImg';
import type { Item } from '../../data/items';
import { cx } from '../../lib/cx';
import ItemStock from './ItemStock';
import { rarityClass } from './rarity';
import { formatStatValue } from './stats';
import { itemStatRows } from '../../data/abilityHaste';
import { itemAvailability } from './stock';

type Props = {
  item: Item;
  onSelect: (item: Item) => void;
  /**
   * Cambia cuando el stock o la definición se actualizan en memoria (los ítems se mutan en sitio),
   * para que el memo no deje la tarjeta desfasada.
   */
  version?: string;
};

const ItemCard = ({ item, onSelect }: Props) => {
  const owned = itemAvailability(item).owned > 0;
  const rarity = rarityClass(item.rareza);

  return (
    <div className={cx('item-card', rarity, !owned && 'item-card--empty')} onClick={() => onSelect(item)}>
      <div className={cx('item-card__rarity', rarity)}>{item.rareza}</div>

      <div className="item-card__img-wrap">
        {item.imagen
          ? <ThumbImg src={item.imagen} thumbWidth={128} alt={item.nombre} className="item-card__img" />
          : <span className="item-card__no-img">—</span>
        }
      </div>

      <div className="item-card__name">{item.nombre}</div>

      <ul className="item-card__stats">
        {itemStatRows(item.stats).map(({ key: stat, label, value, title }) => (
          <li key={stat} className="item-card__stat" title={title}>
            <span className="item-card__stat-key">{label}</span>
            <span className="item-card__stat-val">{formatStatValue(value)}</span>
          </li>
        ))}
      </ul>

      <ItemStock item={item} />
    </div>
  );
};

export default memo(ItemCard);
