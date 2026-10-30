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
 * Orden: relleno · vuelta completa del pool (todas las demás opciones) · GANADOR · cola.
 * La marca recorre una vuelta entera del pool antes de parar en el ítem.
 * Relleno y cola salen solo de rarezas superiores (el "casi"); si no alcanzan, se acortan.
 */
export const buildReel = (base: LootRarity, winner: LootRoll): LootReelData => {
  const used = new Set<string>([keyOf(winner.entry.name)]);
  const poolSize = new Set((LOOT.items[base] ?? []).map(e => keyOf(e.name))).size;
  // Vuelta completa: todas las opciones del pool excepto el ganador.
  const lap = shuffle(takeUnique(base, used));
  const extras = shuffle(UPGRADES[base].flatMap(r => takeUnique(r, used)));

  // Cola: rareza superior ("casi"). 50%: 0 mín., 35%: 1, 15%: 2; hasta TAIL si hay extras.
  const roll = Math.random();
  const minBait = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
  const tailCount = Math.min(TAIL, Math.max(minBait, Math.min(TAIL, extras.length)));
  const tail = shuffle(extras.splice(0, tailCount));

  // Relleno inicial con lo que quede de extras (no se come la vuelta del pool).
  const lead = extras.splice(0, Math.min(LEAD, extras.length));

  return {
    id: Date.now() + Math.random(),
    items: [...lead, ...lap, winner, ...tail],
    startIndex: lead.length,
    winnerIndex: lead.length + lap.length,
    durationMs: spinDurationFor(poolSize),
    poolSize,
  };
};
