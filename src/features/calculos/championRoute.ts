import type { Champion } from '../../data/champions';
import { slugify } from '../npcs/npcRoute';

/**
 * Rutas legibles de las fichas de campeón:
 *   /champions/<región>/<rol>/<nombre>   (se omite región y/o rol si están vacíos)
 * Al abrir una URL manda el último segmento (el nombre); región y rol solo desempatan.
 */
export const CHAMPIONS_PATH = '/champions';

/** Parte de la ruta tras /champions/ (sin barra inicial). */
export function championSlugPath(champion: Champion): string {
  return [slugify(champion.region ?? ''), slugify(champion.role ?? ''), slugify(champion.champion)]
    .filter(Boolean)
    .join('/');
}

export const championUrl = (champion: Champion): string => `${CHAMPIONS_PATH}/${championSlugPath(champion)}`;

/** Normaliza la ruta recibida (mayúsculas, %xx, barras sobrantes) para compararla con championSlugPath. */
export function normalizeSplat(splat: string): string {
  return splat
    .split('/')
    .map(segment => {
      try { return decodeURIComponent(segment).toLowerCase(); } catch { return segment.toLowerCase(); }
    })
    .filter(Boolean)
    .join('/');
}

/** Campeón al que apunta la ruta (o undefined). */
export function findChampionBySlug(list: Champion[], splat: string): Champion | undefined {
  const segments = normalizeSplat(splat).split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return undefined;
  const byName = list.filter(champion => slugify(champion.champion) === slugify(last));
  if (byName.length <= 1) return byName[0];
  const prefix = segments.slice(0, -1);
  return byName.find(champion =>
    prefix.every(seg => seg === slugify(champion.region ?? '') || seg === slugify(champion.role ?? ''))) ?? byName[0];
}
