import { cx } from '../../lib/cx';

type Props = {
  active: boolean;
  saving: boolean;
  onToggle: (next: boolean) => void | Promise<void>;
};

/** Inspiración D&D 5e: sí/no. Se concede y se gasta con un clic. */
const InspirationToggle = ({ active, saving, onToggle }: Props) => (
  <button
    type="button"
    className={cx('sheet-inspire', active && 'sheet-inspire--on')}
    aria-pressed={active}
    disabled={saving}
    title={active ? 'Gastar inspiración' : 'Conceder inspiración'}
    onClick={() => {
      Promise.resolve(onToggle(!active)).catch(() => undefined);
    }}
  >
    <span className="sheet-inspire__sigil" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M12 2.5 13.9 10.1 21.5 12 13.9 13.9 12 21.5 10.1 13.9 2.5 12 10.1 10.1Z" />
        <circle cx="12" cy="12" r="1.6" />
      </svg>
    </span>
    <span className="sheet-inspire__text">
      <span className="sheet-inspire__label">Inspiración</span>
      <span className="sheet-inspire__state">{active ? 'Activa' : 'Inactiva'}</span>
    </span>
  </button>
);

export default InspirationToggle;
