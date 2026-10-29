import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { adjustPartyGold, partyGold, partyLevel, savePartyLevel, subscribeParty } from '../data/party';
import { syncAllPlayerStats } from '../features/calculos/playerTotals';
import { MAX_ROLE_LEVEL } from '../data/roles';
import { NavLink } from 'react-router-dom';
import { cx } from '../lib/cx';
import './AppHeader.css';

export type NavItem<T extends string> = {
  id: T;
  label: string;
  icon: string;
};

type Props<T extends string> = {
  navItems: NavItem<T>[];
};

export default function AppHeader<T extends string>({ navItems }: Props<T>) {
  const gold = useSyncExternalStore(subscribeParty, partyGold);
  const level = useSyncExternalStore(subscribeParty, partyLevel);
  const [grantOpen, setGrantOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grantRef = useRef<HTMLDivElement>(null);
  const amountId = useId();

  useEffect(() => {
    if (!grantOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setGrantOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (busy) return;
      if (!grantRef.current?.contains(event.target as Node)) setGrantOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [grantOpen, busy]);

  const changeGold = async (sign: 1 | -1) => {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) {
      setError('Escribe una cantidad entera mayor que 0');
      return;
    }
    if (sign < 0 && value > gold) {
      setError(`Falta oro (tienes ${gold.toLocaleString('es-ES')}, quieres quitar ${value.toLocaleString('es-ES')})`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adjustPartyGold(sign * value);
      setAmount('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cambiar el oro');
    } finally {
      setBusy(false);
    }
  };

  const giveGold = (event: FormEvent) => {
    event.preventDefault();
    void changeGold(1);
  };

  const changeLevel = async (next: number) => {
    if (next < 1 || next > MAX_ROLE_LEVEL || next === level) return;
    setBusy(true);
    setError(null);
    try {
      await savePartyLevel(next);
      try {
        await syncAllPlayerStats();
      } catch {
        // El nivel ya está guardado; las stats se recalcularán al tocar el equipo.
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cambiar el nivel');
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="app-header">
      <div className="header-stats">
        <div className="stat-gold" ref={grantRef}>
          <span className="stat-gold__coin">⚜</span>
          <span className="stat-gold__amount">{gold.toLocaleString('es-ES')}</span>
          <span className="stat-gold__label">oro</span>
          <span className="gold-grant__anchor">
            <button
              type="button"
              className={cx('gold-grant__open', grantOpen && 'gold-grant__open--on')}
              aria-expanded={grantOpen}
              aria-controls={grantOpen ? amountId : undefined}
              aria-label="Ajustar el grupo"
              disabled={busy}
              onClick={() => setGrantOpen(open => !open)}
            >
              +
            </button>
            {grantOpen && (
              <form className="gold-grant" onSubmit={giveGold}>
                <div className="gold-grant__head">
                  <span className="gold-grant__mark" aria-hidden="true">⚜</span>
                  <p className="gold-grant__title">Grupo</p>
                </div>
                <div className="gold-grant__rule" aria-hidden="true" />
                <div className="gold-grant__fields">
                  <label className="gold-grant__label" htmlFor={amountId}>Oro</label>
                  <input
                    id={amountId}
                    className="gold-grant__input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="0"
                    value={amount}
                    autoFocus
                    disabled={busy}
                    onChange={event => setAmount(event.target.value)}
                  />
                  <div className="gold-grant__row">
                    <button type="submit" className="gold-grant__submit" disabled={busy}>
                      {busy ? '…' : 'Dar'}
                    </button>
                    <button
                      type="button"
                      className="gold-grant__submit gold-grant__submit--quiet"
                      disabled={busy}
                      onClick={() => void changeGold(-1)}
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="gold-grant__rule gold-grant__rule--inset" aria-hidden="true" />
                  <p className="gold-grant__label" id={`${amountId}-level`}>Nivel</p>
                  <div className="gold-grant__level">
                    <button
                      type="button"
                      className="gold-grant__step"
                      aria-label="Bajar nivel"
                      disabled={busy || level <= 1}
                      onClick={() => void changeLevel(level - 1)}
                    >
                      −
                    </button>
                    <span className="gold-grant__level-value" aria-labelledby={`${amountId}-level`}>{level}</span>
                    <button
                      type="button"
                      className="gold-grant__step"
                      aria-label="Subir nivel"
                      disabled={busy || level >= MAX_ROLE_LEVEL}
                      onClick={() => void changeLevel(level + 1)}
                    >
                      +
                    </button>
                  </div>
                  {error && <p className="gold-grant__error" role="alert">{error}</p>}
                </div>
              </form>
            )}
          </span>
        </div>

        <div className="header-divider" />

        <div className="stat-level">Nivel {level}</div>
      </div>

      <nav className="header-nav">
        {navItems.map(item => (
          <NavLink
            key={item.id}
            to={`/${item.id}`}
            className={({ isActive }) => cx('nav-btn', isActive && 'nav-btn--active')}
          >
            <span className="nav-btn__icon">{item.icon}</span>
            <span className="nav-btn__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
