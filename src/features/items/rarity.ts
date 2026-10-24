export const RARITIES = ['Inicial', 'Basico', 'Epico', 'Legendario', 'Prismatico'];

const RARITY_CLASS: Record<string, string> = {
  Inicial:    'rarity--inicial',
  Basico:     'rarity--basico',
  Epico:      'rarity--epico',
  Legendario: 'rarity--legendario',
  Prismatico: 'rarity--prismatico',
};

export const rarityClass = (rarity: string): string => RARITY_CLASS[rarity] ?? '';
