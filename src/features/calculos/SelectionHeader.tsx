type Props = {
  name: string;
  backLabel: string;
  onBack: () => void;
};

const SelectionHeader = ({ name, backLabel, onBack }: Props) => (
  <>
    <button className="calc-back-btn" onClick={onBack}>
      {backLabel}
    </button>
    <div className="calc-selected-header">
      <div className="calc-selected-header__name">{name}</div>
    </div>
  </>
);

export default SelectionHeader;
