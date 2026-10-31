import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Props = {
  name: string;
  onClick: () => void;
  children?: ReactNode;
  className?: string;
};

const PickerCard = ({ name, onClick, children, className }: Props) => (
  <div className={cx('calc-card', 'calc-card--player', className)} onClick={onClick}>
    <div className="calc-card__name calc-card__name--player">{name}</div>
    {children}
  </div>
);

export default PickerCard;
