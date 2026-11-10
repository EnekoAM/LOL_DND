import { cx } from '../../lib/cx';
import './PhaseTabs.css';

type Props = {
  labels: string[];
  active: number;
  onSelect: (index: number) => void;
  /** Si está, añade la pestaña «+» para crear otra fase. */
  onAdd?: () => void;
  addDisabled?: boolean;
  /** Variante compacta (tarjetas y panel de combate). */
  small?: boolean;
  /** Marca una fase como la actual en combate. */
  currentIndex?: number;
  disabled?: boolean;
  className?: string;
};

/** Pestañas «Fase 1 | Fase 2 | +» de habilidades con variantes. */
const PhaseTabs = ({ labels, active, onSelect, onAdd, addDisabled, small, currentIndex, disabled, className }: Props) => (
  <div
    className={cx('phase-tabs', small && 'phase-tabs--small', className)}
    role="tablist"
    aria-label="Fases de la habilidad"
    onClick={event => event.stopPropagation()}
  >
    {labels.map((label, index) => (
      <button
        key={index}
        type="button"
        role="tab"
        aria-selected={index === active}
        className={cx('phase-tabs__tab', index === active && 'phase-tabs__tab--active', index === currentIndex && 'phase-tabs__tab--current')}
        disabled={disabled}
        title={label}
        onClick={() => onSelect(index)}
      >
        {label}
      </button>
    ))}
    {onAdd && (
      <button
        type="button"
        className="phase-tabs__tab phase-tabs__tab--add"
        disabled={disabled || addDisabled}
        title="Añadir fase"
        aria-label="Añadir fase"
        onClick={onAdd}
      >
        +
      </button>
    )}
  </div>
);

export default PhaseTabs;
