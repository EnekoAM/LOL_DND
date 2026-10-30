import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Modal from '../../components/Modal';
import { craftItem, findItem, findItems, ITEMS, STAT_KEYS, type Item } from '../../data/items';
import { partyGold, subscribeParty } from '../../data/party';
import { useLiveRevision } from '../../data/live';
import { tradeShop, type ShopMode } from '../../data/shop';
import { cx } from '../../lib/cx';
import { matchesSearch } from '../../lib/text';
import { craftGold, craftSummary, recipeLines } from '../items/recipe';
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
  ATK_SPE_PCT: 'Vel. ataque',
  AB_SPE_PCT: 'Vel. habilidad',
  LETHALITY: 'Letalidad',
  MAGIC_PEN: 'Pen. mágica',
};

type CartLine = {
  nombre: string;
  cantidad: number;
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
  const [carts, setCarts] = useState<Record<ShopMode, CartLine[]>>({ compra: [], venta: [] });
  const [craftName, setCraftName] = useState<string | null>(null);
  const [stockRevision, setStockRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ mode: CounterMode; kind: 'ok' | 'error'; text: string } | null>(null);
  const gold = useSyncExternalStore(subscribeParty, partyGold);
  // Stock o equipo cambiados en otra pestaña: el carrito y los filtros se quedan como están.
  const liveRevision = useLiveRevision('items', 'players');

  useEffect(() => {
    if (mode === 'compra' && (isPrismatic(rarity) || (isStarter(rarity)))) setRarity('');
  }, [mode, rarity]);

  const catalog = useMemo(
    () => [...ITEMS].sort((a, b) => rarityRank(a.rareza) - rarityRank(b.rareza) || a.nombre.localeCompare(b.nombre, 'es')),
    [liveRevision],
  );

  const rarities = useMemo(() => {
    const present = new Set(
      catalog.filter(item => mode !== 'compra' || (!isPrismatic(item.rareza) && !isStarter(item.rareza))).map(item => item.rareza),
    );
    return [...present].sort((a, b) => rarityRank(a) - rarityRank(b) || a.localeCompare(b, 'es'));
  }, [catalog, mode]);

  const visibleItems = useMemo(() => catalog.filter(item => {
    if (rarity && item.rareza !== rarity) return false;
    if (statsOn.some(stat => !itemHasStat(item, stat))) return false;
    if (!matchesSearch(item.nombre, search)) return false;
    const stock = itemAvailability(item);
    if (mode === 'crafteo' && !canBeCrafted(item)) return false;
    if (mode === 'compra' && (itemPrice(item) <= 0 || isPrismatic(item.rareza) || isStarter(item.rareza))) return false;
    if (mode === 'venta' && stock.available <= 0) return false;
    if (onlyOwned && stock.owned <= 0) return false;
    return true;
  }), [catalog, rarity, statsOn, search, onlyOwned, mode, stockRevision]);

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
    if (mode === 'compra' && (isPrismatic(item.rareza) || isStarter(item.rareza))) return;
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

  const craftSelected = async () => {
    if (!selectedCraft || busy) return;
    const ingredients = recipeLines(selectedCraft.craftsFrom);
    const price = craftGold(selectedCraft, ingredients);
    const ready = ingredients.length > 0 && ingredients.every(line => line.available >= line.needed);
    if (!ready || price <= 0 || gold < price) return;
    setBusy(true);
    setNotice(null);
    try {
      await craftItem(selectedCraft.nombre);
      setStockRevision(revision => revision + 1);
      setNotice({ mode: 'crafteo', kind: 'ok', text: 'Crafteado' });
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
        <div className="shop-ledger">
          {visibleItems.length === 0 && (
            <p className="shop-empty">
              {mode === 'venta'
                ? 'No hay copias libres para vender.'
                : mode === 'crafteo'
                  ? 'No hay recetas con ese filtro.'
                  : 'No hay objetos con ese filtro.'}
            </p>
          )}
          {visibleItems.map(item => {
            const inCart = cart.find(line => line.nombre === item.nombre);
            const stock = itemAvailability(item);
            const capped = mode === 'venta' && (inCart?.cantidad ?? 0) >= stock.available;
            const picked = mode === 'crafteo' && selectedCraft?.nombre === item.nombre;
            const price = mode === 'crafteo'
              ? craftGold(item, recipeLines(item.craftsFrom))
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
                  ? <img src={item.imagen} alt="" />
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
                  <button type="button" className="shop-add" disabled={capped} onClick={() => addToCart(item)}>
                    {inCart ? `+1 · ${inCart.cantidad}` : 'Añadir'}
                  </button>
                )}
              </div>
            );
          })}
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
                  ? <img src={line.item.imagen} alt="" />
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
          <button
            type="button"
            className="shop-checkout"
            disabled={busy || cart.length === 0 || !canPay || oversell}
            onClick={() => { void checkout(); }}
          >
            {busy ? 'Cerrando' : mode === 'compra' ? 'Comprar' : 'Vender'}
          </button>
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
};

const CraftBench = ({ item, gold, busy, notice, onSelect, onCraft }: CraftBenchProps) => {
  if (!item) return <section className="shop-cart"><p className="shop-order__empty">Elige un objeto para craftear.</p></section>;

  const ingredients = recipeLines(item.craftsFrom);
  const buildsInto = findItems(item.craftsTo);
  const price = craftGold(item, ingredients);
  const canCraft = ingredients.length > 0 && ingredients.every(line => line.available >= line.needed);
  const canPay = price > 0 && gold >= price;
  const blockedByGear = ingredients.some(line => {
    const owned = line.item?.cantidad ?? 0;
    return line.available < line.needed && owned >= line.needed;
  });

  return (
    <section className="shop-cart shop-craft">
      <div className="shop-craft__head">
        {item.imagen
          ? <img src={item.imagen} alt={item.nombre} />
          : <span className="shop-ware__fallback">✦</span>}
        <div>
          <p className={cx('shop-ware__rarity', `shop-rarity--${raritySlug(item.rareza)}`)}>{item.rareza}</p>
          <h2 className="shop-cart__title">{item.nombre}</h2>
          <p className="shop-cart__hint">En el almacén ×{item.cantidad}</p>
        </div>
      </div>

      {ingredients.length > 0 && (
        <div>
          <p className="shop-craft__label">Se craftea desde</p>
          <div className="shop-craft__items">
            {ingredients.map(line => (
              <button
                key={line.name}
                type="button"
                className={cx('shop-craft__item', line.available < line.needed && 'shop-craft__item--short')}
                onClick={() => line.item && onSelect(line.item)}
              >
                {line.item?.imagen
                  ? <img src={line.item.imagen} alt={line.name} />
                  : <span className="shop-ware__fallback">?</span>}
                <CraftName name={line.name} />
                <span className="shop-craft__stock">{line.available}/{line.needed}</span>
              </button>
            ))}
          </div>
          <p className="shop-craft__cost">{craftSummary(item, ingredients)}</p>
          {canCraft && !canPay && (
            <p className="shop-cart__note shop-cart__note--error">
              Te faltan {formatGold(price - gold)} oro para craftear (tienes {formatGold(gold)}).
            </p>
          )}
          {blockedByGear && <p className="shop-cart__note">Las copias equipadas no se gastan.</p>}
          {notice && <p className={cx('shop-cart__note', `shop-cart__note--${notice.kind}`)}>{notice.text}</p>}
          <button type="button" className="shop-checkout" disabled={!canCraft || !canPay || busy} onClick={onCraft}>
            {busy ? 'Crafteando' : 'Craftear'}
          </button>
        </div>
      )}

      {buildsInto.length > 0 && (
        <div>
          <p className="shop-craft__label">Se craftea en</p>
          <div className="shop-craft__items">
            {buildsInto.map(result => (
              <button key={result.nombre} type="button" className="shop-craft__item" onClick={() => onSelect(result)}>
                {result.imagen
                  ? <img src={result.imagen} alt={result.nombre} />
                  : <span className="shop-ware__fallback">?</span>}
                <CraftName name={result.nombre} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default Tienda;
