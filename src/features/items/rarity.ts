export const RARITIES = [
  'Inicial',
  'Basico',
  'Epico',
  'Legendario',
  'Prismatico',
  'Botas',
  'Pociones',
];

const RARITY_CLASS: Record<string, string> = {
  Inicial:    'rarity--inicial',
  Basico:     'rarity--basico',
  Epico:      'rarity--epico',
  Legendario: 'rarity--legendario',
  Prismatico: 'rarity--prismatico',
  Botas:      'rarity--botas',
  Pociones:   'rarity--pociones',
};

const rarityKey = (rarity: string): string =>
  rarity.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const RARITY_RANK = new Map(RARITIES.map((name, index) => [rarityKey(name), index]));

/** Posición en el orden de rareza del catálogo; rarezas desconocidas al final. */
export const rarityRank = (rarity: string): number =>
  RARITY_RANK.get(rarityKey(rarity)) ?? RARITIES.length;

export const rarityClass = (rarity: string): string =>
  RARITY_CLASS[rarity] ?? RARITY_CLASS[
    RARITIES.find(name => rarityKey(name) === rarityKey(rarity)) ?? ''
  ] ?? '';
