import type { Item } from '../../data/items';
import { matchesSearch } from '../../lib/text';
import { hasStat } from './stats';
import { itemAvailability } from './stock';

export const ALL = 'all';

export type StockFilter = typeof ALL | 'in' | 'out';

export type ItemFilterState = {
  stat: string;
  stock: StockFilter;
  rarity: string;
  search: string;
};

export const DEFAULT_ITEM_FILTERS: ItemFilterState = {
  stat: ALL,
  stock: ALL,
  rarity: ALL,
  search: '',
};

const matchesStock = (item: Item, stock: StockFilter): boolean => {
  const { available } = itemAvailability(item);
  if (stock === 'in') return available > 0;
  if (stock === 'out') return available <= 0;
  return true;
};

export const matchesItemFilters = (item: Item, filters: ItemFilterState): boolean =>
  (filters.stat === ALL || hasStat(item.stats[filters.stat])) &&
  matchesStock(item, filters.stock) &&
  (filters.rarity === ALL || item.rareza === filters.rarity) &&
  matchesSearch(item.nombre, filters.search);
