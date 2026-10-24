import { useState, type ComponentType } from 'react';
import AppHeader, { type NavItem } from './components/AppHeader';
import Calculos from './features/calculos/Calculos';
import Habilidades from './features/habilidades/Habilidades';
import ItemRoll from './features/item-roll/ItemRoll';
import Items from './features/items/Items';
import './App.css';

type ScreenId = 'items' | 'habilidades' | 'calculos' | 'item-roll';

type Screen = NavItem<ScreenId> & { Component: ComponentType };

const SCREENS: Screen[] = [
  { id: 'items',       label: 'Items',       icon: '⚔',  Component: Items },
  { id: 'habilidades', label: 'Habilidades', icon: '✦',  Component: Habilidades },
  { id: 'calculos',    label: 'Calculos',    icon: '👤', Component: Calculos },
  { id: 'item-roll',   label: 'Item Roll',   icon: '🎲', Component: ItemRoll },
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
