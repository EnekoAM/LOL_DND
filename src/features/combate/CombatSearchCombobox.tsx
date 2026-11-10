import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import { foldText, type SearchOption } from './combatHelpers';

type Props = {
  placeholder: string;
  options: SearchOption[];
  selected: SearchOption | null;
  onSelect: (option: SearchOption | null) => void;
  disabled?: boolean;
};

export default function CombatSearchCombobox({ placeholder, options, selected, onSelect, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const needle = foldText(query.trim());
    const list = !needle
      ? options
      : options.filter(option => {
          const hay = foldText([option.name, option.hint ?? '', option.badge].join(' '));
          return hay.includes(needle);
        });
    return list.slice(0, 80);
  }, [options, query]);

  useEffect(() => { setHighlight(0); }, [query, open, selected?.id]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open, filtered.length]);

  const pick = (option: SearchOption) => {
    onSelect(option);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight(i => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setHighlight(i => Math.max(0, i - 1));
      return;
    }
    if (event.key === 'Enter' && open && filtered[highlight]) {
      event.preventDefault();
      pick(filtered[highlight]);
    }
  };

  return (
    <div className="combat-search" ref={rootRef}>
      {selected ? (
        <button
          type="button"
          className="combat-search__chip"
          disabled={disabled}
          title="Quitar selección"
          onClick={() => { onSelect(null); setQuery(''); setOpen(true); }}
        >
          {selected.image
            ? <img src={selected.image} alt="" width={22} height={22} />
            : <span className="combat-search__chip-fallback" aria-hidden>✦</span>}
          <span className="combat-search__chip-badge">{selected.badge}</span>
          <span className="combat-search__chip-name">{selected.name}</span>
          <span aria-hidden>×</span>
        </button>
      ) : (
        <input
          className="combat-search__input"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="combat-search-list"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      )}

      {open && !selected && (
        <ul id="combat-search-list" ref={listRef} className="combat-search__list" role="listbox">
          {filtered.length === 0 && <li className="combat-search__empty">Sin resultados</li>}
          {filtered.map((option, index) => (
            <li key={option.id} role="presentation">
              <button
                type="button"
                role="option"
                data-idx={index}
                aria-selected={index === highlight}
                className={cx('combat-search__option', index === highlight && 'combat-search__option--on')}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(option)}
              >
                {option.image
                  ? <img className="combat-search__opt-img" src={option.image} alt="" width={32} height={32} />
                  : <span className="combat-search__opt-img combat-search__opt-img--fallback" aria-hidden>✦</span>}
                <span className="combat-search__opt-text">
                  <span className="combat-search__opt-name">
                    {option.name}
                    <span className="combat-search__opt-badge">{option.badge}</span>
                  </span>
                  {option.hint && <span className="combat-search__opt-hint">{option.hint}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
