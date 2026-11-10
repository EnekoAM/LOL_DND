import Modal from '../../components/Modal';
import ThumbImg from '../../components/ThumbImg';
import { findItem, type Item } from '../../data/items';
import { cx } from '../../lib/cx';
import { formatStatValue, getVisibleStats } from '../items/stats';
import { rarityClass } from '../items/rarity';

type Props = {
  currentName: string;
  candidateName: string;
  busy: boolean;
  onAccept: () => void;
  onBack: () => void;
};

const EFFECTS = [
  { key: 'pasiva', label: 'Pasiva' },
  { key: 'activa', label: 'Activa' },
] as const;

const isEffectDefined = (text: string | undefined): boolean =>
  !!text && text.trim() !== '' && text.trim() !== '-';

const Column = ({ item, label, empty }: { item: Item | undefined; label: string; empty: string }) => {
  if (!item) {
    return (
      <div className="item-compare__col">
        <div className="item-compare__col-label">{label}</div>
        <p className="item-compare__empty">{empty}</p>
      </div>
    );
  }
  const rarity = rarityClass(item.rareza);
  const effects = EFFECTS.filter(({ key }) => isEffectDefined(item.efecto?.[key]));
  const stats = getVisibleStats(item.stats);

  return (
    <div className="item-compare__col">
      <div className="item-compare__col-label">{label}</div>
      <div className={cx('item-compare__rarity', rarity)}>{item.rareza}</div>
      {item.imagen
        ? <ThumbImg className="item-compare__img" src={item.imagen} thumbWidth={128} alt={item.nombre} />
        : <div className="item-compare__img item-compare__img--empty">✦</div>}
      <h3 className="item-compare__name">{item.nombre}</h3>
      <ul className="item-compare__stats">
        {stats.map(([stat, value]) => (
          <li key={stat}>
            <span>{stat}</span>
            <strong>{formatStatValue(value)}</strong>
          </li>
        ))}
        {stats.length === 0 && <li className="item-compare__muted">Sin stats</li>}
        {typeof item.coste === 'number' && (
          <li>
            <span>Coste</span>
            <strong>{item.coste.toLocaleString('es-ES')}</strong>
          </li>
        )}
      </ul>
      <div className="item-compare__effects">
        {effects.map(({ key, label: effectLabel }) => (
          <div key={key} className="item-compare__effect">
            <span>{effectLabel}</span>
            <p>{item.efecto[key]}</p>
          </div>
        ))}
        {effects.length === 0 && <p className="item-compare__muted">Sin efectos</p>}
      </div>
    </div>
  );
};

/** Comparación lado a lado del ítem equipado y el candidato (lupa del picker). */
const ItemCompareModal = ({ currentName, candidateName, busy, onAccept, onBack }: Props) => {
  const current = findItem(currentName);
  const candidate = findItem(candidateName);

  return (
    <Modal onClose={onBack} backdropClassName="calc-modal-backdrop" className="calc-modal calc-modal--compare">
      <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>
      <div className="calc-modal__body item-compare" role="dialog" aria-modal="true" aria-label="Comparar ítems">
        <div className="calc-modal__title">Comparar ítems</div>
        <div className="item-compare__grid">
          <Column item={current} label="Equipado" empty={currentName || 'Hueco vacío'} />
          <div className="item-compare__vs" aria-hidden="true">⇄</div>
          <Column item={candidate} label="Candidato" empty={candidateName} />
        </div>
        <div className="item-compare__actions">
          <button type="button" className="item-compare__btn" onClick={onBack} disabled={busy}>
            Volver
          </button>
          <button type="button" className="item-compare__btn item-compare__btn--primary" onClick={onAccept} disabled={busy || !candidate}>
            Aceptar cambio
          </button>
        </div>
      </div>
      <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>
    </Modal>
  );
};

export default ItemCompareModal;
