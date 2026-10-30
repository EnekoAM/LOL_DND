import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppHeader, { type NavItem } from './components/AppHeader';
import SideNav from './components/SideNav';
import { startLiveSync, useLiveRevision } from './data/live';
import Calculos from './features/calculos/Calculos';
import Habilidades from './features/habilidades/Habilidades';
import Historial from './features/historial/Historial';
import ItemRoll from './features/item-roll/ItemRoll';
import Dados from './features/dados/Dados';
import Items from './features/items/Items';
import Players from './features/players/Players';
import Tienda from './features/tienda/Tienda';
import './App.css';

type ScreenId = 'items' | 'tienda' | 'habilidades' | 'players' | 'calculos' | 'item-roll' | 'dados' | 'historial';

type Screen = NavItem<ScreenId> & { Component: ComponentType };

const SCREENS: Screen[] = [
  { id: 'items',       label: 'Items',       icon: '⚔',  Component: Items },
  { id: 'tienda',      label: 'Tienda',      icon: '⚖',  Component: Tienda },
  { id: 'habilidades', label: 'Habilidades', icon: '✦',  Component: Habilidades },
  { id: 'players',     label: 'Players',     icon: '👤', Component: Players },
  { id: 'calculos',    label: 'Calculos',    icon: '⚗',  Component: Calculos },
  { id: 'item-roll',   label: 'Item Roll',   icon: '🎲', Component: ItemRoll },
  { id: 'dados',       label: 'Dados',       icon: '⚀',  Component: Dados },
  { id: 'historial',   label: 'Historial',   icon: '📜', Component: Historial },
];

const NAV_EXPANDED_KEY = 'lol-dnd:sidenav-expanded';
const MOBILE_QUERY = '(max-width: 768px)';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

function App() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [navExpanded, setNavExpanded] = useState(() => localStorage.getItem(NAV_EXPANDED_KEY) !== '0');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const current = SCREENS.find(screen => location.pathname === `/${screen.id}`);

  useEffect(() => {
    localStorage.setItem(NAV_EXPANDED_KEY, navExpanded ? '1' : '0');
  }, [navExpanded]);

  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  const toggleMenu = useCallback(() => {
    if (isMobile) setMobileNavOpen(open => !open);
    else setNavExpanded(open => !open);
  }, [isMobile]);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  // Repinta la pantalla cuando otra pestaña guarda algo (los datos viven fuera de React).
  useLiveRevision();

  useEffect(() => {
    startLiveSync();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className={navExpanded ? 'app-root app-root--nav-expanded' : 'app-root'}>
      <AppHeader
        current={current}
        menuOpen={isMobile ? mobileNavOpen : navExpanded}
        onToggleMenu={toggleMenu}
      />
      <SideNav
        items={SCREENS}
        expanded={navExpanded}
        mobileOpen={mobileNavOpen}
        onCloseMobile={closeMobileNav}
      />

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/items" replace />} />
          {SCREENS.map(({ id, Component }) => (
            <Route key={id} path={`/${id}`} element={<Component />} />
          ))}
          <Route path="*" element={<Navigate to="/items" replace />} />
        </Routes>
      </main>

      <div className="app-bg" aria-hidden="true" />
    </div>
  );
}

export default App;
