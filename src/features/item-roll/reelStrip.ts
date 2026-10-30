import { LOOT, type LootRarity } from '../../data/loot';
import type { LootRoll } from './loot';

export type LootReelData = {
  /** Cambia en cada tirada para reiniciar la animación. */
  id: number;
  items: LootRoll[];
  /** Carta que queda bajo la marca al empezar (primera opción del pool). */
  startIndex: number;
  winnerIndex: number;
  /** Duración del giro en ms (depende del tamaño del pool). */
  durationMs: number;
  poolSize: number;
};

/** Tiempo por cada opción del pool que recorre la ruleta. */
export const MS_PER_POOL_ITEM = 100;
export const MIN_SPIN_MS = 3000;
export const MAX_SPIN_MS = 15000;

/** Cartas antes del pool (para que no se vea hueco a la izquierda). */
const LEAD = 6;
/** Cartas tras el ganador: rellenan el viewport a la derecha al frenar. */
const TAIL = 7;

/** Rarezas a las que puede subir cada tirada (ver rollRarity en loot.ts). */
const UPGRADES: Record<LootRarity, LootRarity[]> = {
  basico: ['epico', 'legendario'],
  epico: ['legendario'],
  legendario: [],
};

export const spinDurationFor = (poolSize: number): number =>
  Math.min(MAX_SPIN_MS, Math.max(MIN_SPIN_MS, poolSize * MS_PER_POOL_ITEM));

const shuffle = <T,>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const keyOf = (name: string) => name.trim().toLowerCase();

/** Ítems únicos (por nombre) de una rareza, sin los ya usados. Marca los devueltos como usados. */
const takeUnique = (rarity: LootRarity, used: Set<string>): LootRoll[] => {
  const out: LootRoll[] = [];
  for (const entry of LOOT.items[rarity] ?? []) {
    const key = keyOf(entry.name);
    if (used.has(key)) continue;
    used.add(key);
    out.push({ entry, rarity });
  }
  return out;
};

/** Rellena hasta `count` cartas ciclando un pool (solo padding visual; la vuelta del medio sigue sin repeticiones). */
const padFrom = (count: number, pool: LootRoll[]): LootRoll[] => {
  if (count <= 0 || pool.length === 0) return [];
  const out: LootRoll[] = [];
  const order = shuffle(pool);
  for (let i = 0; i < count; i++) out.push(order[i % order.length]!);
  return out;
};

/**
 * Tira de la ruleta estilo "caja". El ganador ya está decidido y aparece una sola vez
 * en la vuelta central. Orden: relleno · vuelta completa del pool · GANADOR · cola.
 * Lead/cola usan primero rarezas superiores ("casi") y, si no alcanzan (p. ej. legendario),
 * rellenan ciclando el pool para que el viewport no quede vacío al frenar.
 */
export const buildReel = (base: LootRarity, winner: LootRoll): LootReelData => {
  const used = new Set<string>([keyOf(winner.entry.name)]);
  const poolSize = new Set((LOOT.items[base] ?? []).map(e => keyOf(e.name))).size;
  const lap = shuffle(takeUnique(base, used));
  const extras = shuffle(UPGRADES[base].flatMap(r => takeUnique(r, used)));

  // Cola: preferir extras; completar hasta TAIL con el pool (padding visual).
  const roll = Math.random();
  const minBait = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
  const baitTake = Math.min(extras.length, Math.max(minBait, Math.min(TAIL, extras.length)));
  const bait = shuffle(extras.splice(0, baitTake));
  const padPool = lap.length > 0 ? lap : [winner];
  const tail = [...bait, ...padFrom(TAIL - bait.length, padPool)].slice(0, TAIL);

  // Relleno inicial: extras restantes + padding del pool.
  const leadExtras = extras.splice(0, Math.min(LEAD, extras.length));
  const lead = [...leadExtras, ...padFrom(LEAD - leadExtras.length, padPool)].slice(0, LEAD);

  return {
    id: Date.now() + Math.random(),
    items: [...lead, ...lap, winner, ...tail],
    startIndex: lead.length,
    winnerIndex: lead.length + lap.length,
    durationMs: spinDurationFor(poolSize),
    poolSize,
  };
};
