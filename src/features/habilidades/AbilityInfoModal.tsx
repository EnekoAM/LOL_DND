import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import type { Ability } from '../../data/champions';
import type { ResourceId } from '../../data/resources';
import { AbilityView } from './AbilityModal';

type Props = {
  ability: Ability;
  /** «Q · Nombre del personaje». */
  kicker: string;
  image?: string;
  rank?: number;
  /** Coste real ahora mismo (rango + acumulaciones), si se sabe. */
  costNow?: string;
  championResource?: ResourceId;
  onClose: () => void;
};

/** Ficha de una habilidad en solo lectura (descripción, coste, mecánicas, daño, efectos, área). */
const AbilityInfoModal = ({ ability, kicker, image, rank, costNow, championResource, onClose }: Props) => createPortal(
  <Modal onClose={onClose} backdropClassName="hab-modal-backdrop" className="hab-modal">
    <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    <div className="hab-modal__body">
      <div className="hab-modal__kicker">
        {image && <img src={image} alt="" />}
        <span>{kicker}</span>
      </div>
      {(typeof rank === 'number' || costNow) && (
        <p className="hab-modal__meta">
          {typeof rank === 'number' && <><strong>Rango:</strong> {rank}</>}
          {typeof rank === 'number' && costNow ? ' · ' : ''}
          {costNow && <><strong>Coste ahora:</strong> {costNow}</>}
        </p>
      )}
      <AbilityView ability={ability} championResource={championResource} canEdit={false} onEdit={() => undefined} />
      <div className="hab-modal__actions">
        <button type="button" className="hab-modal__btn" onClick={onClose}>Cerrar</button>
      </div>
    </div>
    <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
  </Modal>,
  document.body,
);

export default AbilityInfoModal;
