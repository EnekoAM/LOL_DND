import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Modal from '../../components/Modal';
import Pagination, { pageSlice } from '../../components/Pagination';
import ThumbImg from '../../components/ThumbImg';
import { craftItem, findItem, findItems, ITEMS, STAT_KEYS, type Item } from '../../data/items';
import { partyGold, subscribeParty } from '../../data/party';
import { useLiveRevision } from '../../data/live';
import { tradeShop, type ShopMode } from '../../data/shop';
import { cx } from '../../lib/cx';
import { matchesSearch } from '../../lib/text';
import { craftGold, recipeLines } from '../items/recipe';
import { planCraft, stockBagFromCatalog } from '../items/craftPlan';
import CraftTree from './CraftTree';
import { hasStat } from '../items/stats';
import { itemAvailability } from '../items/stock';
import './Tienda.css';

type CounterMode = ShopMode | 'crafteo';

const RARITY_ORDER = ['Inicial', 'Basico', 'Epico', 'Legendario', 'Prismatico', 'Botas'];

const STAT_LABELS: Record<string, string> = {
  HP: 'HP',
  AC: 'Armadura',
  MR: 'Res. mágica',
  MANA: 'Maná',
  AD: 'AD',
  AP: 'AP',
  CRIT_CHANCE: 'Prob. crítico',
  CRIT_DAMAGE: 'Daño crítico',
  SPE: 'Velocidad',
  'ATK spe': 'Vel. ataque',
  'Ab haste': 'Vel. habilidad',
  LETHALITY: 'Letalidad',
  MAGIC_PEN: 'Pen. mágica',
  'Armor pen %': 'Pen. armadura %',
  'Magic pen %': 'Pen. mágica %',
  'Heal & shield %': 'Poder cur./escudos %',
  'Tenacity %': 'Tenacidad %',
  'Slow resist %': 'Res. ralentización %',
  'Life steal %': 'Robo de vida %',
  'Omnivamp %': 'Omnisucción %',
  'Range': 'Rango de ataque',
  'HP regen': 'Regen. vida',
  'Mana regen': 'Regen. maná',
};

type CartLine = {
  nombre: string;
  cantidad: number;
};

const CARTS_KEY = 'lol-dnd:shop-carts';

const emptyCarts = (): Record<ShopMode, CartLine[]> => ({ compra: [], venta: [] });

const isCartLine = (value: unknown): value is CartLine =>
  !!value && typeof value === 'object'
  && typeof (value as CartLine).nombre === 'string'
  && typeof (value as CartLine).cantidad === 'number'
  && Number.isFinite((value as CartLine).cantidad)
  && (value as CartLine).cantidad >= 1;

const readSavedCarts = (): Record<ShopMode, CartLine[]> => {
  try {
    const raw = sessionStorage.getItem(CARTS_KEY);
    if (!raw) return emptyCarts();
    const parsed = JSON.parse(raw) as Partial<Record<ShopMode, unknown>>;
    const pick = (mode: ShopMode): CartLine[] => {
      const list = parsed[mode];
      if (!Array.isArray(list)) return [];
      return list.filter(isCartLine).map(line => ({
        nombre: line.nombre,
        cantidad: Math.min(99, Math.floor(line.cantidad)),
      }));
    };
    return { compra: pick('compra'), venta: pick('venta') };
  } catch {
    return emptyCarts();
  }
};

const rarityRank = (rareza: string): number => {
  const index = RARITY_ORDER.findIndex(name => name.toLowerCase() === rareza.toLowerCase());
  return index === -1 ? RARITY_ORDER.length : index;
};

const raritySlug = (rareza: string): string =>
  rareza.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '-');

const itemPrice = (item: Item | undefined): number =>
  typeof item?.coste === 'number' && Number.isFinite(item.coste) && item.coste > 0 ? item.coste : 0;

/** Los prismáticos no están en el mostrador de compra. La misma regla está en server/store.ts. */
const isPrismatic = (rareza: string): boolean =>
  rareza.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '') === 'prismatico';

const isStarter = (rareza: string): boolean =>
  rareza.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '') === 'inicial';

/** Las botas no se compran: se mejoran en crafteo. La misma regla esta en server/store.ts. */
const isBoots = (rareza: string): boolean =>
  rareza.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '') === 'botas';

/** La misma cuenta está en server/store.ts. El 70% se hace en enteros: 350 * 0.7 no es 245 en coma flotante. */
const sellPrice = (cost: number): number => Math.round((cost * 70) / 100);

const formatGold = (amount: number): string => amount.toLocaleString('es-ES');

const itemHasStat = (item: Item, stat: string): boolean => stat in item.stats && hasStat(item.stats[stat]);

const canBeCrafted = (item: Item): boolean => item.craftsFrom.some(name => name.trim() !== '');

const Tienda = () => {
  /** User y admin pueden comprar, vender y craftear. */
  const canUseShop = true;
  const [search, setSearch] = useState('');
  const [rarity, setRarity] = useState('');
  const [statsOn, setStatsOn] = useState<string[]>([]);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<CounterMode>('compra');
  const [carts, setCarts] = useState<Record<ShopMode, CartLine[]>>(readSavedCarts);
  const [craftName, setCraftName] = useState<string | null>(null);
  const [stockRevision, setStockRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<{ mode: CounterMode; kind: 'ok' | 'error'; text: string } | null>(null);
  const gold = useSyncExternalStore(subscribeParty, partyGold);
  // Stock o equipo cambiados en otra pestaña: el carrito y los filtros se quedan como están.
  const liveRevision = useLiveRevision('items', 'players');

  useEffect(() => {
    if (mode === 'compra' && (isPrismatic(rarity) || isStarter(rarity) || isBoots(rarity))) setRarity('');
  }, [mode, rarity]);

  useEffect(() => {
    try { sessionStorage.setItem(CARTS_KEY, JSON.stringify(carts)); } catch { /* ignore */ }
  }, [carts]);


  const catalog = useMemo(
    () => [...ITEMS].sort((a, b) => rarityRank(a.rareza) - rarityRank(b.rareza) || a.nombre.localeCompare(b.nombre, 'es')),
    [liveRevision],
  );

  const rarities = useMemo(() => {
    const present = new Set(
      catalog.filter(item => mode !== 'compra' || (!isPrismatic(item.rareza) && !isStarter(item.rareza) && !isBoots(item.rareza))).map(item => item.rareza),
    );
    return [...present].sort((a, b) => rarityRank(a) - rarityRank(b) || a.localeCompare(b, 'es'));
  }, [catalog, mode]);

  const visibleItems = useMemo(() => catalog.filter(item => {
    if (rarity && item.rareza !== rarity) return false;
    if (statsOn.some(stat => !itemHasStat(item, stat))) return false;
    if (!matchesSearch(item.nombre, search)) return false;
    const stock = itemAvailability(item);
    if (mode === 'crafteo' && !canBeCrafted(item)) return false;
    if (mode === 'compra' && (itemPrice(item) <= 0 || isPrismatic(item.rareza) || isStarter(item.rareza) || isBoots(item.rareza))) return false;
    if (mode === 'venta' && stock.available <= 0) return false;
    if (onlyOwned && stock.owned <= 0) return false;
    return true;
  }), [catalog, rarity, statsOn, search, onlyOwned, mode, stockRevision]);

  // Filtros, búsqueda o mostrador nuevos: vuelta a la primera página.
  useEffect(() => { setPage(1); }, [rarity, statsOn, search, onlyOwned, mode]);

  const pageItems = useMemo(() => pageSlice(visibleItems, page), [visibleItems, page]);

  const changePage = (next: number) => {
    setPage(next);
    ledgerRef.current?.scrollTo({ top: 0 });
  };

  const activeFilters = (rarity ? 1 : 0) + statsOn.length + (onlyOwned ? 1 : 0);

  const cart = mode === 'crafteo' ? [] : carts[mode];
  const selectedCraft = craftName ? findItem(craftName) ?? null : null;
  const lines = cart.map(line => {
    const item = findItem(line.nombre);
    const price = mode === 'venta' ? sellPrice(itemPrice(item)) : itemPrice(item);
    const available = item ? itemAvailability(item).available : 0;
    return { ...line, item, price, available, subtotal: price * line.cantidad };
  });
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const oversell = mode === 'venta' && lines.some(line => line.cantidad > line.available);
  const canPay = mode === 'venta' || gold >= total;
  const visibleNotice = notice?.mode === mode ? notice : null;

  const toggleStat = (stat: string) => {
    setStatsOn(current => current.includes(stat) ? current.filter(entry => entry !== stat) : [...current, stat]);
  };

  const clearFilters = () => {
    setRarity('');
    setStatsOn([]);
    setOnlyOwned(false);
  };

  const updateCart = (updater: (lines: CartLine[]) => CartLine[]) => {
    if (mode === 'crafteo') return;
    const shopMode = mode;
    setCarts(current => ({ ...current, [shopMode]: updater(current[shopMode]) }));
  };

  const addToCart = (item: Item) => {
    if (mode === 'compra' && (isPrismatic(item.rareza) || isStarter(item.rareza) || isBoots(item.rareza))) return;
    const available = itemAvailability(item).available;
    updateCart(current => {
      const existing = current.find(line => line.nombre === item.nombre);
      if (!existing) {
        if (mode === 'venta' && available < 1) return current;
        return [...current, { nombre: item.nombre, cantidad: 1 }];
      }
      const next = existing.cantidad + 1;
      if (next > 99 || (mode === 'venta' && next > available)) return current;
      return current.map(line => line.nombre === item.nombre ? { ...line, cantidad: next } : line);
    });
  };

  const setQuantity = (nombre: string, cantidad: number) => {
    updateCart(current => current.flatMap(line => {
      if (line.nombre !== nombre) return [line];
      const item = findItem(nombre);
      const cap = mode === 'venta' ? Math.min(99, item ? itemAvailability(item).available : 0) : 99;
      if (cantidad < 1) return [];
      return [{ ...line, cantidad: Math.min(cantidad, cap) }];
    }));
  };

  const clearCart = () => {
    if (mode === 'crafteo' || busy) return;
    updateCart(() => []);
  };

  const craftSelected = async (opts?: { buyMissing?: boolean }) => {
    if (!selectedCraft || busy) return;
    const plan = planCraft(selectedCraft, stockBagFromCatalog());
    const buyMissing = opts?.buyMissing === true;
    if (buyMissing) {
      if (!plan.canBuyAndCraft || plan.totalWithPurchases <= 0 || gold < plan.totalWithPurchases) return;
    } else {
      if (!plan.ok || plan.gold <= 0 || gold < plan.gold) return;
      const hasMissing = plan.tree
        ? (function walk(n: { missing: number; children: { missing: number; children: unknown[] }[] }): boolean {
          return n.missing > 0 || n.children.some(child => walk(child as typeof n));
        })(plan.tree)
        : false;
      if (hasMissing) return;
    }
    const charged = buyMissing ? plan.totalWithPurchases : plan.gold;
    setBusy(true);
    setNotice(null);
    try {
      await craftItem(selectedCraft.nombre, { recursive: true, buyMissing });
      setStockRevision(revision => revision + 1);
      setNotice({
        mode: 'crafteo',
        kind: 'ok',
        text: buyMissing
          ? `Comprado y crafteado · ${charged.toLocaleString('es-ES')} oro`
          : `Crafteado · ${charged.toLocaleString('es-ES')} oro`,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo craftear';
      setNotice({ mode: 'crafteo', kind: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  const checkout = async () => {
    if (mode === 'crafteo' || busy || cart.length === 0 || !canPay || oversell) return;
    setBusy(true);
    setNotice(null);
    try {
      await tradeShop(mode, cart.map(line => ({ nombre: line.nombre, cantidad: line.cantidad })));
      const shopMode = mode;
      setCarts(current => ({ ...current, [shopMode]: [] }));
      setStockRevision(revision => revision + 1);
      setNotice({ mode, kind: 'ok', text: mode === 'compra' ? 'Comprado' : 'Vendido' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cerrar el carrito';
      setNotice({ mode, kind: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shop">
      <header className="shop-bar">
        <div className="shop-bar__title">
          <span className="shop-bar__mark" aria-hidden="true">⚖</span>
          <div>
            <p className="shop-bar__kicker">Mostrador</p>
            <p className="shop-bar__count">{visibleItems.length} objetos</p>
          </div>
        </div>

        <div className="shop-mode" role="group" aria-label="Operación">
          <button type="button" className={cx('shop-mode__btn', mode === 'compra' && 'shop-mode__btn--active')} onClick={() => setMode('compra')}>
            Comprar
          </button>
          <button type="button" className={cx('shop-mode__btn', mode === 'venta' && 'shop-mode__btn--active')} onClick={() => setMode('venta')}>
            Vender
          </button>
          <button type="button" className={cx('shop-mode__btn', mode === 'crafteo' && 'shop-mode__btn--active')} onClick={() => setMode('crafteo')}>
            Crafteo
          </button>
        </div>

        <div className="shop-search-row">
          <div className="shop-search-wrap">
            <input
              className="shop-search"
              type="text"
              placeholder="Buscar en el mostrador"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" className="shop-search-clear" aria-label="Borrar búsqueda" title="Borrar" onClick={() => setSearch('')}>×</button>
            )}
          </div>
          <button
            type="button"
            className={cx('shop-filter-btn', activeFilters > 0 && 'shop-filter-btn--on')}
            onClick={() => setFiltersOpen(true)}
          >
            Filtros{activeFilters > 0 ? ` · ${activeFilters}` : ''}
          </button>
        </div>
      </header>

      {filtersOpen && (
        <Modal onClose={() => setFiltersOpen(false)} backdropClassName="shop-filter-backdrop" className="shop-filter-modal">
          <h2 className="shop-filter-modal__title">Filtros</h2>

          <label className="shop-filter-field">
            <span>Rareza</span>
            <select className="shop-filter-select" value={rarity} onChange={event => setRarity(event.target.value)}>
              <option value="">Todas</option>
              {rarities.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>

          <p className="shop-filter-modal__label">Estadísticas</p>
          <div className="shop-toggles">
            {STAT_KEYS.map(stat => {
              const on = statsOn.includes(stat);
              return (
                <button
                  key={stat}
                  type="button"
                  className={cx('shop-toggle', on && 'shop-toggle--on')}
                  role="switch"
                  aria-checked={on}
                  onClick={() => toggleStat(stat)}
                >
                  <span>{STAT_LABELS[stat] ?? stat}</span>
                  <span className="shop-switch" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={cx('shop-toggle', onlyOwned && 'shop-toggle--on')}
            role="switch"
            aria-checked={onlyOwned}
            onClick={() => setOnlyOwned(current => !current)}
          >
            <span>En el almacén</span>
            <span className="shop-switch" aria-hidden="true" />
          </button>

          <div className="shop-filter-modal__actions">
            <button type="button" className="shop-filter-clear" onClick={clearFilters} disabled={activeFilters === 0}>
              Limpiar
            </button>
            <button type="button" className="shop-checkout" onClick={() => setFiltersOpen(false)}>
              Listo
            </button>
          </div>
        </Modal>
      )}

      <div className="shop-layout">
        <div ref={ledgerRef} className="shop-ledger">
          {visibleItems.length === 0 && (
            <p className="shop-empty">
              {mode === 'venta'
                ? 'No hay copias libres para vender.'
                : mode === 'crafteo'
                  ? 'No hay recetas con ese filtro.'
                  : 'No hay objetos con ese filtro.'}
            </p>
          )}
          {pageItems.map(item => {
            const inCart = cart.find(line => line.nombre === item.nombre);
            const stock = itemAvailability(item);
            const capped = mode === 'venta' && (inCart?.cantidad ?? 0) >= stock.available;
            const picked = mode === 'crafteo' && selectedCraft?.nombre === item.nombre;
            const price = mode === 'crafteo'
              ? (() => { const p = planCraft(item, stockBagFromCatalog()); return p.ok ? p.gold : craftGold(item, recipeLines(item.craftsFrom)); })()
              : mode === 'venta'
                ? sellPrice(itemPrice(item))
                : itemPrice(item);
            return (
              <div
                key={item.nombre}
                className={cx('shop-ware', (inCart || picked) && 'shop-ware--active', mode === 'crafteo' && 'shop-ware--pick')}
                onClick={mode === 'crafteo' && canUseShop ? () => setCraftName(item.nombre) : undefined}
              >
                {item.imagen
                  ? <ThumbImg src={item.imagen} thumbWidth={96} alt="" />
                  : <span className="shop-ware__fallback">✦</span>}
                <span className="shop-ware__copy">
                  <span className="shop-ware__name">{item.nombre}</span>
                  <span className={cx('shop-ware__rarity', `shop-rarity--${raritySlug(item.rareza)}`)}>
                    {item.rareza}
                    {stock.owned > 0 ? ` · tienes ${stock.owned}` : ''}
                    {stock.equipped > 0 ? ` · libres ${stock.available}` : ''}
                  </span>
                </span>
                <span className="shop-ware__price">{formatGold(price)}</span>
                {mode !== 'crafteo' && canUseShop && (
                  <span className="shop-ware__actions">
                    {inCart && (
                      <button
                        type="button"
                        className="shop-add shop-add--remove"
                        onClick={event => { event.stopPropagation(); setQuantity(item.nombre, (inCart?.cantidad ?? 1) - 1); }}
                      >
                        Quitar
                      </button>
                    )}
                    <button
                      type="button"
                      className="shop-add"
                      disabled={capped}
                      onClick={event => { event.stopPropagation(); addToCart(item); }}
                    >
                      Añadir
                    </button>
                  </span>
                )}
              </div>
            );
          })}
          <Pagination page={page} total={visibleItems.length} onChange={changePage} />
        </div>

        {!canUseShop ? (
          <section className="shop-cart">
            <h2 className="shop-cart__title">Solo lectura</h2>
            <p className="shop-cart__hint">La tienda est� en solo lectura.</p>
          </section>
        ) : mode === 'crafteo' ? (
          <CraftBench
            item={selectedCraft}
            gold={gold}
            busy={busy}
            notice={visibleNotice}
            onSelect={next => setCraftName(next.nombre)}
            onCraft={() => { void craftSelected(); }}
            onBuyAndCraft={() => { void craftSelected({ buyMissing: true }); }}
          />
        ) : (
        <section className="shop-cart">
          <h2 className="shop-cart__title">Carrito</h2>
          {mode === 'venta' && <p className="shop-cart__hint">Se paga el 70% del coste. Las copias equipadas no se venden.</p>}
          {lines.length === 0 && <p className="shop-order__empty">El carrito está vacío.</p>}
          <ul className="shop-cart__lines">
            {lines.map(line => (
              <li key={line.nombre} className="shop-cart__line">
                {line.item?.imagen
                  ? <ThumbImg src={line.item.imagen} thumbWidth={96} alt="" />
                  : <span className="shop-ware__fallback">✦</span>}
                <div className="shop-cart__copy">
                  <span className="shop-ware__name">{line.nombre}</span>
                  <span className="shop-cart__sub">{formatGold(line.price)} × {line.cantidad}</span>
                </div>
                <div className="shop-qty">
                  <button type="button" aria-label={`Quitar una ${line.nombre}`} onClick={() => setQuantity(line.nombre, line.cantidad - 1)}>−</button>
                  <span>{line.cantidad}</span>
                  <button
                    type="button"
                    aria-label={`Añadir una ${line.nombre}`}
                    disabled={mode === 'venta' && line.cantidad >= line.available}
                    onClick={() => setQuantity(line.nombre, line.cantidad + 1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="shop-qty__trash"
                    aria-label={`Quitar todas las ${line.nombre}`}
                    title="Quitar todas"
                    onClick={() => setQuantity(line.nombre, 0)}
                  >
                    🗑
                  </button>
                </div>
                <span className="shop-cart__amount">{formatGold(line.subtotal)}</span>
              </li>
            ))}
          </ul>
          <p className="shop-cart__total">
            <span>{mode === 'compra' ? 'A pagar' : 'A cobrar'}</span>
            <strong>{formatGold(total)} oro</strong>
          </p>
          {mode === 'compra' && cart.length > 0 && (
            <p className={cx('shop-cart__note', !canPay && 'shop-cart__note--error')}>
              {canPay
                ? `Tras comprar te quedarían ${formatGold(gold - total)} oro.`
                : `Te faltan ${formatGold(total - gold)} oro para comprar todo (tienes ${formatGold(gold)}).`}
            </p>
          )}
          {oversell && <p className="shop-cart__note shop-cart__note--error">No hay tantas copias libres.</p>}
          {visibleNotice && (
            <p className={cx('shop-cart__note', `shop-cart__note--${visibleNotice.kind}`)}>{visibleNotice.text}</p>
          )}
                    <div className="shop-cart__actions">
            <button
              type="button"
              className="shop-cart-clear"
              disabled={busy || cart.length === 0}
              onClick={clearCart}
            >
              Vaciar carrito
            </button>
            <button
              type="button"
              className="shop-checkout"
              disabled={busy || cart.length === 0 || !canPay || oversell}
              onClick={() => { void checkout(); }}
            >
              {busy ? 'Cerrando' : mode === 'compra' ? 'Comprar' : 'Vender'}
            </button>
          </div>
        </section>
        )}
      </div>
    </div>
  );
};

const NAME_CYCLE_MS = 12000;

/** El mismo reloj para todas las fichas: el progreso sale de la hora, no de cuándo arrancó cada una. */
function marqueeAt(progress: number, shift: number): { x: number; opacity: number } {
  if (progress < 0.18) return { x: 0, opacity: 1 };
  if (progress < 0.62) return { x: -shift * ((progress - 0.18) / 0.44), opacity: 1 };
  if (progress < 0.8) return { x: -shift, opacity: 1 };
  if (progress < 0.82) return { x: -shift, opacity: 1 - (progress - 0.8) / 0.02 };
  if (progress < 0.84) return { x: 0, opacity: (progress - 0.82) / 0.02 };
  return { x: 0, opacity: 1 };
}

const CraftName = ({ name }: { name: string }) => {
  const frameRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const text = textRef.current;
    if (!frame || !text) return;

    const measure = () => {
      const overflow = Math.ceil(text.scrollWidth - frame.clientWidth);
      setShift(current => {
        const next = overflow > 2 ? overflow : 0;
        return current === next ? current : next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    const fonts = document.fonts;
    if (fonts) void fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [name]);

  useEffect(() => {
    const text = textRef.current;
    if (!text || shift <= 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const tick = () => {
      const progress = (performance.now() % NAME_CYCLE_MS) / NAME_CYCLE_MS;
      const { x, opacity } = marqueeAt(progress, shift);
      text.style.transform = `translateX(${x}px)`;
      text.style.opacity = opacity.toFixed(3);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      text.style.transform = '';
      text.style.opacity = '';
    };
  }, [shift]);

  return (
    <span ref={frameRef} className={cx('shop-craft__name', shift > 0 && 'shop-craft__name--slide')} title={name}>
      <span ref={textRef} className="shop-craft__name-text">{name}</span>
    </span>
  );
};

type CraftBenchProps = {
  item: Item | null;
  gold: number;
  busy: boolean;
  notice: { kind: 'ok' | 'error'; text: string } | null;
  onSelect: (item: Item) => void;
  onCraft: () => void;
  onBuyAndCraft: () => void;
};

const CraftBench = ({ item, gold, busy, notice, onSelect, onCraft, onBuyAndCraft }: CraftBenchProps) => {
  const [confirmBuy, setConfirmBuy] = useState(false);

  useEffect(() => {
    setConfirmBuy(false);
  }, [item?.nombre]);

  if (!item) return <section className="shop-cart"><p className="shop-order__empty">Elige un objeto para craftear.</p></section>;

  const ingredients = recipeLines(item.craftsFrom);
  const buildsInto = findItems(item.craftsTo);
  const plan = planCraft(item, stockBagFromCatalog());
  const price = plan.ok ? plan.gold : craftGold(item, ingredients);
  const hasMissing = plan.tree
    ? (function walk(n: { missing: number; children: { missing: number; children: unknown[] }[] }): boolean {
        return n.missing > 0 || n.children.some(child => walk(child as typeof n));
      })(plan.tree)
    : ingredients.some(line => line.available < line.needed);
  const canCraft = plan.ok && !hasMissing && ingredients.length > 0;
  const canPay = price > 0 && gold >= price;
  const buyTotal = plan.totalWithPurchases;
  const canBuyAndCraft = plan.canBuyAndCraft && buyTotal > 0;
  const canPayBuy = canBuyAndCraft && gold >= buyTotal;
  const blockedByGear = ingredients.some(line => {
    const owned = line.item?.cantidad ?? 0;
    return line.available < line.needed && owned >= line.needed;
  });

  const renderStepBits = (step: (typeof plan.steps)[number]): string => {
    const bits: string[] = [];
    if (step.difference > 0) bits.push(`diferencia ${step.difference.toLocaleString('es-ES')}`);
    if (step.fee > 0) bits.push(`10% ${step.fee.toLocaleString('es-ES')}`);
    return bits.length > 0 ? ` (${bits.join(' + ')})` : '';
  };

  return (
    <section className="shop-cart shop-craft">
      <div className="shop-craft__head">
        {item.imagen
          ? <ThumbImg src={item.imagen} thumbWidth={128} alt={item.nombre} />
          : <span className="shop-ware__fallback">✦</span>}
        <div>
          <p className={cx('shop-ware__rarity', `shop-rarity--${raritySlug(item.rareza)}`)}>{item.rareza}</p>
          <h2 className="shop-cart__title">{item.nombre}</h2>
          <p className="shop-cart__hint">En el almacén ×{item.cantidad}</p>
        </div>
      </div>

      {ingredients.length > 0 && (
        <div>
          {plan.tree && (
            <CraftTree
              tree={plan.tree}
              selectedName={item.nombre}
              onSelect={name => { const next = findItem(name); if (next) onSelect(next); }}
            />
          )}

          <p className="shop-craft__label">Ingredientes directos</p>
          <div className="shop-craft__items">
            {ingredients.map(line => (
              <button
                key={line.name}
                type="button"
                className={cx('shop-craft__item', line.available < line.needed && 'shop-craft__item--short')}
                onClick={() => line.item && onSelect(line.item)}
              >
                {line.item?.imagen
                  ? <ThumbImg src={line.item.imagen} thumbWidth={128} alt={line.name} />
                  : <span className="shop-ware__fallback">?</span>}
                <span className="shop-craft__label-name" title={line.name}>{line.name}</span>
                <span className="shop-craft__stock">{line.available}/{line.needed}</span>
              </button>
            ))}
          </div>

          {plan.ok && (
            <p className="shop-craft__cost">
              Coste con crédito de almacén: {price.toLocaleString('es-ES')} oro
            </p>
          )}

          {(plan.ok || canBuyAndCraft) && plan.steps.length > 0 && (
            <ul className="shop-craft__breakdown">
              {plan.credits.length > 0 && (
                <li>
                  Crédito almacén: {plan.credits.map(c => `${c.name}×${c.qty} (${c.totalCost.toLocaleString('es-ES')})`).join(', ')}
                  {' '}· {plan.ownedCredit.toLocaleString('es-ES')} oro
                </li>
              )}
              {canBuyAndCraft && plan.purchases.length > 0 && (
                <li>
                  Comprar: {plan.purchases.map(p => `${p.name}×${p.qty} (${p.totalCost.toLocaleString('es-ES')})`).join(', ')}
                  {' '}· {plan.buyGold.toLocaleString('es-ES')} oro
                </li>
              )}
              {plan.steps.map(step => (
                <li key={`${step.item.nombre}-${step.role}-${step.goldEach}`}>
                  {step.copies}× {step.item.nombre}: {step.goldTotal.toLocaleString('es-ES')} oro
                  {renderStepBits(step)}
                  {step.ingredients.some(i => i.fromStock > 0) && (
                    <span> · usa stock: {step.ingredients.filter(i => i.fromStock > 0).map(i => `${i.name}×${i.fromStock}`).join(', ')}</span>
                  )}
                </li>
              ))}
              <li>
                <strong>
                  Total {(plan.ok ? plan.gold : buyTotal).toLocaleString('es-ES')} oro
                  {!plan.ok && canBuyAndCraft ? ' (compra + crafteo)' : ''}
                </strong>
              </li>
            </ul>
          )}

          {plan.cheaperDirect && canBuyAndCraft && (
            <p className="shop-cart__note">
              Sale más barato comprarlo directo ({plan.directBuyGold.toLocaleString('es-ES')} oro).
            </p>
          )}

          {canCraft && !canPay && (
            <p className="shop-cart__note shop-cart__note--error">
              Te faltan {formatGold(price - gold)} oro para craftear (tienes {formatGold(gold)}).
            </p>
          )}
          {canBuyAndCraft && !canPayBuy && (
            <p className="shop-cart__note shop-cart__note--error">
              Te faltan {formatGold(buyTotal - gold)} oro para comprar y craftear (tienes {formatGold(gold)}).
            </p>
          )}
          {blockedByGear && <p className="shop-cart__note">Las copias equipadas no se gastan.</p>}
          {!plan.ok && !canBuyAndCraft && plan.reason && (
            <p className="shop-cart__note shop-cart__note--error">{plan.reason}</p>
          )}
          {notice && <p className={cx('shop-cart__note', `shop-cart__note--${notice.kind}`)}>{notice.text}</p>}

          {confirmBuy && canBuyAndCraft ? (
            <div className="shop-craft__confirm">
              <p className="shop-craft__label">Confirmar compra + crafteo</p>
              <ul className="shop-craft__breakdown">
                {plan.purchases.map(p => (
                  <li key={p.name}>Comprar {p.qty}× {p.name}: {p.totalCost.toLocaleString('es-ES')} oro</li>
                ))}
                {plan.steps.map(step => (
                  <li key={`c-${step.item.nombre}-${step.role}`}>
                    Craftear {step.copies}× {step.item.nombre}: {step.goldTotal.toLocaleString('es-ES')} oro
                    {renderStepBits(step)}
                  </li>
                ))}
                <li><strong>Total {buyTotal.toLocaleString('es-ES')} oro</strong></li>
              </ul>
              {plan.cheaperDirect && (
                <p className="shop-cart__note">
                  Sale más barato comprarlo directo ({plan.directBuyGold.toLocaleString('es-ES')} oro).
                </p>
              )}
              <div className="shop-craft__confirm-actions">
                <button
                  type="button"
                  className="shop-checkout"
                  disabled={!canPayBuy || busy}
                  onClick={() => { setConfirmBuy(false); onBuyAndCraft(); }}
                >
                  {busy ? 'Crafteando' : `Confirmar · ${formatGold(buyTotal)} oro`}
                </button>
                <button
                  type="button"
                  className="shop-checkout shop-checkout--ghost"
                  disabled={busy}
                  onClick={() => setConfirmBuy(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              {canCraft && (
                <button type="button" className="shop-checkout" disabled={!canPay || busy} onClick={onCraft}>
                  {busy ? 'Crafteando' : `Craftear · ${formatGold(price)} oro`}
                </button>
              )}
              {canBuyAndCraft && (
                <button
                  type="button"
                  className={cx('shop-checkout', canCraft && 'shop-checkout--secondary')}
                  disabled={!canPayBuy || busy}
                  onClick={() => setConfirmBuy(true)}
                >
                  Comprar lo que falta y craftear · {formatGold(buyTotal)} oro
                </button>
              )}
            </>
          )}
        </div>
      )}

      {buildsInto.length > 0 && (
        <div>
          <p className="shop-craft__label">Se craftea en</p>
          <div className="shop-craft__items">
            {buildsInto.map(result => (
              <button key={result.nombre} type="button" className="shop-craft__item" onClick={() => onSelect(result)}>
                {result.imagen
                  ? <ThumbImg src={result.imagen} thumbWidth={128} alt={result.nombre} />
                  : <span className="shop-ware__fallback">✦</span>}
                <span className="shop-craft__label-name" title={result.nombre}>{result.nombre}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default Tienda;
