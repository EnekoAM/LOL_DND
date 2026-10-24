import { LOOT, type DropChance, type LootEntry, type LootRarity, type SpawnType } from '../../data/loot';

export type LootRoll = {
  entry: LootEntry;
  rarity: LootRarity;
};

const rollFromTable = (entries: LootEntry[]): LootEntry => {
  const roll = Math.random();
  for (let i = entries.length - 1; i >= 0; i--) {
    if (roll >= entries[i]['Probabilidad(acumulada)']) return entries[i];
  }
  return entries[0];
};

const rollDrop = (dropTable: DropChance[]): string => {
  const roll = Math.random() * 100;
  let accumulated = 0;
  for (const drop of dropTable) {
    accumulated += drop.prob;
    if (roll <= accumulated) return drop.item;
  }
  return dropTable[0].item;
};

/** Las tiradas básica y épica pueden subir de rareza, nunca bajar; la legendaria no usa "Drop legendario". */
const rollRarity = (base: LootRarity): LootRarity => {
  if (base === 'legendario') return base;
  const drop = rollDrop(base === 'basico' ? LOOT['Drop basico'] : LOOT['Drop epico']);
  if (drop.includes('legendario')) return 'legendario';
  if (drop.includes('epico')) return 'epico';
  return base;
};

export const rollLoot = (base: LootRarity): LootRoll => {
  const rarity = rollRarity(base);
  return { rarity, entry: rollFromTable(LOOT.items[rarity]) };
};

export const getSpawnChance = (type: SpawnType): number =>
  LOOT.rolls.find(roll => roll.type === type)?.prob ?? 50;
