export type LootRarity = 'basico' | 'epico' | 'legendario';

export type SpawnType = 'Basico' | 'Epico';

export type LootEntry = {
  name: string;
  coste: number;
  normalizado: number;
  'Probabilidad(0,1)': number;
  'Probabilidad(acumulada)': number;
};

export type DropChance = { item: string; prob: number };

export type LootTables = {
  rolls: { type: SpawnType; prob: number }[];
  'Drop basico': DropChance[];
  'Drop epico': DropChance[];
  'Drop legendario': DropChance[];
  items: Record<LootRarity, LootEntry[]>;
};

const EMPTY_LOOT: LootTables = {
  rolls: [],
  'Drop basico': [],
  'Drop epico': [],
  'Drop legendario': [],
  items: { basico: [], epico: [], legendario: [] },
};

export let LOOT: LootTables = EMPTY_LOOT;

export function hydrateLoot(loot: LootTables): void {
  LOOT = loot;
}
