import { useCallback, useMemo, useState } from 'react';
import { findItem, ITEMS, type Item } from '../../data/items';
import { useLiveRevision } from '../../data/live';
import { DEFAULT_ITEM_FILTERS, matchesItemFilters, sortItems, type ItemFilterState } from './filters';
import ItemCard from './ItemCard';
import ItemDetailModal from './ItemDetailModal';
import ItemFilters from './ItemFilters';
import './Items.css';

const Items = () => {
  const [filters, setFilters] = useState(DEFAULT_ITEM_FILTERS);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  // Cambios guardados en otra pestaña (stock, definición o equipo de un jugador).
  const liveRevision = useLiveRevision('items', 'players');

  // revision obliga a recalcular la lista cuando se guarda un ítem (ITEMS se actualiza fuera de React).
  const visibleItems = useMemo(
    () => sortItems(ITEMS.filter(item => matchesItemFilters(item, filters)), filters.sort),
    [filters, revision, liveRevision],
  );
  const selectedItem = selectedName ? findItem(selectedName) ?? null : null;

  const updateFilters = (patch: Partial<ItemFilterState>) => setFilters(prev => ({ ...prev, ...patch }));
  const selectItem = useCallback((item: Item) => setSelectedName(item.nombre), []);
  const closeModal = useCallback(() => setSelectedName(null), []);
  const handleSaved = useCallback(() => setRevision(current => current + 1), []);

  return (
    <div className="items-root">
      <ItemFilters filters={filters} resultCount={visibleItems.length} onChange={updateFilters} />

      <div className="items-grid">
        {visibleItems.map(item => (
          <ItemCard key={item.nombre} item={item} onSelect={selectItem} />
        ))}
      </div>

      {selectedItem && (
        <ItemDetailModal
          key={selectedItem.nombre}
          item={selectedItem}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default Items;
