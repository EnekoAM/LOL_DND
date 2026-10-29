import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const ALLOWED_SIDES = new Set([2, 4, 6, 8, 10, 12, 20, 100]);

const MAX_DICE = 50;

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

const Dados = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const [ready, setReady] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [notation, setNotation] = useState('1d20');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RollResult[] | null>(null);
  const [modifier, setModifier] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || boxRef.current) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const start = async () => {
      await waitForBoxSize(host);
      if (cancelled || boxRef.current) return;

      const box = new DiceBox({
        container: '#dados-box',
        assetPath: '/assets/dice-box/',
        theme: 'default',
        preloadThemes: ['default-extras'],
        themeColor: '#C9A84C',
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

  const roll = useCallback(async (raw: string) => {
    const box = boxRef.current;
    if (!box || !ready || rolling) return;
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
  }, [ready, rolling]);

  const total = useMemo(() => {
    if (!results?.length) return null;
    return results.reduce((sum, entry) => sum + entry.value, 0) + modifier;
  }, [results, modifier]);

  return (
    <div className="dados-root">
      <div className="dados-toolbar">
        <div className="dados-toolbar__title">Dados</div>
        <div className="dados-quick">
          {QUICK.map(item => (
            <button
              key={item.notation}
              type="button"
              className="dados-chip"
              disabled={!ready || rolling}
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
            disabled={rolling}
          />
          <button type="submit" className="dados-roll" disabled={!ready || rolling}>
            {rolling ? 'Tirando…' : ready ? 'Tirar' : 'Cargando…'}
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
