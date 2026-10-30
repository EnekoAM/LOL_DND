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
export const MIN_SPIN_MS = 2000;
export const MAX_SPIN_MS = 15000;

/** Cartas antes del pool (para que no se vea hueco a la izquierda). */
const LEAD = 6;
/** Cartas tras el ganador: lo que había justo después. */
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

/**
 * Tira de la ruleta estilo "caja", SIN ítems repetidos. El ganador ya está decidido
 * (no cambia las probabilidades) y aparece una sola vez.
 * Orden: relleno · todas las opciones de la tabla (barajadas) · GANADOR · cola.
 * La cola sale casi toda de la misma tabla y solo a veces lleva 1-2 cartas de una
 * rareza superior (el "casi"). El relleno inicial mezcla ambas.
 */
export const buildReel = (base: LootRarity, winner: LootRoll): LootReelData => {
  const used = new Set<string>([keyOf(winner.entry.name)]);
  const poolSize = new Set((LOOT.items[base] ?? []).map(e => keyOf(e.name))).size;
  const traverse = shuffle(takeUnique(base, used));
  const extras = shuffle(UPGRADES[base].flatMap(r => takeUnique(r, used)));

  const minTraverse = Math.ceil(poolSize / 2);
  const fromPool = () => (traverse.length > minTraverse ? traverse.pop() : undefined);

  // Cola (lo que se ve junto al ganador): casi todo de la misma tabla; solo a veces
  // 1-2 cartas de rareza superior como "casi" (50 %: 0, 35 %: 1, 15 %: 2).
  const r = Math.random();
  const baitCount = Math.min(extras.length, r < 0.5 ? 0 : r < 0.85 ? 1 : 2);
  const baitSlots = new Set<number>();
  while (baitSlots.size < baitCount) baitSlots.add(Math.floor(Math.random() * TAIL));
  const tail: LootRoll[] = [];
  for (let i = 0; i < TAIL; i++) {
    const card = baitSlots.has(i) ? (extras.pop() ?? fromPool()) : (fromPool() ?? extras.pop());
    if (card) tail.push(card);
  }

  // Relleno inicial (solo se ve al arrancar, lejos del ganador): mezcla de lo que quede.
  const lead: LootRoll[] = [];
  for (let i = 0; i < LEAD; i++) {
    const card = (Math.random() < 0.5 ? extras.pop() : undefined) ?? fromPool() ?? extras.pop();
    if (card) lead.push(card);
  }

  return {
    id: Date.now() + Math.random(),
    items: [...lead, ...traverse, winner, ...tail],
    startIndex: lead.length,
    winnerIndex: lead.length + traverse.length,
    durationMs: spinDurationFor(poolSize),
    poolSize,
  };
};
