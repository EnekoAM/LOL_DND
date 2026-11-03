import { Suspense, lazy, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppHeader, { type NavItem } from './components/AppHeader';
import RolePicker from './components/RolePicker';
import SideNav from './components/SideNav';
import {
  type AppIdentity,
  type AppRole,
  clearAppIdentity,
  clearAppRole,
  identityLabel,
  readAppIdentity,
  readAppRole,
  saveAppIdentity,
  saveAppRole,
  screenAllowed,
} from './data/appRole';
import { AppRoleProvider } from './data/appRoleContext';
import { startLiveSync, subscribeLive, useLiveRevision, useLiveRevisionOf, type LiveResource } from './data/live';
import { partyAumentosForPlayers, subscribeParty } from './data/party';
import { PLAYERS, findPlayer, openPlayerSheet } from './data/players';
import Aumentos from './features/aumentos/Aumentos';
import Calculos from './features/calculos/Calculos';
import Eventos from './features/eventos/Eventos';
import Historial from './features/historial/Historial';
import ItemRoll from './features/item-roll/ItemRoll';
import Items from './features/items/Items';
import Mecanicas from './features/mecanicas/Mecanicas';
import Npcs from './features/npcs/Npcs';
import Players from './features/players/Players';
import Sugerencias from './features/sugerencias/Sugerencias';
import './App.css';

// Pantallas pesadas (Leaflet, dados 3D, tienda) en su propio chunk: solo se bajan al abrirlas.
const Dados = lazy(() => import('./features/dados/Dados'));
const Mapa = lazy(() => import('./features/mapa/Mapa'));
const Tienda = lazy(() => import('./features/tienda/Tienda'));

type ScreenId = 'items' | 'tienda' | 'players' | 'champions' | 'npcs' | 'aumentos' | 'item-roll' | 'dados' | 'mapa' | 'eventos' | 'mecanicas' | 'historial' | 'sugerencias';

type Screen = NavItem<ScreenId> & {
  Component: ComponentType;
  /**
   * Recursos en vivo que lee la pantalla (los datos viven fuera de React): si otra pestaña cambia
   * uno, se repinta solo esa pantalla, no toda la app.
   */
  live: LiveResource[];
};

const SCREENS: Screen[] = [
  { id: 'items',       label: 'Items',       icon: '⚔',  Component: Items, live: ['items', 'players'] },
  { id: 'tienda',      label: 'Tienda',      icon: '⚖',  Component: Tienda, live: ['items', 'players'] },
  { id: 'players',     label: 'Players',     icon: '👤', Component: Players, live: ['players', 'items', 'champions', 'roles', 'augments', 'relations', 'npcs'] },
  { id: 'champions',   label: 'Campeones',   icon: '✦',  Component: Calculos, live: ['champions', 'items', 'players', 'roles', 'relations', 'npcs'] },
  { id: 'npcs',        label: 'NPCs',        icon: '🐉', Component: Npcs, live: ['npcs', 'champions', 'relations', 'players'] },
  { id: 'aumentos',    label: 'Aumentos',    icon: '✨',  Component: Aumentos, live: ['augments', 'players'] },
  { id: 'item-roll',   label: 'Item Roll',   icon: '💎', Component: ItemRoll, live: ['loot', 'items', 'players'] },
  { id: 'dados',       label: 'Dados',       icon: '🎲', Component: Dados, live: [] },
  { id: 'mapa',        label: 'Mapa',        icon: '🗺️', Component: Mapa, live: ['mapPois'] },
  { id: 'eventos',     label: 'Eventos',     icon: '📅', Component: Eventos, live: ['events'] },
  { id: 'mecanicas',   label: 'Mecánicas',   icon: '📖', Component: Mecanicas, live: ['faq'] },
  { id: 'historial',   label: 'Historial',   icon: '📜', Component: Historial, live: ['history', 'items', 'players'] },
  { id: 'sugerencias', label: 'Sugerencias', icon: '💡', Component: Sugerencias, live: ['tickets'] },
];

const NAV_EXPANDED_KEY = 'lol-dnd:sidenav-expanded';
const MOBILE_QUERY = '(max-width: 768px)';

/** Redirige /calculos/<resto> a /champions/<resto> conservando ?query y #hash. */
function LegacyChampionsRedirect() {
  const rest = useParams()['*'] ?? '';
  const { search, hash } = useLocation();
  return <Navigate to={`/champions${rest ? `/${rest}` : ''}${search}${hash}`} replace />;
}

/** Pantalla de la ruta: se suscribe solo a sus recursos en vivo y carga en diferido si es lazy. */
function LiveScreen({ Component, live }: Pick<Screen, 'Component' | 'live'>) {
  useLiveRevisionOf(live);
  return (
    <Suspense fallback={<div className="app-route-loading" role="status">Cargando…</div>}>
      <Component />
    </Suspense>
  );
}

/** RolePicker con la lista de players al día (si otra pestaña añade o renombra alguno). */
function LiveRolePicker(props: Omit<Parameters<typeof RolePicker>[0], 'players'>) {
  useLiveRevision('players');
  return <RolePicker {...props} players={PLAYERS} />;
}

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
  const navigate = useNavigate();
  const [role, setRole] = useState<AppRole | null>(() => readAppRole());
  const [identity, setIdentity] = useState<AppIdentity | null>(() => readAppIdentity());
  // User sin player elegido (o su player ya no existe): toca elegir otra vez «¿Quién eres?».
  // Solo repinta App si cambia que el player elegido exista (no con cada cambio de players).
  const identityPlayer = identity?.kind === 'player' ? identity.name : null;
  const identityPlayerExists = useSyncExternalStore(
    subscribeLive,
    () => identityPlayer === null || !!findPlayer(identityPlayer),
  );
  const needsIdentity = role === 'user'
    && (!identity || (identity.kind === 'player' && !identityPlayerExists));
  const [navExpanded, setNavExpanded] = useState(() => localStorage.getItem(NAV_EXPANDED_KEY) !== '0');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Aumentos: el admin siempre la ve; los players solo cuando el admin la habilita.
  const aumentosForPlayers = useSyncExternalStore(subscribeParty, partyAumentosForPlayers);

  const visibleScreens = useMemo(
    () => (role
      ? SCREENS.filter(screen =>
        screenAllowed(role, screen.id) && (screen.id !== 'aumentos' || role === 'admin' || aumentosForPlayers))
      : []),
    [role, aumentosForPlayers],
  );
  const defaultPath = visibleScreens[0] ? `/${visibleScreens[0].id}` : '/players';
  const current = visibleScreens.find(screen =>
    location.pathname === `/${screen.id}` || location.pathname.startsWith(`/${screen.id}/`));

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

  const pickRole = useCallback((next: AppRole, who: AppIdentity | null) => {
    saveAppRole(next);
    setRole(next);
    if (next === 'user' && who) {
      // Se guarda el nombre tal cual está en la lista de players.
      const resolved: AppIdentity = who.kind === 'player' ? { kind: 'player', name: findPlayer(who.name)?.name ?? who.name } : who;
      saveAppIdentity(resolved);
      setIdentity(resolved);
      if (resolved.kind === 'player') {
        // Entra directo a su ficha.
        openPlayerSheet(resolved.name);
        navigate('/players');
      }
    } else {
      clearAppIdentity();
      setIdentity(null);
    }
  }, [navigate]);

  const changeRole = useCallback(() => {
    clearAppRole();
    clearAppIdentity();
    setRole(null);
    setIdentity(null);
    setMobileNavOpen(false);
  }, []);

  const openMySheet = useCallback(() => {
    if (identity?.kind !== 'player') return;
    openPlayerSheet(identity.name);
    navigate('/players');
  }, [identity, navigate]);

  useEffect(() => {
    startLiveSync();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  if (!role || needsIdentity) {
    return <LiveRolePicker onPick={pickRole} startStep={needsIdentity ? 'player' : 'role'} />;
  }

  const who = role === 'user' ? identity : null;

  return (
    <AppRoleProvider role={role} identity={who}>
    <div className={navExpanded ? 'app-root app-root--nav-expanded' : 'app-root'}>
      <AppHeader
        current={current}
        menuOpen={isMobile ? mobileNavOpen : navExpanded}
        onToggleMenu={toggleMenu}
        canManageParty={role === 'admin'}
        identityName={identityLabel(who)}
        isGuest={who?.kind === 'guest'}
        onOpenMySheet={who?.kind === 'player' ? openMySheet : undefined}
      />
      <SideNav
        items={visibleScreens}
        expanded={navExpanded}
        mobileOpen={mobileNavOpen}
        onCloseMobile={closeMobileNav}
        role={role}
        identityName={identityLabel(who)}
        onChangeRole={changeRole}
      />

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to={defaultPath} replace />} />
          <Route path="/habilidades" element={<Navigate to="/champions" replace />} />
          {/* Ruta antigua de Campeones: /calculos[/...] → /champions[/...]. */}
          <Route path="/calculos/*" element={<LegacyChampionsRedirect />} />
          {/* /* para sub-rutas (p. ej. la ficha de un NPC en /npcs/<región>/<tipo>/<nombre>). */}
          {visibleScreens.map(({ id, Component, live }) => (
            <Route key={id} path={`/${id}/*`} element={<LiveScreen Component={Component} live={live} />} />
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
