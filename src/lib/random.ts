export const rollPercent = (chance: number): boolean => Math.random() * 100 < chance;

export const pickRandom = <T>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)];
