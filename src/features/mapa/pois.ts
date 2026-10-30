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

/** Como en el mapa oficial: los escudos de region solo se ven de lejos; ciudades y pueblos de cerca. */
export const POI_KINDS: { id: PoiKind; label: string; minZoom: number; maxZoom?: number }[] = [
  { id: 'region', label: 'Regiones', minZoom: -Infinity, maxZoom: 3.25 },
  { id: 'lugar', label: 'Lugares', minZoom: 2.25 },
  { id: 'ciudad', label: 'Ciudades', minZoom: 2.75 },
  { id: 'pueblo', label: 'Pueblos', minZoom: 3.5 },
];

const ICON_BASE = `${import.meta.env.BASE_URL}assets/runeterra/icons`;

export type PoiIconSpec = { src: string; hover: string; width: number; height: number };

/**
 * Iconos oficiales de map.leagueoflegends.com (assets/images/pins y regions):
 * region -> escudo de la region, lugar -> capital.png (starCircle / doubleTop / doubleBottom),
 * ciudad -> town-med.png (city), pueblo -> town-sml.png (dot, sin hover oficial).
 */
export function poiIconSpec(poi: RuneterraPoi): PoiIconSpec {
  switch (poi.kind) {
    case 'region': {
      const tall = poi.slug === 'piltover-zaun';
      return {
        src: `${ICON_BASE}/regions/${poi.slug}.png`,
        hover: `${ICON_BASE}/regions/${poi.slug}-hover.png`,
        width: 56,
        height: tall ? 112 : 56,
      };
    }
    case 'ciudad':
      if (poi.slug === 'piltover-town' || poi.slug === 'zaun-town') {
        // doubleTop / doubleBottom en el oficial: mismo icono que los landmarks.
        return { src: `${ICON_BASE}/pins/capital.png`, hover: `${ICON_BASE}/pins/capital-hover.png`, width: 30, height: 30 };
      }
      return { src: `${ICON_BASE}/pins/town-med.png`, hover: `${ICON_BASE}/pins/town-med-hover.png`, width: 22, height: 22 };
    case 'lugar':
      return { src: `${ICON_BASE}/pins/capital.png`, hover: `${ICON_BASE}/pins/capital-hover.png`, width: 34, height: 34 };
    case 'pueblo':
      return { src: `${ICON_BASE}/pins/town-sml.png`, hover: `${ICON_BASE}/pins/town-sml.png`, width: 16, height: 16 };
  }
}
