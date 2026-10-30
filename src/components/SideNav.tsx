import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
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
};

export default function SideNav<T extends string>({
  items,
  expanded,
  mobileOpen,
  onCloseMobile,
}: Props<T>) {
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

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
          <span className="side-nav__crest-mark">{'\u269C'}</span>
          <span className="side-nav__crest-text">LOL &middot; D&amp;D</span>
        </div>
        <div className="side-nav__rule" aria-hidden="true" />

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

      </nav>
    </>
  );
}
