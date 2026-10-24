import { useCallback, useMemo, useState } from 'react';
import { ITEMS, type Item } from '../../data/items';
import { DEFAULT_ITEM_FILTERS, matchesItemFilters, type ItemFilterState } from './filters';
import ItemCard from './ItemCard';
import ItemDetailModal from './ItemDetailModal';
import ItemFilters from './ItemFilters';
import './Items.css';

const Items = () => {
  const [filters, setFilters] = useState(DEFAULT_ITEM_FILTERS);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const visibleItems = useMemo(
    () => ITEMS.filter(item => matchesItemFilters(item, filters)),
    [filters],
  );

  const updateFilters = (patch: Partial<ItemFilterState>) => setFilters(prev => ({ ...prev, ...patch }));
  const closeModal = useCallback(() => setSelectedItem(null), []);

  return (
    <div className="items-root">
      <ItemFilters filters={filters} resultCount={visibleItems.length} onChange={updateFilters} />

      <div className="items-grid">
        {visibleItems.map(item => (
          <ItemCard key={item.nombre} item={item} onSelect={setSelectedItem} />
        ))}
      </div>

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={closeModal} />
      )}
    </div>
  );
};

export default Items;
