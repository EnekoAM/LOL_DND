import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppHeader, { type NavItem } from './components/AppHeader';
import RolePicker from './components/RolePicker';
import SideNav from './components/SideNav';
import { type AppRole, clearAppRole, readAppRole, saveAppRole, screenAllowed } from './data/appRole';
import { AppRoleProvider } from './data/appRoleContext';
import { startLiveSync, useLiveRevision } from './data/live';
import Calculos from './features/calculos/Calculos';
import Habilidades from './features/habilidades/Habilidades';
import Historial from './features/historial/Historial';
import ItemRoll from './features/item-roll/ItemRoll';
import Dados from './features/dados/Dados';
import Items from './features/items/Items';
import Mapa from './features/mapa/Mapa';
import Players from './features/players/Players';
import Sugerencias from './features/sugerencias/Sugerencias';
import Tienda from './features/tienda/Tienda';
import './App.css';

type ScreenId = 'items' | 'tienda' | 'habilidades' | 'players' | 'calculos' | 'item-roll' | 'dados' | 'mapa' | 'historial' | 'sugerencias';

type Screen = NavItem<ScreenId> & { Component: ComponentType };

const SCREENS: Screen[] = [
  { id: 'items',       label: 'Items',       icon: '⚔',  Component: Items },
  { id: 'tienda',      label: 'Tienda',      icon: '⚖',  Component: Tienda },
  { id: 'habilidades', label: 'Habilidades', icon: '✦',  Component: Habilidades },
  { id: 'players',     label: 'Players',     icon: '👤', Component: Players },
  { id: 'calculos',    label: 'Calculos',    icon: '⚗',  Component: Calculos },
  { id: 'item-roll',   label: 'Item Roll',   icon: '🎲', Component: ItemRoll },
  { id: 'dados',       label: 'Dados',       icon: '⚀',  Component: Dados },
  { id: 'mapa',        label: 'Mapa',        icon: '🗺️', Component: Mapa },
  { id: 'historial',   label: 'Historial',   icon: '📜', Component: Historial },
  { id: 'sugerencias', label: 'Sugerencias', icon: '💡', Component: Sugerencias },
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
  const [role, setRole] = useState<AppRole | null>(() => readAppRole());
  const [navExpanded, setNavExpanded] = useState(() => localStorage.getItem(NAV_EXPANDED_KEY) !== '0');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const visibleScreens = useMemo(
    () => (role ? SCREENS.filter(screen => screenAllowed(role, screen.id)) : []),
    [role],
  );
  const defaultPath = visibleScreens[0] ? `/${visibleScreens[0].id}` : '/players';
  const current = visibleScreens.find(screen => location.pathname === `/${screen.id}`);

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

  const pickRole = useCallback((next: AppRole) => {
    saveAppRole(next);
    setRole(next);
  }, []);

  const changeRole = useCallback(() => {
    clearAppRole();
    setRole(null);
    setMobileNavOpen(false);
  }, []);

  // Repinta la pantalla cuando otra pestaña guarda algo (los datos viven fuera de React).
  useLiveRevision();

  useEffect(() => {
    startLiveSync();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  if (!role) {
    return <RolePicker onPick={pickRole} />;
  }

  return (
    <AppRoleProvider role={role}>
    <div className={navExpanded ? 'app-root app-root--nav-expanded' : 'app-root'}>
      <AppHeader
        current={current}
        menuOpen={isMobile ? mobileNavOpen : navExpanded}
        onToggleMenu={toggleMenu}
        canManageParty={role === 'admin'}
      />
      <SideNav
        items={visibleScreens}
        expanded={navExpanded}
        mobileOpen={mobileNavOpen}
        onCloseMobile={closeMobileNav}
        role={role}
        onChangeRole={changeRole}
      />

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to={defaultPath} replace />} />
          {visibleScreens.map(({ id, Component }) => (
            <Route key={id} path={`/${id}`} element={<Component />} />
          ))}
          <Route path="*" element={<Navigate to={defaultPath} replace />} />
        </Routes>
      </main>

      <div className="app-bg" aria-hidden="true" />
    </div>
    </AppRoleProvider>
  );
}

export default App;
