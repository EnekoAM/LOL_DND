import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { playerPortraitUrl, type Player } from '../../data/players';
import { cx } from '../../lib/cx';
import { normalizeName } from '../../lib/text';

type Props = {
  players: Player[];
  current: Player;
  disabled?: boolean;
  onSelect: (player: Player) => void;
};

const Thumb = ({ image }: { image: string | undefined }) => {
  const [failed, setFailed] = useState(false);
  const src = playerPortraitUrl(image);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className="sheet-switch__thumb" aria-hidden="true">
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : '👤'}
    </span>
  );
};

/** Cambio rápido de ficha: anterior / siguiente y desplegable con todos los jugadores. */
const PlayerSwitcher = ({ players, current, disabled = false, onSelect }: Props) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const currentKey = normalizeName(current.name);
  const index = Math.max(0, players.findIndex(entry => normalizeName(entry.name) === currentKey));
  const count = players.length;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  if (count < 2) return null;

  const go = (target: number) => {
    if (disabled) return;
    const next = players[(target + count) % count];
    if (next && normalizeName(next.name) !== currentKey) onSelect(next);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const pick = (target: number) => {
    close();
    go(target);
  };

  const toggle = () => {
    if (disabled) return;
    if (open) {
      close(false);
      return;
    }
    setActive(index);
    setOpen(true);
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const last = count - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive(value => (value >= last ? 0 : value + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(value => (value <= 0 ? last : value - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        pick(active);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  };

  const prev = players[(index - 1 + count) % count];
  const next = players[(index + 1) % count];

  return (
    <div className={cx('sheet-switch', open && 'is-open')} ref={rootRef}>
      <button
        type="button"
        className="sheet-switch__step"
        onClick={() => go(index - 1)}
        disabled={disabled}
        title={`Anterior: ${prev.name}`}
        aria-label={`Ficha anterior: ${prev.name}`}
      >
        <span className="sheet-switch__arrow sheet-switch__arrow--left" aria-hidden="true" />
      </button>

      <button
        ref={buttonRef}
        type="button"
        className="sheet-switch__trigger"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Cambiar a otra ficha"
      >
        <Thumb image={current.image} />
        <span className="sheet-switch__value">{current.name}</span>
        <span className="sheet-switch__count">{index + 1}/{count}</span>
        <span className="sheet-switch__caret" aria-hidden="true" />
      </button>

      <button
        type="button"
        className="sheet-switch__step"
        onClick={() => go(index + 1)}
        disabled={disabled}
        title={`Siguiente: ${next.name}`}
        aria-label={`Ficha siguiente: ${next.name}`}
      >
        <span className="sheet-switch__arrow sheet-switch__arrow--right" aria-hidden="true" />
      </button>

      {open && (
        <ul
          ref={listRef}
          className="sheet-switch__list"
          role="listbox"
          tabIndex={-1}
          aria-label="Fichas de personaje"
          aria-activedescendant={`sheet-switch-opt-${active}`}
          onKeyDown={onListKeyDown}
        >
          {players.map((entry, entryIndex) => {
            const selected = entryIndex === index;
            return (
              <li
                key={entry.name}
                id={`sheet-switch-opt-${entryIndex}`}
                data-index={entryIndex}
                role="option"
                aria-selected={selected}
                className={cx(
                  'sheet-switch__option',
                  selected && 'is-selected',
                  entryIndex === active && 'is-active',
                )}
                onMouseEnter={() => setActive(entryIndex)}
                onClick={() => pick(entryIndex)}
              >
                <Thumb image={entry.image} />
                <span className="sheet-switch__option-name">{entry.name}</span>
                {selected
                  ? <span className="sheet-switch__option-tag">Actual</span>
                  : entry.rol && <span className="sheet-switch__option-rol">{entry.rol}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PlayerSwitcher;
