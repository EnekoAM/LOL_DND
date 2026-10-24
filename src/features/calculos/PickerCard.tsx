import type { ReactNode } from 'react';

type Props = {
  name: string;
  onClick: () => void;
  children?: ReactNode;
};

const PickerCard = ({ name, onClick, children }: Props) => (
  <div className="calc-card calc-card--player" onClick={onClick}>
    <div className="calc-card__name calc-card__name--player">{name}</div>
    {children}
  </div>
);

export default PickerCard;
