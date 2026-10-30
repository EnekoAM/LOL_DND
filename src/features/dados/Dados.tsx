import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import DiceBox from '@3d-dice/dice-box';
import '@3d-dice/dice-box/dist/style.css';
import './Dados.css';

type RollResult = {
  qty: number;
  sides: number;
  rolls: { value: number }[];
  value: number;
};

const QUICK: { label: string; notation: string }[] = [
  { label: 'Moneda', notation: '1d2' },
  { label: 'd4', notation: '1d4' },
  { label: 'd6', notation: '1d6' },
  { label: 'd8', notation: '1d8' },
  { label: 'd10', notation: '1d10' },
  { label: 'd12', notation: '1d12' },
  { label: 'd20', notation: '1d20' },
  { label: '2d6', notation: '2d6' },
  { label: '4d6', notation: '4d6' },
  { label: '2d20', notation: '2d20' },
];

type DiceTheme = {
  id: string;
  label: string;
  color?: string;
  /** Textura para previsualizar el d20 (temas con mapa diffuse propio). */
  previewTexture?: string;
};

const DICE_THEMES: DiceTheme[] = [
  { id: 'default', label: 'Clásico', color: '#C9A84C' },
  { id: 'smooth', label: 'Suave', color: '#C9A84C' },
  { id: 'gemstone', label: 'Gema', color: '#7B5EA7' },
  { id: 'rock', label: 'Piedra', color: '#b7aca1' },
  { id: 'rust', label: 'Óxido', color: '#aa4f4a' },
  {
    id: 'wooden',
    label: 'Madera',
    previewTexture: '/assets/dice-box/themes/wooden/diffuse.jpg',
  },
  {
    id: 'diceOfRolling',
    label: 'Dice of Rolling',
    previewTexture: '/assets/dice-box/themes/diceOfRolling/diffuse.jpg',
  },
];

const THEME_KEY = 'lol-dnd:dice-theme';
const ALLOWED_SIDES = new Set([2, 4, 6, 8, 10, 12, 20, 100]);
const MAX_DICE = 50;

const readSavedTheme = (): string => {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw && DICE_THEMES.some(theme => theme.id === raw)) return raw;
  } catch { /* ignore */ }
  return 'default';
};

type DiceGroup = { qty: number; sides: number };
type ParsedRoll =
  | { ok: true; label: string; payload: string[]; modifier: number }
  | { ok: false; error: string };

/** Acepta 1d20, 2d6+1, 25d12+25d4… Máximo 50 dados en total. */
const parseRollNotation = (raw: string): ParsedRoll => {
  const value = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!value) return { ok: false, error: 'Escribe una notación, por ejemplo 1d20 o 25d12+25d4' };

  const match = value.match(/^((?:\d*d\d+)(?:\+(?:\d*d\d+))*)(?:([+-])(\d+))?$/);
  if (!match) {
    return { ok: false, error: 'Usa notación como 1d20, 2d6+1 o 25d12+25d4' };
  }

  const groups: DiceGroup[] = match[1].split('+').map(token => {
    const piece = token.startsWith('d') ? `1${token}` : token;
    const parts = piece.match(/^(\d+)d(\d+)$/);
    if (!parts) return { qty: 0, sides: 0 };
    return { qty: Number(parts[1]), sides: Number(parts[2]) };
  });

  if (groups.some(group => group.qty < 1 || group.sides < 2)) {
    return { ok: false, error: 'Cada grupo necesita al menos 1 dado y 2 caras' };
  }

  if (groups.some(group => !ALLOWED_SIDES.has(group.sides))) {
    return { ok: false, error: 'Caras válidas: d2 (moneda), d4, d6, d8, d10, d12, d20, d100' };
  }

  const total = groups.reduce((sum, group) => sum + group.qty, 0);
  if (total > MAX_DICE) {
    return { ok: false, error: `Máximo ${MAX_DICE} dados por tirada (ahora van ${total})` };
  }

  const modifier = match[2] && match[3]
    ? (match[2] === '-' ? -Number(match[3]) : Number(match[3]))
    : 0;
  const modLabel = modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`;
  const label = groups.map(group => `${group.qty}d${group.sides}`).join('+') + modLabel;
  // DiceBox solo parsea UN grupo por string; hay que pasar un array.
  const payload = groups.map(group => `${group.qty}d${group.sides}`);
  return { ok: true, label, payload, modifier };
};

const waitForBoxSize = async (el: HTMLElement): Promise<void> => {
  for (let i = 0; i < 30; i += 1) {
    if (el.clientWidth > 0 && el.clientHeight > 0) return;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

const themeColorOf = (themeId: string): string | undefined =>
  DICE_THEMES.find(theme => theme.id === themeId)?.color;


/** Mini d20 del tema: visible siempre (trigger y opciones), sin hover. */
const ThemeDicePreview = ({ theme, size = 22 }: { theme: DiceTheme; size?: number }) => {
  const uid = `dice-prev-${theme.id}-${size}`;
  const fill = theme.previewTexture ? `url(#${uid}-tex)` : (theme.color ?? '#C9A84C');
  const stroke = theme.previewTexture ? 'rgba(40, 24, 8, 0.85)' : 'rgba(0, 0, 0, 0.45)';
  const faceLight = theme.previewTexture ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.22)';
  const faceDark = theme.previewTexture ? 'rgba(0, 0, 0, 0.22)' : 'rgba(0, 0, 0, 0.18)';
  return (
    <svg
      className="dados-select__die"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {theme.previewTexture && (
          <pattern id={`${uid}-tex`} patternUnits="userSpaceOnUse" width="64" height="64">
            <image href={theme.previewTexture} x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        )}
        <linearGradient id={`${uid}-shine`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.25)" />
        </linearGradient>
      </defs>
      <polygon
        points="32,4 56,18 56,46 32,60 8,46 8,18"
        fill={fill}
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon points="32,4 56,18 32,28 8,18" fill={faceLight} />
      <polygon points="32,28 56,18 56,46 32,60 8,46 8,18" fill={faceDark} opacity="0.35" />
      <polygon points="32,4 48,22 32,28 16,22" fill="none" stroke={stroke} strokeWidth="1.2" opacity="0.7" />
      <line x1="32" y1="28" x2="32" y2="60" stroke={stroke} strokeWidth="1.1" opacity="0.55" />
      <line x1="8" y1="18" x2="32" y2="28" stroke={stroke} strokeWidth="1.1" opacity="0.55" />
      <line x1="56" y1="18" x2="32" y2="28" stroke={stroke} strokeWidth="1.1" opacity="0.55" />
      <line x1="8" y1="46" x2="32" y2="28" stroke={stroke} strokeWidth="1" opacity="0.4" />
      <line x1="56" y1="46" x2="32" y2="28" stroke={stroke} strokeWidth="1" opacity="0.4" />
      <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill={`url(#${uid}-shine)`} />
      <text
        x="32"
        y="36"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Cinzel, Georgia, serif"
        fontSize="14"
        fontWeight="700"
        fill={theme.previewTexture ? '#f5e6c8' : '#1a1000'}
        stroke={theme.previewTexture ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.25)'}
        strokeWidth="0.6"
        paintOrder="stroke"
      >
        20
      </text>
    </svg>
  );
};

type ThemeSelectProps = {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
};

/** Desplegable propio: el <select> nativo no deja estilar la lista abierta. */
const ThemeSelect = ({ value, disabled, onChange }: ThemeSelectProps) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const selectedIndex = Math.max(0, DICE_THEMES.findIndex(entry => entry.id === value));
  const current = DICE_THEMES[selectedIndex];

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

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex);
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const pick = (id: string) => {
    close();
    if (id !== value) onChange(id);
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const last = DICE_THEMES.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive(index => (index >= last ? 0 : index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(index => (index <= 0 ? last : index - 1));
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
        pick(DICE_THEMES[active].id);
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

  return (
    <div className={`dados-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="dados-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="dados-theme-label dados-theme-value"
        onClick={() => (open ? close() : openList())}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
          }
        }}
      >
        <span id="dados-theme-value" className="dados-select__value">{current.label}</span>
        <ThemeDicePreview theme={current} size={20} />
        <span className="dados-select__caret" aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listRef}
          className="dados-select__list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby="dados-theme-label"
          aria-activedescendant={`dados-theme-opt-${DICE_THEMES[active].id}`}
          onKeyDown={onListKeyDown}
        >
          {DICE_THEMES.map((entry, index) => {
            const selected = entry.id === value;
            return (
              <li
                key={entry.id}
                id={`dados-theme-opt-${entry.id}`}
                role="option"
                aria-selected={selected}
                className={[
                  'dados-select__option',
                  selected ? 'is-selected' : '',
                  index === active ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                onMouseEnter={() => setActive(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => pick(entry.id)}
              >
                <span className="dados-select__option-label">{entry.label}</span>
                <ThemeDicePreview theme={entry} size={22} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const Dados = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const [ready, setReady] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [notation, setNotation] = useState('1d20');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RollResult[] | null>(null);
  const [modifier, setModifier] = useState(0);
  const [theme, setTheme] = useState(readSavedTheme);
  const [themeBusy, setThemeBusy] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || boxRef.current) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const start = async () => {
      await waitForBoxSize(host);
      if (cancelled || boxRef.current) return;

      const initialTheme = readSavedTheme();
      const box = new DiceBox({
        container: '#dados-box',
        assetPath: '/assets/dice-box/',
        theme: initialTheme,
        preloadThemes: [
          'default-extras',
          ...DICE_THEMES.map(entry => entry.id).filter(id => id !== initialTheme),
        ],
        themeColor: themeColorOf(initialTheme) ?? '#C9A84C',
        scale: 6,
        gravity: 1,
        friction: 0.8,
        restitution: 0.5,
        startingHeight: 8,
        throwForce: 5,
        spinForce: 4,
        // On-screen: el worker offscreen a veces deja la mesa en negro con Vite.
        offscreen: false,
        enableShadows: true,
        lightIntensity: 1.1,
        onRollComplete: (next: RollResult[]) => {
          setResults(next);
          setRolling(false);
        },
      });
      boxRef.current = box;

      try {
        await box.init();
        if (cancelled) return;
        box.show();
        box.resizeWorld();
        observer = new ResizeObserver(() => {
          try {
            box.resizeWorld();
          } catch {
            // ignore
          }
        });
        observer.observe(host);
        setReady(true);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'No se pudo iniciar los dados 3D');
      }
    };

    void start();

    return () => {
      cancelled = true;
      observer?.disconnect();
      try {
        boxRef.current?.clear();
      } catch {
        // ignore cleanup races
      }
      boxRef.current = null;
      setReady(false);
    };
  }, []);

  const changeTheme = useCallback(async (next: string) => {
    const box = boxRef.current;
    if (!box || !ready || rolling || themeBusy || next === theme) {
      setTheme(next);
      return;
    }
    setThemeBusy(true);
    setError(null);
    try {
      const patch: { theme: string; themeColor?: string } = { theme: next };
      const color = themeColorOf(next);
      if (color) patch.themeColor = color;
      await box.updateConfig(patch);
      setTheme(next);
      try { box.clear(); } catch { /* ignore */ }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cambiar el tema');
    } finally {
      setThemeBusy(false);
    }
  }, [ready, rolling, theme, themeBusy]);

  const roll = useCallback(async (raw: string) => {
    const box = boxRef.current;
    if (!box || !ready || rolling || themeBusy) return;
    const parsed = parseRollNotation(raw);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setRolling(true);
    setResults(null);
    setModifier(parsed.modifier);
    setNotation(parsed.label);
    try {
      box.show();
      box.resizeWorld();
      await box.roll(parsed.payload);
    } catch (caught) {
      setRolling(false);
      setError(caught instanceof Error ? caught.message : 'No se pudo tirar');
    }
  }, [ready, rolling, themeBusy]);

  const total = useMemo(() => {
    if (!results?.length) return null;
    return results.reduce((sum, entry) => sum + entry.value, 0) + modifier;
  }, [results, modifier]);

  return (
    <div className="dados-root">
      <div className="dados-toolbar">
        <div className="dados-toolbar__title">Dados</div>
        <div className="dados-theme">
          <span className="dados-theme__label" id="dados-theme-label">Tema</span>
          <ThemeSelect
            value={theme}
            disabled={!ready || rolling || themeBusy}
            onChange={next => { void changeTheme(next); }}
          />
        </div>
        <div className="dados-quick">
          {QUICK.map(item => (
            <button
              key={item.notation}
              type="button"
              className="dados-chip"
              disabled={!ready || rolling || themeBusy}
              onClick={() => { void roll(item.notation); }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form
          className="dados-custom"
          onSubmit={event => {
            event.preventDefault();
            void roll(notation);
          }}
        >
          <input
            className="dados-input"
            value={notation}
            onChange={event => setNotation(event.target.value)}
            aria-label="Notación de dados"
            placeholder="1d20"
            disabled={rolling || themeBusy}
          />
          <button type="submit" className="dados-roll" disabled={!ready || rolling || themeBusy}>
            {rolling ? 'Tirando…' : themeBusy ? 'Tema…' : ready ? 'Tirar' : 'Cargando…'}
          </button>
        </form>
      </div>

      <div className="dados-stage">
        <div id="dados-box" className="dados-box" ref={hostRef} />
        {!ready && !error && <div className="dados-status">Cargando mesa de dados…</div>}
        {error && <div className="dados-status dados-status--error">{error}</div>}
      </div>

      {results && (
        <div className="dados-results">
          <div className="dados-results__label">Resultado</div>
          <div className="dados-results__total">{total}</div>
          <div className="dados-results__detail">
            {results.map((entry, index) => {
              const sidesNum = Number(String(entry.sides).replace(/^d/i, ''));
              const isCoin = sidesNum === 2;
              return (
                <span key={`${entry.sides}-${index}`}>
                  {isCoin ? `${entry.qty}×moneda` : `${entry.qty}d${sidesNum}`}: {entry.rolls.map(r => (isCoin ? (r.value === 1 ? 'cara' : 'cruz') : r.value)).join(', ')}
                  {index < results.length - 1 ? ' · ' : ''}
                </span>
              );
            })}
            {modifier !== 0 && (
              <span>{' · '}mod {modifier > 0 ? `+${modifier}` : modifier}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dados;
