import type { LootRarity } from '../../data/loot';

export const RARITY_STYLE: Record<LootRarity, { color: string; glow: string; badge: string }> = {
  basico: {
    color: '#a09070',
    glow: '0 0 12px rgba(150,120,80,0.4),  0 0 36px rgba(150,120,80,0.12)',
    badge: 'COMÚN',
  },
  epico: {
    color: '#8898e8',
    glow: '0 0 16px rgba(100,120,220,0.55), 0 0 48px rgba(80,100,200,0.2)',
    badge: 'ÉPICO',
  },
  legendario: {
    color: '#c9a84c',
    glow: '0 0 20px rgba(201,168,76,0.75),  0 0 60px rgba(201,168,76,0.28)',
    badge: 'LEGENDARIO',
  },
};
