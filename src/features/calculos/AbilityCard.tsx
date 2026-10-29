import type { Ability } from '../../data/champions';
import { cx } from '../../lib/cx';
import { formatPercentList } from '../../lib/format';

type Props = {
  label: string;
  name: string;
  /** null cuando el nombre no existe en habilidades.json. */
  ability: Ability | null;
  onSelect: (ability: Ability) => void;
  /** Oculta los escalados de daño (ficha). */
  hideScaling?: boolean;
};

const AbilityCard = ({ label, name, ability, onSelect, hideScaling = false }: Props) => {
  const damage = ability?.damage;

  const handleClick = () => {
    if (ability?.damage) onSelect(ability);
  };

  return (
    <div className={cx('calc-card calc-card--ability', !damage && 'calc-card--ability--inactive')} onClick={handleClick}>
      <div className="calc-card__key">[{label}]</div>
      <div className="calc-card__name">{name}</div>
      {!hideScaling && damage?.ap && <div className="calc-card__damage">AP: {formatPercentList(damage.ap)}</div>}
      {!ability && <div className="calc-card__undefined">No implementada</div>}
      {ability && !damage && <div className="calc-card__no-calc">Sin cálculo</div>}
    </div>
  );
};

export default AbilityCard;
