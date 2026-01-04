import { useState } from 'react';
import Items from './components/Items';
import Personajes from './components/Personajes';
import Habilidades from './components/Habilidades';

function App() {
  const [screen, setScreen] = useState<'items' | 'personajes' | 'habilidades'>('items');
  const [gold, setGold] = useState<number>(3906); // oro actual (ejemplo)

  const handleScreenChange = (newScreen: 'items' | 'personajes' | 'habilidades') => {
    setScreen(newScreen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#111111',
        fontFamily: "'Montserrat', sans-serif",
        paddingTop: '80px',
        color: '#fff',
      }}
    >
      {/* Header */}
      <header
        style={{
          backgroundColor: '#1a1a1a',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between', // 👈 clave
          alignItems: 'center',
          borderBottom: '1px solid #222',
          zIndex: 9999,
        }}
      >
        {/* ORO */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 600,
            fontSize: '1.1rem',
            color: '#facc15', // dorado
          }}
        >
          <span style={{ fontSize: '1.3rem' }}>💰</span>
          {gold.toLocaleString()}
        </div>

        {/* Navegación */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            style={{ ...btnStyle, ...(screen === 'items' ? activeBtnStyle : {}) }}
            onClick={() => handleScreenChange('items')}
          >
            Items
          </button>
          <button
            style={{ ...btnStyle, ...(screen === 'habilidades' ? activeBtnStyle : {}) }}
            onClick={() => handleScreenChange('habilidades')}
          >
            Habilidades
          </button>
          <button
            style={{ ...btnStyle, ...(screen === 'personajes' ? activeBtnStyle : {}) }}
            onClick={() => handleScreenChange('personajes')}
          >
            Personajes
          </button>
        </div>
      </header>

      {/* Contenido */}
      <main style={{ padding: '2rem' }}>
        {screen === 'items' && <Items />}
        {screen === 'habilidades' && <Habilidades />}
        {screen === 'personajes' && <Personajes />}
      </main>
    </div>
  );
}

// Botón estándar
const btnStyle: React.CSSProperties = {
  padding: '0.6rem 1.2rem',
  borderRadius: '8px',
  border: '1px solid #444',
  backgroundColor: '#222',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 500,
  transition: 'all 0.2s ease',
};

const activeBtnStyle: React.CSSProperties = {
  backgroundColor: '#c084fc',
  color: '#000',
  borderColor: '#c084fc',
  fontWeight: 600,
  transform: 'scale(1.05)',
};

export default App;
