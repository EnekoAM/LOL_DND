import { useState, type ComponentType } from 'react';
import AppHeader, { type NavItem } from './components/AppHeader';
import Calculos from './features/calculos/Calculos';
import Habilidades from './features/habilidades/Habilidades';
import Historial from './features/historial/Historial';
import ItemRoll from './features/item-roll/ItemRoll';
import Items from './features/items/Items';
import Tienda from './features/tienda/Tienda';
import './App.css';

type ScreenId = 'items' | 'tienda' | 'habilidades' | 'calculos' | 'item-roll' | 'historial';

type Screen = NavItem<ScreenId> & { Component: ComponentType };

const SCREENS: Screen[] = [
  { id: 'items',       label: 'Items',       icon: '⚔',  Component: Items },
  { id: 'tienda',      label: 'Tienda',      icon: '⚖',  Component: Tienda },
  { id: 'habilidades', label: 'Habilidades', icon: '✦',  Component: Habilidades },
  { id: 'calculos',    label: 'Calculos',    icon: '👤', Component: Calculos },
  { id: 'item-roll',   label: 'Item Roll',   icon: '🎲', Component: ItemRoll },
  { id: 'historial',   label: 'Historial',   icon: '📜', Component: Historial },
];

function App() {
  const [screenId, setScreenId] = useState<ScreenId>('items');
  const { Component: ActiveScreen } = SCREENS.find(screen => screen.id === screenId) ?? SCREENS[0];

  const changeScreen = (id: ScreenId) => {
    setScreenId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-root">
      <AppHeader navItems={SCREENS} activeId={screenId} onNavigate={changeScreen} />

      <main className="app-main">
        <ActiveScreen />
      </main>

      <div className="app-bg" aria-hidden="true" />
    </div>
  );
}

export default App;
