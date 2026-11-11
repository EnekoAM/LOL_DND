import { useCallback, useMemo, useState } from 'react';
import { findItem, ITEMS, type Item } from '../../data/items';
import { useLiveRevision } from '../../data/live';
import Pagination, { pageSlice } from '../../components/Pagination';
import { DEFAULT_ITEM_FILTERS, matchesItemFilters, sortItems, type ItemFilterState } from './filters';
import ItemCard from './ItemCard';
import ItemDetailModal from './ItemDetailModal';
import ItemFilters from './ItemFilters';
import NamedEffectsTable from './NamedEffectsTable';
import { namedEffectOnHit, useNamedEffectDescriptions } from '../../data/namedEffectDescriptions';
import './Items.css';

const Items = () => {
  const [view, setView] = useState<'items' | 'effects'>('items');
  const [filters, setFilters] = useState(DEFAULT_ITEM_FILTERS);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  // Cambios guardados en otra pestaña (stock, definición o equipo de un jugador).
  const liveRevision = useLiveRevision('items', 'players');

  // revision obliga a recalcular la lista cuando se guarda un ítem (ITEMS se actualiza fuera de React).
  const effectData = useNamedEffectDescriptions();
  const visibleItems = useMemo(
    () => sortItems(ITEMS.filter(item => matchesItemFilters(item, filters, id => namedEffectOnHit(effectData, id))), filters.sort),
    [filters, revision, liveRevision, effectData],
  );
  const pageItems = useMemo(() => pageSlice(visibleItems, page), [visibleItems, page]);
  const selectedItem = selectedName ? findItem(selectedName) ?? null : null;

  const updateFilters = (patch: Partial<ItemFilterState>) => {
    setFilters(prev => ({ ...prev, ...patch }));
    setPage(1);
  };
  const selectItem = useCallback((item: Item) => setSelectedName(item.nombre), []);
  const closeModal = useCallback(() => setSelectedName(null), []);
  const handleSaved = useCallback(() => setRevision(current => current + 1), []);

  const tabs = (
    <div className="items-tabs" role="tablist" aria-label="Objetos o efectos">
      {([['items', 'Objetos'], ['effects', 'Efectos']] as const).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          className={view === id ? 'items-tab items-tab--active' : 'items-tab'}
          onClick={() => setView(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (view === 'effects') {
    return (
      <div className="items-root">
        {tabs}
        <NamedEffectsTable />
      </div>
    );
  }

  return (
    <div className="items-root">
      {tabs}
      <ItemFilters filters={filters} resultCount={visibleItems.length} onChange={updateFilters} />

      <Pagination page={page} total={visibleItems.length} onChange={setPage} />

      <div className="items-grid">
        {pageItems.map(item => (
          <ItemCard key={item.nombre} item={item} onSelect={selectItem} version={`${revision}:${liveRevision}`} />
        ))}
      </div>

      <Pagination page={page} total={visibleItems.length} onChange={setPage} scrollOnChange />

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
