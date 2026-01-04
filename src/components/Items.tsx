import { useState } from 'react';
import ItemsData from '../json/items_actualizados.json';

const rarityOptions = ['Inicial', 'Basico', 'Epico', 'Legendario', 'Prismatico'];

const Items = () => {
  const [filterStat, setFilterStat] = useState<'all' | string>('all');
  const [filterStock, setFilterStock] = useState<'all' | 'in' | 'out'>('all');
  const [filterRarity, setFilterRarity] = useState<'all' | string>('all');
  const [searchName, setSearchName] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<typeof ItemsData[0] | null>(null);

  type Stats = {
    [key: string]: number;
  };

  const filteredItems = ItemsData.filter((item) => {
    if (filterStat !== 'all' && (item.stats as Stats)[filterStat] <= 0) return false;
    if (filterStock === 'in' && item.cantidad <= 0) return false;
    if (filterStock === 'out' && item.cantidad > 0) return false;
    if (filterRarity !== 'all' && item.rareza !== filterRarity) return false;
    if (searchName.trim() !== '' && !item.nombre.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '100%', margin: '0 auto' }}>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select
          value={filterStat}
          onChange={(e) => setFilterStat(e.target.value)}
          style={selectStyle}
        >
          <option value="all">Todos los atributos</option>
          {Object.keys(ItemsData[0].stats).map((stat) => (
            <option key={stat} value={stat} style={optionStyle}>{stat}</option>
          ))}
        </select>

        <select
          value={filterStock}
          onChange={(e) => setFilterStock(e.target.value as any)}
          style={selectStyle}
        >
          <option value="all" style={optionStyle}>Todos (Stock)</option>
          <option value="in" style={optionStyle}>Con stock</option>
          <option value="out" style={optionStyle}>Sin stock</option>
        </select>

        <select
          value={filterRarity}
          onChange={(e) => setFilterRarity(e.target.value)}
          style={selectStyle}
        >
          <option value="all" style={optionStyle}>Todas las rarezas</option>
          {rarityOptions.map((r) => (
            <option key={r} value={r} style={optionStyle}>{r}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Grid de items */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', // 👈 auto-fit permite más columnas si hay espacio
          gap: '1.5rem',
        }}
      >
        {filteredItems.map((item, index) => {
          const isEmpty = item.cantidad === 0;
          return (
            <div
              key={index}
              onClick={() => setSelectedItem(item)}
              style={{
                border: '1px solid #444',
                borderRadius: '12px',
                padding: '1rem',
                backgroundColor: '#1e1e1e',
                color: '#fff',
                filter: isEmpty ? 'grayscale(100%)' : 'none',
                opacity: isEmpty ? 0.6 : 1,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.03)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.7)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 6px rgba(0,0,0,0.5)';
              }}
            >
              <h2 style={{ marginBottom: '0.25rem' }}>{item.nombre}</h2>
              <span style={{ fontStyle: 'italic', color: '#c084fc' }}>{item.rareza}</span>

              <div
                style={{
                  height: '120px',
                  margin: '1rem 0',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  color: '#aaa',
                  overflow: 'hidden',
                }}
              >
                {item.imagen ? (
                  <img
                    src={item.imagen}
                    alt={item.nombre}
                    style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px' }}
                  />
                ) : 'Sin imagen'}
              </div>

              <div>
                <h4>Stats</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {Object.entries(item.stats).map(([stat, value]) =>
                    value !== 0 ? <li key={stat}><strong>{stat}:</strong> {value}</li> : null
                  )}
                </ul>
              </div>

              <div
                style={{
                  marginTop: '0.75rem',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  color: isEmpty ? '#ff6b6b' : '#a3e635',
                }}
              >
                Cantidad: {item.cantidad}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {selectedItem && (
        <div
          onClick={() => setSelectedItem(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            opacity: 1,
            transition: 'opacity 0.3s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1e1e1e',
              color: '#fff',
              padding: '2rem',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 6px 20px rgba(0,0,0,0.7)',
              transform: 'scale(1)',
              transition: 'transform 0.3s ease',
            }}
          >
            <h2>{selectedItem.nombre}</h2>
            <h3 style={{ fontStyle: 'italic', color: '#c084fc' }}>{selectedItem.rareza}</h3>

            <div style={{ marginTop: '1rem' }}>
              {selectedItem.efecto.pasiva && (
                <p><strong>Pasiva:</strong> {selectedItem.efecto.pasiva}</p>
              )}
              {selectedItem.efecto.activa && (
                <p><strong>Activa:</strong> {selectedItem.efecto.activa}</p>
              )}
              {!selectedItem.efecto.pasiva && !selectedItem.efecto.activa && (
                <p>No tiene efectos activos o pasivos.</p>
              )}
            </div>

            <button
              onClick={() => setSelectedItem(null)}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#c084fc',
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#a855f7')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#c084fc')}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  padding: '0.5rem',
  borderRadius: '8px',
  border: '1px solid #444',
  backgroundColor: '#1e1e1e',
  color: '#fff',
  cursor: 'pointer',
  appearance: 'none', // quita el estilo nativo del OS
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  minWidth: '150px',
};

const optionStyle: React.CSSProperties = {
  backgroundColor: '#1e1e1e',
  color: '#fff',
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  borderRadius: '8px',
  border: '1px solid #444',
  backgroundColor: '#1e1e1e',
  color: '#fff',
  flexGrow: 1,
  minWidth: '200px',
};


export default Items;
