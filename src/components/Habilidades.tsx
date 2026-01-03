import React, { useState } from 'react';
import championsData from '../habilidades.json';

const Habilidades = () => {
  const [searchChampion, setSearchChampion] = useState<string>('');

  // Filtrar campeones por busqueda
  const filteredChampions = championsData.filter((champion) =>
    champion.champion.toLowerCase().includes(searchChampion.toLowerCase())
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Buscador */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="Buscar por campeon..."
          value={searchChampion}
          onChange={(e) => setSearchChampion(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: '8px',
            border: '1px solid #444',
            backgroundColor: '#1e1e1e',
            color: '#fff',
            width: '100%',
            maxWidth: '400px',
          }}
        />
      </div>

      {/* Grid de campeones */}
      {filteredChampions.map((champion) => (
        <div
          key={champion.champion}
          style={{
            marginBottom: '2rem',
            padding: '1rem',
            borderRadius: '12px',
            backgroundColor: '#1e1e1e',
            color: '#fff',
          }}
        >
          <h2 style={{ marginBottom: '1rem', color: '#c084fc' }}>
            {champion.champion}
          </h2>

          {/* Grid de habilidades */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '1rem',
            }}
          >
            {['P', 'Q', 'W', 'E', 'R'].map((key) => {
              const ability =
                champion.abilities[key as keyof typeof champion.abilities];
              return (
                <div
                  key={key}
                  style={{
                    backgroundColor: '#2a2a2a',
                    padding: '1rem',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 'bold',
                      marginBottom: '0.5rem',
                      fontSize: '1.1rem',
                      color: '#a3e635',
                    }}
                  >
                    [{key}]
                  </div>
                  {ability ? (
                    <>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        {ability.name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#ccc' }}>
                        {ability.description}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#666' }}>No disponible</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filteredChampions.length === 0 && (
        <p style={{ color: '#ccc', textAlign: 'center', marginTop: '2rem' }}>
          No se encontro ningun campeon.
        </p>
      )}
    </div>
  );
};

export default Habilidades;
