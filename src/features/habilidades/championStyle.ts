import type { AbilityKey } from '../../data/champions';

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  P: 'Pasiva',
  Q: 'Q',
  W: 'W',
  E: 'E',
  R: 'Ultimate',
};

export const ROLE_ICONS: Record<string, string> = {
  'Luchador': '⚔',
  'Mago':     '✦',
  'Tirador':  '◎',
  'Tanque':   '🛡',
  'Asesino':  '☽',
  'Soporte':  '❂',
};

const DEFAULT_REGION_COLOR = '#c9a84c';

const REGION_COLORS: Record<string, string> = {
  'Demacia':      '#2a4a8a',
  'Noxus':        '#8a1a1a',
  'Freljord':     '#2a7aaa',
  'Ionia':        '#9a3a6a',
  'Shurima':      '#c97a1a',
  'Zaun':         '#2a8a5a',
  'Piltover':     '#c9a84c',
  'Void':         '#7a2a9a',
  'Shadow Isles': '#2a6a4a',
  'Bilgewater':   '#1a6a8a',
  'Bandle City':  '#8a6a1a',
  'Ixtal':        '#3a7a2a',
  'Mount Targon': '#6a5a8a',
  'Runeterra':    '#6a5a3a',
};

export const regionColor = (region: string): string => REGION_COLORS[region] ?? DEFAULT_REGION_COLOR;
