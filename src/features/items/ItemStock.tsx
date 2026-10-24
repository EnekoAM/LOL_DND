import type { Item } from '../../data/items';
import { cx } from '../../lib/cx';
import { itemAvailability } from './stock';

type Props = {
  item: Item;
  className?: string;
};

const ItemStock = ({ item, className }: Props) => {
  const { owned, available } = itemAvailability(item);

  if (owned <= 0) {
    return <div className={cx('item-stock', 'item-stock--empty', className)}>✗ Sin stock</div>;
  }

  return (
    <div className={cx('item-stock', className)}>
      <div className="item-stock__row item-stock__row--owned">
        <span>Tienen</span>
        <span>×{owned}</span>
      </div>
      <div className={cx('item-stock__row', available > 0 ? 'item-stock__row--free' : 'item-stock__row--none')}>
        <span>Disponible</span>
        <span>×{available}</span>
      </div>
    </div>
  );
};

export default ItemStock;
