import type { Item } from '../../data/items';
import { cx } from '../../lib/cx';

export type ItemTileState = 'equipped' | 'owned' | 'none';

type Props = {
  name: string;
  item: Item | undefined;
  state?: ItemTileState;
  onSelect: (item: Item) => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
};

const ItemTile = ({ name, item, state, onSelect, onRemove, removeDisabled }: Props) => (
  <div className={cx('calc-item-card', state && `calc-item-card--${state}`)} onClick={() => item && onSelect(item)}>
    {item?.imagen
      ? <img className="calc-item-card__img" src={item.imagen} alt={name} />
      : <div className="calc-item-card__no-img">✦</div>
    }
    <div className="calc-item-card__name" title={name}>{name}</div>

    {state === 'equipped' && <div className="calc-item-card__badge calc-item-card__badge--check">✓</div>}
    {state === 'owned' && <div className="calc-item-card__badge">🎒</div>}

    {onRemove && (
      <button
        type="button"
        className="calc-item-card__remove"
        aria-label={`Quitar ${name}`}
        disabled={removeDisabled}
        onClick={event => {
          event.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
    )}
  </div>
);

export default ItemTile;
