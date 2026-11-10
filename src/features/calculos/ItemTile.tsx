import ThumbImg from '../../components/ThumbImg';
import type { Item } from '../../data/items';
import { cx } from '../../lib/cx';

export type ItemTileState = 'equipped' | 'owned' | 'none';

type Props = {
  name: string;
  item: Item | undefined;
  state?: ItemTileState;
  onRemove?: () => void;
  onChange?: () => void;
  onInspect?: () => void;
  /** Añade este ítem al equipamiento (build deseada). */
  onEquip?: () => void;
  equipDisabled?: boolean;
  equipTitle?: string;
  removeDisabled?: boolean;
};

const ItemTile = ({ name, item, state, onRemove, onChange, onInspect, onEquip, equipDisabled, equipTitle, removeDisabled }: Props) => (
  <div className={cx('calc-item-card', state && `calc-item-card--${state}`)}>
    {item?.imagen
      ? <ThumbImg className="calc-item-card__img" src={item.imagen} thumbWidth={128} alt={name} />
      : <div className="calc-item-card__no-img">✦</div>
    }
    <div className="calc-item-card__name" title={name}>{name}</div>

    {state === 'equipped' && <div className="calc-item-card__badge calc-item-card__badge--check">✓</div>}
    {state === 'owned' && <div className="calc-item-card__badge">🎒</div>}

    {onInspect && item && (
      <button
        type="button"
        className="calc-item-card__inspect"
        aria-label={`Ver información de ${name}`}
        title={`Ver información de ${name}`}
        aria-haspopup="dialog"
        onClick={onInspect}
      />
    )}

    {onChange && (
      <button
        type="button"
        className="calc-item-card__remove"
        aria-label={`Cambiar ítem ${name}`}
        title="Cambiar ítem (incluye la opción Quitar)"
        aria-haspopup="dialog"
        disabled={removeDisabled}
        onClick={onChange}
      >
        ⇄
      </button>
    )}
    {!onChange && onRemove && (
      <button
        type="button"
        className="calc-item-card__remove"
        aria-label={`Quitar ${name}`}
        disabled={removeDisabled}
        onClick={onRemove}
      >
        ×
      </button>
    )}
    {onEquip && (
      <button
        type="button"
        className="calc-item-card__equip"
        aria-label={equipTitle ?? `Añadir ${name} al equipamiento`}
        title={equipTitle ?? `Añadir ${name} al equipamiento`}
        disabled={removeDisabled || equipDisabled}
        onClick={onEquip}
      >
        Equipar
      </button>
    )}
  </div>
);

export default ItemTile;
