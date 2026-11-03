import type { Npc } from '../../data/npcs';

/**
 * Rutas legibles de las fichas de NPC:
 *   /npcs/<región>/<tipo>/<nombre>   (se omite región y/o tipo si están vacíos)
 * Los players reciben el NPC sin región ni tipo, así que para ellos queda /npcs/<nombre>.
 * Al abrir una URL manda el último segmento (el nombre); región y tipo solo desempatan.
 */
export const NPCS_PATH = '/npcs';

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const idSuffix = (npc: Npc) => npc.id.slice(-6).toLowerCase();

/** Segmento del nombre; si dos NPCs comparten nombre se le añade el final del id para distinguirlos. */
function nameSegment(npc: Npc, list: Npc[]): string {
  const base = slugify(npc.name);
  if (!base) return npc.id;
  const repeated = list.some(other => other.id !== npc.id && slugify(other.name) === base);
  return repeated ? `${base}-${idSuffix(npc)}` : base;
}

/** Parte de la ruta tras /npcs/ (sin barra inicial). */
export function npcSlugPath(npc: Npc, list: Npc[]): string {
  return [slugify(npc.region), slugify(npc.type), nameSegment(npc, list)].filter(Boolean).join('/');
}

export const npcUrl = (npc: Npc, list: Npc[]): string => `${NPCS_PATH}/${npcSlugPath(npc, list)}`;

/** NPC al que apunta la ruta (o undefined). */
export function findNpcBySlug(list: Npc[], splat: string): Npc | undefined {
  const segments = splat.split('/').map(s => decodeURIComponent(s).toLowerCase()).filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return undefined;
  const exact = list.find(npc => nameSegment(npc, list) === last);
  if (exact) return exact;
  // Enlace viejo o sin sufijo: por nombre, desempatando por región/tipo; también vale el id tal cual.
  const byName = list.filter(npc => slugify(npc.name) === last || npc.id === last);
  if (byName.length <= 1) return byName[0];
  const prefix = segments.slice(0, -1);
  return byName.find(npc => prefix.every(seg => seg === slugify(npc.region) || seg === slugify(npc.type))) ?? byName[0];
}
