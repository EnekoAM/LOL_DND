import data from './runeterraPois.json';

/** region = gran region (escudo), lugar = landmark, ciudad / pueblo = asentamientos. */
export type PoiKind = 'region' | 'lugar' | 'ciudad' | 'pueblo';

export type RuneterraPoi = {
  slug: string;
  /** Nombre en espanol (pins-es_es del mapa oficial). */
  name: string;
  nameEn: string;
  kind: PoiKind;
  /** Pixel en el mapa cosido de 8192x8192 (origen arriba-izquierda). */
  x: number;
  y: number;
  subtitle?: string;
  description?: string;
  region?: string;
  link?: string;
};

export const MAP_PIXELS: number = data.mapSize;
export const RUNETERRA_POIS = data.pois as RuneterraPoi[];

export const POI_KINDS: { id: PoiKind; label: string; minZoom: number }[] = [
  { id: 'region', label: 'Regiones', minZoom: -Infinity },
  { id: 'lugar', label: 'Lugares', minZoom: 2.25 },
  { id: 'ciudad', label: 'Ciudades', minZoom: 2.75 },
  { id: 'pueblo', label: 'Pueblos', minZoom: 3.5 },
];
