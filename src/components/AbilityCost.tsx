import type { ResourceId } from '../data/resources';
import { cx } from '../lib/cx';
import './ResourceChip.css';

type Props = {
  text: string;
  /** Recurso de la habilidad (maná, energía…): da el color. */
  resource?: ResourceId;
  className?: string;
};

/** Coste de una habilidad al lado de su chip de recurso, con el color del recurso. */
const AbilityCost = ({ text, resource, className }: Props) => (
  <span className={cx('ability-cost', 'ability-cost--standalone', resource && `ability-cost--${resource}`, className)} title="Coste">
    {text}
  </span>
);

export default AbilityCost;
