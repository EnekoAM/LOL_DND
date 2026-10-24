import Modal from '../../components/Modal';
import { findItems, type Item } from '../../data/items';

type Props = {
  item: Item;
  onSelect: (item: Item) => void;
  onClose: () => void;
};

type CraftSectionProps = {
  label: string;
  items: Item[];
  onSelect: (item: Item) => void;
};

const CraftSection = ({ label, items, onSelect }: CraftSectionProps) => {
  if (items.length === 0) return null;

  return (
    <div className="calc-craft-section">
      <div className="calc-craft-label">{label}</div>
      <div className="calc-craft-items">
        {/* Las recetas pueden repetir ingrediente, así que el nombre no basta como key. */}
        {items.map((item, index) => (
          <div key={`${item.nombre}-${index}`} className="calc-craft-item" onClick={() => onSelect(item)}>
            <img src={item.imagen} alt={item.nombre} />
            <div className="calc-craft-item__name">{item.nombre}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CraftModal = ({ item, onSelect, onClose }: Props) => (
  <Modal onClose={onClose} backdropClassName="calc-modal-backdrop" className="calc-modal">
    <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>

    <div className="calc-modal__body">
      <div className="calc-modal__title">{item.nombre}</div>

      <img className="calc-modal__img" src={item.imagen} alt={item.nombre} />

      <div className="calc-modal__rule">
        <span className="calc-modal__rule-ornament">✦</span>
      </div>

      <CraftSection label="Se craftea desde" items={findItems(item.craftsFrom)} onSelect={onSelect} />
      <CraftSection label="Se craftea en" items={findItems(item.craftsTo)} onSelect={onSelect} />

      <button className="calc-modal__close" onClick={onClose}>
        Cerrar
      </button>
    </div>

    <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>
  </Modal>
);

export default CraftModal;
