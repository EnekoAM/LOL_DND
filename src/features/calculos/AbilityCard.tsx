import type { ReactNode } from 'react';
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
  /** Contenido extra dentro de la tarjeta (p. ej. rangos en la ficha). */
  children?: ReactNode;
  /**
   * Ficha de NPC: no atenúa las pasivas (el estilo inactivo es de habilidades
   * de campeón sin daño / no aprendidas) ni muestra «Sin cálculo».
   */
  alwaysVisible?: boolean;
  /** Sustituye las líneas AD/AP (p. ej. «Daño: 4d4+2 físico»). */
  damageText?: string;
};

const AbilityCard = ({
  label,
  name,
  ability,
  onSelect,
  hideScaling = false,
  children,
  alwaysVisible = false,
  damageText,
}: Props) => {
  const damage = ability?.damage;
  const inactive = !alwaysVisible && !damage;

  const handleClick = () => {
    if (ability?.damage) onSelect(ability);
  };

  return (
    <div className={cx('calc-card calc-card--ability', inactive && 'calc-card--ability--inactive')}
      onClick={handleClick}
      role={damage ? 'button' : undefined}
      tabIndex={damage ? 0 : undefined}
      aria-label={damage ? `Abrir habilidad ${name}` : undefined}
      onKeyDown={event => {
        if (damage && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          handleClick();
        }
      }}>
      <div className="calc-card__key">[{label}]</div>
      <div className="calc-card__name">{name}</div>
      {!hideScaling && damageText && <div className="calc-card__damage">{damageText}</div>}
      {!hideScaling && !damageText && damage?.ad && <div className="calc-card__damage">AD: {formatPercentList(damage.ad)} ({damage.adSource ?? 'total'})</div>}
      {!hideScaling && !damageText && damage?.ap && <div className="calc-card__damage">AP: {formatPercentList(damage.ap)}</div>}
      {!alwaysVisible && !ability && <div className="calc-card__undefined">No implementada</div>}
      {!alwaysVisible && ability && !damage && <div className="calc-card__no-calc">Sin cálculo</div>}
      {children && <div className="calc-card__extra" onClick={event => event.stopPropagation()}>{children}</div>}
    </div>
  );
};

export default AbilityCard;
