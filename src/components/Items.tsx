import { useState } from 'react';
import ItemsData from '../json/items_actualizados.json';
import './Items.css';

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Stats = { [key: string]: number };

const rarityOptions = ['Inicial', 'Basico', 'Epico', 'Legendario', 'Prismatico'];

// Rarity → CSS modifier class
const rarityClass: Record<string, string> = {
  Inicial:    'rarity--inicial',
  Basico:     'rarity--basico',
  Epico:      'rarity--epico',
  Legendario: 'rarity--legendario',
  Prismatico: 'rarity--prismatico',
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const Items = () => {
  const [filterStat,   setFilterStat]   = useState<string>('all');
  const [filterStock,  setFilterStock]  = useState<string>('all');
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [searchName,   setSearchName]   = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<typeof ItemsData[0] | null>(null);

  const filteredItems = ItemsData.filter((item) => {
    if (filterStat   !== 'all' && (item.stats as Stats)[filterStat] <= 0) return false;
    if (filterStock  === 'in'  && item.cantidad <= 0)                      return false;
    if (filterStock  === 'out' && item.cantidad > 0)                       return false;
    if (filterRarity !== 'all' && item.rareza !== filterRarity)            return false;
    if (searchName.trim() !== '' && !item.nombre.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="items-root">

      {/* ── FILTERS ─────────────────────────────────────────────── */}
      <div className="items-filters">
        <div className="filter-group">
          <label className="filter-label">Atributo</label>
          <select className="filter-select" value={filterStat} onChange={e => setFilterStat(e.target.value)}>
            <option value="all">Todos</option>
            {Object.keys(ItemsData[0].stats).map(stat => (
              <option key={stat} value={stat}>{stat}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Stock</label>
          <select className="filter-select" value={filterStock} onChange={e => setFilterStock(e.target.value)}>
            <option value="all">Todos</option>
            <option value="in">Con stock</option>
            <option value="out">Sin stock</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Rareza</label>
          <select className="filter-select" value={filterRarity} onChange={e => setFilterRarity(e.target.value)}>
            <option value="all">Todas</option>
            {rarityOptions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="filter-group filter-group--search">
          <label className="filter-label">Buscar</label>
          <input
            className="filter-input"
            type="text"
            placeholder="Nombre del ítem..."
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
          />
        </div>

        <div className="items-count">
          <span className="items-count__num">{filteredItems.length}</span>
          <span className="items-count__label">ítems</span>
        </div>
      </div>

      {/* ── GRID ────────────────────────────────────────────────── */}
      <div className="items-grid">
        {filteredItems.map((item, index) => {
          const isEmpty = item.cantidad === 0;
          const rc      = rarityClass[item.rareza] ?? '';
          return (
            <div
              key={index}
              className={`item-card ${rc} ${isEmpty ? 'item-card--empty' : ''}`}
              onClick={() => setSelectedItem(item)}
            >
              {/* Rarity tag */}
              <div className={`item-card__rarity ${rc}`}>{item.rareza}</div>

              {/* Image */}
              <div className="item-card__img-wrap">
                {item.imagen
                  ? <img src={item.imagen} alt={item.nombre} className="item-card__img" />
                  : <span className="item-card__no-img">—</span>
                }
              </div>

              {/* Name */}
              <div className="item-card__name">{item.nombre}</div>

              {/* Stats */}
              <ul className="item-card__stats">
                {Object.entries(item.stats).map(([stat, value]) =>
                  value !== 0 ? (
                    <li key={stat} className="item-card__stat">
                      <span className="item-card__stat-key">{stat}</span>
                      <span className="item-card__stat-val">{value as number > 0 ? `+${value}` : value}</span>
                    </li>
                  ) : null
                )}
              </ul>

              {/* Stock */}
              <div className={`item-card__stock ${isEmpty ? 'item-card__stock--empty' : 'item-card__stock--ok'}`}>
                {isEmpty ? '✗ Sin stock' : `✦ ×${item.cantidad}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODAL ───────────────────────────────────────────────── */}
      {selectedItem && (
        <div className="modal-backdrop" onClick={() => setSelectedItem(null)}>
          <div className="modal-scroll" onClick={e => e.stopPropagation()}>

            {/* Scroll top ornament */}
            <div className="modal-scroll__cap modal-scroll__cap--top">
              <div className="modal-scroll__rod" />
            </div>

            <div className="modal-scroll__body">
              <div className={`modal-rarity ${rarityClass[selectedItem.rareza] ?? ''}`}>
                {selectedItem.rareza}
              </div>

              <h2 className="modal-title">{selectedItem.nombre}</h2>

              <div className="modal-rule">
                <span className="modal-rule__ornament">⚜</span>
              </div>

              {selectedItem.imagen && (
                <div className="modal-img-wrap">
                  <img src={selectedItem.imagen} alt={selectedItem.nombre} className="modal-img" />
                </div>
              )}

              {/* Effects */}
              <div className="modal-effects">
                {selectedItem.efecto.pasiva && (
                  <div className="modal-effect">
                    <span className="modal-effect__tag">Pasiva</span>
                    <p className="modal-effect__text">{selectedItem.efecto.pasiva}</p>
                  </div>
                )}
                {selectedItem.efecto.activa && (
                  <div className="modal-effect">
                    <span className="modal-effect__tag">Activa</span>
                    <p className="modal-effect__text">{selectedItem.efecto.activa}</p>
                  </div>
                )}
                {!selectedItem.efecto.pasiva && !selectedItem.efecto.activa && (
                  <p className="modal-no-effect">— Sin efectos registrados —</p>
                )}
              </div>

              {/* Stats */}
              <ul className="modal-stats">
                {Object.entries(selectedItem.stats).map(([stat, value]) =>
                  value !== 0 ? (
                    <li key={stat} className="modal-stat">
                      <span className="modal-stat__key">{stat}</span>
                      <span className="modal-stat__val">{(value as number) > 0 ? `+${value}` : value}</span>
                    </li>
                  ) : null
                )}
              </ul>
            </div>

            {/* Scroll bottom ornament */}
            <div className="modal-scroll__cap modal-scroll__cap--bottom">
              <div className="modal-scroll__rod" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Items;