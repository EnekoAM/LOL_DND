import { useSyncExternalStore } from 'react';
import { PARTY, partyGold, subscribeParty } from '../data/party';
import { cx } from '../lib/cx';
import './AppHeader.css';

export type NavItem<T extends string> = {
  id: T;
  label: string;
  icon: string;
};

type Props<T extends string> = {
  navItems: NavItem<T>[];
  activeId: T;
  onNavigate: (id: T) => void;
};

export default function AppHeader<T extends string>({ navItems, activeId, onNavigate }: Props<T>) {
  const gold = useSyncExternalStore(subscribeParty, partyGold);
  const expPercent = (PARTY.exp / PARTY.expToNextLevel) * 100;

  return (
    <header className="app-header">
      <div className="header-stats">
        <div className="stat-gold">
          <span className="stat-gold__coin">⚜</span>
          <span className="stat-gold__amount">{gold.toLocaleString()}</span>
          <span className="stat-gold__label">oro</span>
        </div>

        <div className="header-divider" />

        <div className="stat-exp">
          <div className="stat-exp__label">
            <span className="stat-exp__nivel">Nivel {PARTY.level}</span>
            <span className="stat-exp__values">{PARTY.exp} / {PARTY.expToNextLevel} exp</span>
          </div>
          <div className="stat-exp__track">
            <div className="stat-exp__fill" style={{ width: `${expPercent}%` }} />
            <div className="stat-exp__glow" style={{ width: `${expPercent}%` }} />
          </div>
        </div>
      </div>

      <nav className="header-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={cx('nav-btn', item.id === activeId && 'nav-btn--active')}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-btn__icon">{item.icon}</span>
            <span className="nav-btn__label">{item.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
