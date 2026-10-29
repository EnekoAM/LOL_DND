import type { Item } from '../../data/items';
import { matchesSearch } from '../../lib/text';
import { rarityRank } from './rarity';
import { hasStat } from './stats';
import { itemAvailability } from './stock';

export const ALL = 'all';

/** Orden por defecto: rareza (Inicial…Pociones) y, dentro de cada una, coste. */
export const SORT_RAREZA_COSTE = 'rareza-coste';

export type StockFilter = typeof ALL | 'owned' | 'in' | 'out';

export type ItemFilterState = {
  stat: string;
  stock: StockFilter;
  rarity: string;
  search: string;
  sort: string;
};

export const DEFAULT_ITEM_FILTERS: ItemFilterState = {
  stat: ALL,
  stock: ALL,
  rarity: ALL,
  search: '',
  sort: SORT_RAREZA_COSTE,
};

const itemCost = (item: Item): number =>
  typeof item.coste === 'number' && Number.isFinite(item.coste) ? item.coste : Number.POSITIVE_INFINITY;

/** Stats numéricas; dados u otros textos no cuentan para el orden. */
const statSortValue = (item: Item, key: string): number => {
  const raw = item.stats[key];
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : Number.NEGATIVE_INFINITY;
};

const byName = (a: Item, b: Item): number => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

const byCoste = (a: Item, b: Item): number => itemCost(a) - itemCost(b);

const byRareza = (a: Item, b: Item): number => rarityRank(a.rareza) - rarityRank(b.rareza);

export const compareItems = (a: Item, b: Item, sort: string): number => {
  if (sort === SORT_RAREZA_COSTE) {
    return byRareza(a, b) || byCoste(a, b) || byName(a, b);
  }
  if (sort === 'coste') {
    return byCoste(a, b) || byName(a, b);
  }
  if (sort === 'rareza') {
    return byRareza(a, b) || byCoste(a, b) || byName(a, b);
  }
  if (sort === 'nombre') {
    return byName(a, b);
  }
  // Orden por estadística: de mayor a menor; sin valor numérico al final.
  const diff = statSortValue(b, sort) - statSortValue(a, sort);
  return diff || byCoste(a, b) || byName(a, b);
};

export const sortItems = (items: Item[], sort: string): Item[] =>
  [...items].sort((a, b) => compareItems(a, b, sort));

const matchesStock = (item: Item, stock: StockFilter): boolean => {
  const { owned, available } = itemAvailability(item);
  if (stock === 'owned') return owned > 0;
  if (stock === 'in') return available > 0;
  if (stock === 'out') return available <= 0;
  return true;
};

export const matchesItemFilters = (item: Item, filters: ItemFilterState): boolean =>
  (filters.stat === ALL || hasStat(item.stats[filters.stat])) &&
  matchesStock(item, filters.stock) &&
  (filters.rarity === ALL || item.rareza === filters.rarity) &&
  matchesSearch(item.nombre, filters.search);
