import data from './yordlePortal.json';

/**
 * Portal yordle (Ciudad de Bandle), igual que el pin oficial `bandle-city` de
 * map.leagueoflegends.com: Riot da 66 posiciones posibles y su mapa elige una al azar
 * en cada carga. Aqui se elige una por dia (fecha de Europe/Madrid), asi toda la mesa
 * ve el portal en el mismo sitio y se mueve solo a medianoche.
 */
export type YordlePortalSpot = { x: number; y: number };

export const YORDLE_PORTAL = {
  slug: data.slug,
  name: data.name,
  region: data.region,
  subtitle: data.subtitle,
  description: data.description,
  link: data.link,
  spots: data.spots as YordlePortalSpot[],
};

/**
 * Arte del portal oficial (no el escudo de Bandle): el glifo es assets/images/fx/bandle-mask.jpg
 * de map.leagueoflegends.com tenido con su color 0xFF8018 (blanco al pasar el raton, como alli),
 * y las chispas usan assets/images/fx/particle.jpg. Ver yordlePortalFx.ts.
 */
const FX_BASE = `${import.meta.env.BASE_URL}assets/runeterra/fx`;
export const YORDLE_PORTAL_ART = {
  glyph: `${FX_BASE}/yordle-portal.png`,
  glyphHover: `${FX_BASE}/yordle-portal-hover.png`,
  mask: `${FX_BASE}/yordle-portal-mask.png`,
  particle: `${FX_BASE}/yordle-particle.png`,
};
/** El plano del portal mide 20 unidades de Riot = 20 * S px en el mapa de 8192. */
export const YORDLE_PORTAL_PIXELS = 79.5;

const TIME_ZONE = 'Europe/Madrid';
/** Paso coprimo con 66: recorre las 66 posiciones sin repetir y cada dia salta lejos. */
const STEP = 25;
const OFFSET = 7;

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' });

/** Fecha 'YYYY-MM-DD' en hora de Madrid. */
export function portalDayKey(now: Date = new Date()): string {
  return dayKeyFormat.format(now);
}

export type YordlePortalDay = {
  dayKey: string;
  dayLabel: string;
  index: number;
  total: number;
  spot: YordlePortalSpot;
};

export function yordlePortalForDay(now: Date = new Date()): YordlePortalDay {
  const dayKey = portalDayKey(now);
  const [year, month, day] = dayKey.split('-').map(Number);
  const dayNumber = Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
  const total = YORDLE_PORTAL.spots.length;
  const index = (((dayNumber * STEP + OFFSET) % total) + total) % total;
  return { dayKey, dayLabel: dayLabelFormat.format(now), index, total, spot: YORDLE_PORTAL.spots[index] };
}
