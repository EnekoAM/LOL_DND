import { STAT_KEYS } from '../../data/items';
import { ALL, type ItemFilterState, type StockFilter } from './filters';
import { RARITIES } from './rarity';

type Props = {
  filters: ItemFilterState;
  resultCount: number;
  onChange: (patch: Partial<ItemFilterState>) => void;
};

const ItemFilters = ({ filters, resultCount, onChange }: Props) => (
  <div className="items-filters">
    <div className="filter-group">
      <label className="filter-label">Atributo</label>
      <select className="filter-select" value={filters.stat} onChange={e => onChange({ stat: e.target.value })}>
        <option value={ALL}>Todos</option>
        {STAT_KEYS.map(stat => (
          <option key={stat} value={stat}>{stat}</option>
        ))}
      </select>
    </div>

    <div className="filter-group">
      <label className="filter-label">Stock</label>
      <select
        className="filter-select"
        value={filters.stock}
        onChange={e => onChange({ stock: e.target.value as StockFilter })}
      >
        <option value={ALL}>Todos</option>
        <option value="owned">Tienen</option>
        <option value="in">Disponibles</option>
        <option value="out">No disponibles</option>
      </select>
    </div>

    <div className="filter-group">
      <label className="filter-label">Rareza</label>
      <select className="filter-select" value={filters.rarity} onChange={e => onChange({ rarity: e.target.value })}>
        <option value={ALL}>Todas</option>
        {RARITIES.map(rarity => (
          <option key={rarity} value={rarity}>{rarity}</option>
        ))}
      </select>
    </div>

    <div className="filter-group filter-group--search">
      <label className="filter-label">Buscar</label>
      <input
        className="filter-input"
        type="text"
        placeholder="Nombre del ítem..."
        value={filters.search}
        onChange={e => onChange({ search: e.target.value })}
      />
    </div>

    <div className="items-count">
      <span className="items-count__num">{resultCount}</span>
      <span className="items-count__label">ítems</span>
    </div>
  </div>
);

export default ItemFilters;
