/** Mecánicas de personaje (Ruina / Humanidad / Fama). Lógica pura, sin React. */

export const FAMA_REGIONS = [
  'Demacia',
  'Noxus',
  'Freljord',
  'Jonia',
  'Piltover',
  'Zaun',
  'Shurima',
  'Targon',
  'Bilgewater',
  'Islas de la Sombra',
  'Ixtal',
  'Bandle',
] as const;

export type FamaRegion = (typeof FAMA_REGIONS)[number];

export type MechanicRuina = { type: 'ruina'; value: number };
export type MechanicHumanidad = { type: 'humanidad'; value: number };
export type MechanicFama = { type: 'fama'; regions: Record<string, number> };
export type PlayerMechanic = MechanicRuina | MechanicHumanidad | MechanicFama;

export const RUINA_MIN = 1;
export const RUINA_MAX = 20;
export const HUMANIDAD_MIN = -10;
export const HUMANIDAD_MAX = 10;

const NAME_KEY = (name: string) =>
  name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Asignación fija por nombre de ficha. */
export function mechanicTypeForPlayer(name: string): PlayerMechanic['type'] | null {
  const key = NAME_KEY(name);
  if (key === 'samael') return 'ruina';
  if (key === 'zerav') return 'humanidad';
  if (key === 'combatiente') return 'fama';
  return null;
}

export function emptyFamaRegions(): Record<string, number> {
  const regions: Record<string, number> = {};
  for (const region of FAMA_REGIONS) regions[region] = 0;
  return regions;
}

/** Valor mostrado si Mongo aún no tiene `mechanic` (no se persiste hasta editar). */
export function defaultMechanic(name: string): PlayerMechanic | null {
  const type = mechanicTypeForPlayer(name);
  if (type === 'ruina') return { type: 'ruina', value: RUINA_MIN };
  if (type === 'humanidad') return { type: 'humanidad', value: 0 };
  if (type === 'fama') return { type: 'fama', regions: emptyFamaRegions() };
  return null;
}

/** Une lo guardado con defaults (rellena regiones faltantes, clampa). */
export function resolveMechanic(name: string, stored: PlayerMechanic | null | undefined): PlayerMechanic | null {
  const fallback = defaultMechanic(name);
  if (!fallback) return null;
  if (!stored || stored.type !== fallback.type) return fallback;
  if (stored.type === 'ruina') {
    const value = clampInt(stored.value, RUINA_MIN, RUINA_MAX) ?? RUINA_MIN;
    return { type: 'ruina', value };
  }
  if (stored.type === 'humanidad') {
    const value = clampInt(stored.value, HUMANIDAD_MIN, HUMANIDAD_MAX) ?? 0;
    return { type: 'humanidad', value };
  }
  const regions = emptyFamaRegions();
  for (const region of FAMA_REGIONS) {
    const raw = stored.regions?.[region];
    regions[region] = typeof raw === 'number' && Number.isInteger(raw) ? raw : 0;
  }
  return { type: 'fama', regions };
}

export function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export function clampIntSoft(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Títulos de fama / infamia por región. */
export function famaRankTitle(score: number): string {
  if (score >= 1001) return 'Entidad Inmortalizada';
  if (score >= 501) return 'Mito Viviente';
  if (score >= 251) return 'Ícono Nacional';
  if (score >= 101) return 'Leyenda Regional';
  if (score >= 51) return 'Héroe de la Región';
  if (score >= 26) return 'Fama Local';
  if (score >= 11) return 'Reconocido';
  if (score >= 1) return 'Nombre Ocasional';
  if (score === 0) return 'Desconocido';
  if (score >= -10) return 'Sospechoso';
  if (score >= -25) return 'Temido';
  if (score >= -50) return 'Peligro Público';
  if (score >= -100) return 'Enemigo del Pueblo';
  if (score >= -250) return 'Abominación Local';
  if (score >= -500) return 'Miedo Nacional';
  if (score >= -1000) return 'Mito del Terror';
  return 'Entidad Maldita';
}

export type HumanidadTier = { level: number; text: string };

export const HUMANIDAD_POSITIVE: HumanidadTier[] = [
  { level: 2, text: 'Ventaja en Carisma y Persuasión con aliados y PNJs neutrales/buenos.' },
  { level: 4, text: 'Puede usar Ayudar 1 vez por combate.' },
  { level: 6, text: 'La gente baja la guardia: ventaja en Juego de Manos.' },
  { level: 8, text: 'Se aferra a la vida: ventaja en tiradas de muerte.' },
  { level: 10, text: 'Puede inspirar a otros (a costa de un punto de Humanidad). Ventaja en tiradas de Carisma hacia aliados.' },
];

export const HUMANIDAD_NEGATIVE: HumanidadTier[] = [
  { level: -2, text: 'Desconfianza automática de PNJs buenos/neutrales; desventaja en primeras impresiones.' },
  { level: -4, text: 'No puede usar ni recibir Inspiración.' },
  { level: -6, text: 'No expresa emociones: desventaja en Performance, Persuasión y Engaño.' },
  { level: -8, text: 'Cree que no merece ser salvado: desventaja en tiradas de muerte.' },
  { level: -10, text: 'Ya no empatiza ni distingue aliados de enemigos: PNJ hostil / corrupción total.' },
];

/** Efectos activos acumulativos según el contador. */
export function humanidadActiveTiers(value: number): HumanidadTier[] {
  if (value > 0) return HUMANIDAD_POSITIVE.filter(tier => tier.level <= value);
  if (value < 0) return HUMANIDAD_NEGATIVE.filter(tier => tier.level >= value).sort((a, b) => b.level - a.level);
  return [];
}

export type RuinaControlEffect = {
  roll: 1 | 2 | 3 | 4;
  title: string;
  text: string;
};

export const RUINA_EFFECTS: RuinaControlEffect[] = [
  {
    roll: 1,
    title: 'Círculo de daño',
    text: 'Al dañar, tira 1d10; con 1 hace (5×Contador)% del daño en área, él incluido.',
  },
  {
    roll: 2,
    title: 'Descontrol',
    text: 'El DM tira 1d4 cada turno: 1 ataca al aliado más cercano, 4 al enemigo más cercano, con 200% de daño verdadero de su primera habilidad de daño; 2–3 nada.',
  },
  {
    roll: 3,
    title: 'Terror',
    text: 'Criaturas a 10 pies: salvación de Sabiduría CD 10+Contador o asustadas 1 turno (solo al inicio del combate).',
  },
  {
    roll: 4,
    title: 'Curación corrupta',
    text: 'En un círculo, las curaciones (no escudos) dañan en vez de curar.',
  },
];

export type RuinaControlResult =
  | { kind: 'control'; d20: number; contador: number }
  | { kind: 'lose'; d20: number; contador: number; effectRoll: number; effect: RuinaControlEffect };

export function rollDie(sides: number, rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * sides);
}

/** Tirada de control de la Ruina: 1d20; si ≤ contador, pierde el control y se tira 1d4 de efecto. */
export function resolveRuinaControl(contador: number, rng: () => number = Math.random): RuinaControlResult {
  const level = clampIntSoft(contador, RUINA_MIN, RUINA_MAX);
  const d20 = rollDie(20, rng);
  if (d20 > level) return { kind: 'control', d20, contador: level };
  const effectRoll = rollDie(4, rng) as 1 | 2 | 3 | 4;
  const effect = RUINA_EFFECTS.find(entry => entry.roll === effectRoll) ?? RUINA_EFFECTS[0];
  return { kind: 'lose', d20, contador: level, effectRoll, effect };
}

export const mechanicLabels: Record<PlayerMechanic['type'], string> = {
  ruina: 'Marca de la Ruina',
  humanidad: 'Fragmentos de Humanidad',
  fama: 'La historia del héroe',
};
