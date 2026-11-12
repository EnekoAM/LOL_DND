/**
 * Patrón de área (tablero) de un efecto o habilidad: cuadrícula size×size (impar), casilla del usuario,
 * del objetivo y casillas donde hace efecto. Coordenadas [x, y] desde 0 (arriba a la izquierda).
 * Mismo formato que valida el servidor (server/src/areaPattern.ts).
 */
export type AreaCell = [number, number];
export type AreaPattern = { size: number; user: AreaCell | null; target: AreaCell | null; tiles: AreaCell[] };

export const AREA_MIN_SIZE = 5;
export const AREA_MAX_SIZE = 21;
export const AREA_DEFAULT_SIZE = 9;
export const AREA_SIZES: number[] = Array.from({ length: (AREA_MAX_SIZE - AREA_MIN_SIZE) / 2 + 1 }, (_, i) => AREA_MIN_SIZE + i * 2);

export function blankArea(size = AREA_DEFAULT_SIZE): AreaPattern {
  const center = Math.floor(size / 2);
  return { size, user: [center, center], target: null, tiles: [] };
}

function cell(raw: unknown, size: number): AreaCell | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [x, y] = raw;
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size ? [x, y] : null;
}

/** Lo que llega de la API → patrón válido o undefined (vacío / roto). */
export function normalizeArea(raw: unknown): AreaPattern | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const size = source.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < AREA_MIN_SIZE || size > AREA_MAX_SIZE || size % 2 === 0) return undefined;
  const seen = new Set<string>();
  const tiles: AreaCell[] = [];
  for (const entry of Array.isArray(source.tiles) ? source.tiles : []) {
    const c = cell(entry, size);
    if (!c || seen.has(c.join(','))) continue;
    seen.add(c.join(','));
    tiles.push(c);
  }
  const user = cell(source.user, size);
  const target = cell(source.target, size);
  if (!user && !target && !tiles.length) return undefined;
  return { size, user, target, tiles };
}

export function isAreaEmpty(area: AreaPattern | null | undefined): boolean {
  return !area || (!area.user && !area.target && area.tiles.length === 0);
}

/** Cambia el tamaño manteniendo el dibujo centrado; lo que quede fuera se pierde. */
export function resizeArea(area: AreaPattern, size: number): AreaPattern {
  const shift = (size - area.size) / 2;
  const move = (c: AreaCell | null): AreaCell | null => {
    if (!c) return null;
    const next: AreaCell = [c[0] + shift, c[1] + shift];
    return next[0] >= 0 && next[1] >= 0 && next[0] < size && next[1] < size ? next : null;
  };
  return {
    size,
    user: move(area.user),
    target: move(area.target),
    tiles: area.tiles.map(move).filter((c): c is AreaCell => !!c),
  };
}
