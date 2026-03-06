import { useState } from 'react';
import Items from './components/Items';
import Calculos from './components/Calculos';
import Habilidades from './components/Habilidades';
import ItemRoll from './components/ItemRoll';
import './App.css';

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Screen = 'items' | 'calculos' | 'habilidades' | 'item roll';

// ─── COMPONENT ───────────────────────────────────────────────────────────────
function App() {
  const [screen, setScreen] = useState<Screen>('items');
  const [gold]              = useState<number>(3906);

  const level      = 3;
  const expCurrent = 124;
  const expNext    = 600;
  const expPct     = (expCurrent / expNext) * 100;

  const handleScreenChange = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
<div className="app-root">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <header className="app-header">

          {/* Left: gold + exp */}
          <div className="header-stats">

            {/* Gold */}
            <div className="stat-gold">
              <span className="stat-gold__coin">⚜</span>
              <span className="stat-gold__amount">{gold.toLocaleString()}</span>
              <span className="stat-gold__label">oro</span>
            </div>

            {/* Divider */}
            <div className="header-divider" />

            {/* Exp */}
            <div className="stat-exp">
              <div className="stat-exp__label">
                <span className="stat-exp__nivel">Nivel {level}</span>
                <span className="stat-exp__values">{expCurrent} / {expNext} exp</span>
              </div>
              <div className="stat-exp__track">
                <div
                  className="stat-exp__fill"
                  style={{ width: `${expPct}%` }}
                />
                <div
                  className="stat-exp__glow"
                  style={{ width: `${expPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right: nav */}
          <nav className="header-nav">
            {(['items', 'habilidades', 'calculos', 'item roll'] as Screen[]).map(s => (
              <button
                key={s}
                className={`nav-btn ${screen === s ? 'nav-btn--active' : ''}`}
                onClick={() => handleScreenChange(s)}
              >
                <span className="nav-btn__icon">{navIcon[s]}</span>
                <span className="nav-btn__label">{navLabel[s]}</span>
              </button>
            ))}
          </nav>
        </header>

        {/* ── MAIN ───────────────────────────────────────────────────── */}
        <main className="app-main">
          {screen === 'items'      && <Items />}
          {screen === 'habilidades'&& <Habilidades />}
          {screen === 'calculos' && <Calculos />}
          {screen === 'item roll'  && <ItemRoll />}
        </main>

        {/* ── BACKGROUND LAYER ───────────────────────────────────────── */}
        <div className="app-bg" aria-hidden="true" />
      </div>
    </>
  );
}

// ─── METADATA ────────────────────────────────────────────────────────────────
const navIcon: Record<Screen, string> = {
  'items':      '⚔',
  'habilidades':'✦',
  'calculos': '👤',
  'item roll':  '🎲',
};

const navLabel: Record<Screen, string> = {
  'items':      'Items',
  'habilidades':'Habilidades',
  'calculos': 'calculos',
  'item roll':  'Item Roll',
};

export default App;