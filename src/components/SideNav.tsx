import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { AppRole } from '../data/appRole';
import { cx } from '../lib/cx';
import type { NavItem } from './AppHeader';
import './SideNav.css';

type Props<T extends string> = {
  items: NavItem<T>[];
  /** Escritorio: barra ancha con etiquetas (true) o solo iconos (false). */
  expanded: boolean;
  /** Movil: cajon abierto encima del contenido. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  role: AppRole;
  /** User: nombre del player o «Invitado». */
  identityName?: string | null;
  onChangeRole: () => void;
};

const SCROLL_STEP = 138; // ~3 items (42px + 4px gap)
const SCROLL_TOLERANCE = 2;

export default function SideNav<T extends string>({
  items,
  expanded,
  mobileOpen,
  onCloseMobile,
  role,
  identityName,
  onChangeRole,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollUp(false);
      setCanScrollDown(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollUp(scrollTop > SCROLL_TOLERANCE);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - SCROLL_TOLERANCE);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollHints();
    el.addEventListener('scroll', updateScrollHints, { passive: true });
    window.addEventListener('resize', updateScrollHints);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollHints) : null;
    ro?.observe(el);
    const list = el.querySelector('.side-nav__list');
    if (list) ro?.observe(list);

    return () => {
      el.removeEventListener('scroll', updateScrollHints);
      window.removeEventListener('resize', updateScrollHints);
      ro?.disconnect();
    };
  }, [items, expanded, mobileOpen, updateScrollHints]);

  const scrollByDir = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: dir * SCROLL_STEP, behavior: 'smooth' });
  };

  return (
    <>
      <div
        className={cx('side-nav__backdrop', mobileOpen && 'side-nav__backdrop--on')}
        aria-hidden="true"
        onClick={onCloseMobile}
      />
      <nav
        id="side-nav"
        className={cx('side-nav', expanded && 'side-nav--expanded', mobileOpen && 'side-nav--open')}
        aria-label="Secciones"
      >
        <div className="side-nav__crest" aria-hidden="true">
          <img className="side-nav__crest-mark" src="/logo.png" alt="" width="20" height="23" decoding="async" />
          <span className="side-nav__crest-text">LOL &middot; D&amp;D</span>
        </div>
        <div className="side-nav__rule" aria-hidden="true" />

        <div className="side-nav__scroll-wrap">
          <button
            type="button"
            className={cx('side-nav__scroll-hint', 'side-nav__scroll-hint--up', canScrollUp && 'side-nav__scroll-hint--visible')}
            aria-label="Ver secciones anteriores"
            tabIndex={canScrollUp ? 0 : -1}
            onClick={() => scrollByDir(-1)}
          >
            ▲
          </button>

          <div className="side-nav__scroll" ref={scrollRef}>
            <ul className="side-nav__list">
              {items.map(item => (
                <li key={item.id}>
                  <NavLink
                    to={`/${item.id}`}
                    title={item.label}
                    onClick={onCloseMobile}
                    className={({ isActive }) => cx('side-nav__link', isActive && 'side-nav__link--active')}
                  >
                    <span className="side-nav__icon" aria-hidden="true">{item.icon}</span>
                    <span className="side-nav__label">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className={cx('side-nav__scroll-hint', 'side-nav__scroll-hint--down', canScrollDown && 'side-nav__scroll-hint--visible')}
            aria-label="Ver mas secciones"
            tabIndex={canScrollDown ? 0 : -1}
            onClick={() => scrollByDir(1)}
          >
            ▼
          </button>
        </div>

        <div className="side-nav__footer">
          <div className="side-nav__rule" aria-hidden="true" />
          <button
            type="button"
            className="side-nav__role"
            title={role === 'admin' ? 'Cambiar rol' : 'Cambiar rol o player'}
            onClick={onChangeRole}
          >
            <span className="side-nav__icon" aria-hidden="true">{role === 'admin' ? '⚔' : '👤'}</span>
            <span className="side-nav__label">
              {role === 'admin' ? 'Admin' : identityName ? `User · ${identityName}` : 'User'}
              <span className="side-nav__role-hint">cambiar</span>
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
