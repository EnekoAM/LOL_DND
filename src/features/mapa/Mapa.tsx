import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cx } from '../../lib/cx';
import { MAP_PIXELS, POI_KINDS, RUNETERRA_POIS, poiIconSpec, type PoiKind, type RuneterraPoi } from './pois';
import landmarks3d from './landmarks3d.json';
import './Mapa.css';

/**
 * Prototipo: mapa de Runeterra (solo render, pan + zoom).
 * Tiles locales en public/assets/runeterra/tiles/{z}/{x}/{y}.jpg (512px, z0..z4).
 * z4 = resolucion nativa 8192x8192 (64 tiles 1024px de la wiki de LoL, recortados).
 */
const TILE_SIZE = 512;
const MAX_NATIVE_ZOOM = 4;
/** Sobre-zoom por encima del nativo (Leaflet escala los tiles de z4): +2 = 4x pixeles. */
const MAX_ZOOM = MAX_NATIVE_ZOOM + 2;
/** En CRS.Simple, a zoom 0 un tile de 512px = 512 unidades: el mapa entero mide 512x512. */
const MAP_UNITS = TILE_SIZE;
const BOUNDS = L.latLngBounds([-MAP_UNITS, 0], [0, MAP_UNITS]);
/** Unidades CRS por pixel del mapa de 8192. */
const UNITS_PER_PIXEL = MAP_UNITS / MAP_PIXELS;
const TILE_URL = `${import.meta.env.BASE_URL}assets/runeterra/tiles/{z}/{x}/{y}.jpg`;

/** Monumentos 3D del mapa oficial (modelos .obj renderizados a sprite, ver landmarks/README.md). */
const LANDMARK_URL = `${import.meta.env.BASE_URL}assets/runeterra/landmarks/sprites`;
/** Siempre visibles con el chip 3D (las sombras del tile ya se ven en zoom lejano). */
const LANDMARK_MIN_ZOOM = -Infinity;

/** Rectangulo del sprite en px del mapa 8192 (ajustado a la sombra pintada en los tiles). */
type LandmarkSprite = { left: number; top: number; width: number; height: number };

function landmarkOverlay(poi: RuneterraPoi, sprite: LandmarkSprite): L.ImageOverlay {
  const bounds = L.latLngBounds(
    [-(sprite.top + sprite.height) * UNITS_PER_PIXEL, sprite.left * UNITS_PER_PIXEL],
    [-sprite.top * UNITS_PER_PIXEL, (sprite.left + sprite.width) * UNITS_PER_PIXEL],
  );
  return L.imageOverlay(`${LANDMARK_URL}/${poi.slug}.webp`, bounds, {
    className: 'mapa-landmark',
    alt: poi.name,
    interactive: false,
  });
}

const KIND_LABEL: Record<PoiKind, string> = {
  region: 'Region',
  lugar: 'Lugar',
  ciudad: 'Ciudad',
  pueblo: 'Pueblo',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
}

function poiLatLng(poi: RuneterraPoi): L.LatLng {
  return L.latLng(-poi.y * UNITS_PER_PIXEL, poi.x * UNITS_PER_PIXEL);
}

function poiIcon(poi: RuneterraPoi): L.DivIcon {
  const icon = poiIconSpec(poi);
  const size = `width:${icon.width}px;height:${icon.height}px`;
  return L.divIcon({
    className: `mapa-poi mapa-poi--${poi.kind}`,
    html:
      `<span class="mapa-poi__icon" style="${size}">` +
      `<img class="mapa-poi__img" src="${icon.src}" alt="" draggable="false">` +
      `<img class="mapa-poi__img mapa-poi__img--hover" src="${icon.hover}" alt="" draggable="false">` +
      `</span>` +
      `<span class="mapa-poi__label" style="top:${Math.round(icon.height / 2) + 2}px">${escapeHtml(poi.name)}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function poiPopup(poi: RuneterraPoi): string {
  const parts = [`<div class="mapa-popup__kind">${KIND_LABEL[poi.kind]}${poi.region ? ` &middot; ${escapeHtml(poi.region)}` : ''}</div>`];
  parts.push(`<div class="mapa-popup__title">${escapeHtml(poi.name)}</div>`);
  if (poi.nameEn !== poi.name) parts.push(`<div class="mapa-popup__alt">${escapeHtml(poi.nameEn)}</div>`);
  if (poi.subtitle) parts.push(`<div class="mapa-popup__subtitle">${escapeHtml(poi.subtitle)}</div>`);
  if (poi.description) parts.push(`<p class="mapa-popup__text">${escapeHtml(poi.description)}</p>`);
  if (poi.link) {
    parts.push(`<a class="mapa-popup__link" href="${escapeHtml(poi.link)}" target="_blank" rel="noreferrer">Ver en Universe &rarr;</a>`);
  }
  return `<div class="mapa-popup">${parts.join('')}</div>`;
}

const ALL_KINDS = new Set<PoiKind>(POI_KINDS.map(kind => kind.id));

export default function Mapa() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupsRef = useRef<Map<PoiKind, L.LayerGroup>>(new Map());
  const [shown, setShown] = useState<Set<PoiKind>>(() => new Set(ALL_KINDS));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const landmarksRef = useRef<L.LayerGroup>(L.layerGroup());
  const [show3d, setShow3d] = useState(true);
  const show3dRef = useRef(show3d);
  show3dRef.current = show3d;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const map = L.map(host, {
      crs: L.CRS.Simple,
      maxZoom: MAX_ZOOM,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBounds: BOUNDS,
      maxBoundsViscosity: 1,
      attributionControl: true,
      zoomControl: true,
    });

    L.tileLayer(TILE_URL, {
      tileSize: TILE_SIZE,
      minZoom: -2,
      maxZoom: MAX_ZOOM,
      minNativeZoom: 0,
      maxNativeZoom: MAX_NATIVE_ZOOM,
      noWrap: true,
      bounds: BOUNDS,
      keepBuffer: 4,
      attribution: 'Runeterra &copy; Riot Games (fan use)',
    }).addTo(map);

    map.attributionControl.setPrefix(false);
    /**
     * Zoom minimo = el que hace que el mapa cubra el ancho del contenedor (sin vacio
     * a los lados): no se puede alejar hasta dejarlo como un sello. Arranca ahi.
     */
    const applyMinZoom = () => {
      const size = map.getSize();
      if (!size.x || !size.y) return;
      const coverZoom = Math.log2(size.x / MAP_UNITS);
      const snapped = Math.ceil(coverZoom * 4) / 4;
      map.setMinZoom(Math.min(snapped, MAX_ZOOM));
      if (map.getZoom() < snapped) map.setZoom(snapped, { animate: false });
    };

    applyMinZoom();
    map.setView(BOUNDS.getCenter(), map.getMinZoom(), { animate: false });

    // Puntos de interes del mapa oficial, por capas segun zoom (como en Explore Runeterra).
    const groups = groupsRef.current;
    groups.clear();
    for (const kind of POI_KINDS) groups.set(kind.id, L.layerGroup());
    for (const poi of RUNETERRA_POIS) {
      L.marker(poiLatLng(poi), { icon: poiIcon(poi), title: poi.name, riseOnHover: true })
        .bindPopup(poiPopup(poi), { className: 'mapa-popup-wrap', maxWidth: 320, minWidth: 220 })
        .addTo(groups.get(poi.kind)!);
    }
    const landmarks = landmarksRef.current;
    landmarks.clearLayers();
    const sprites = landmarks3d.sprites as Record<string, LandmarkSprite>;
    for (const poi of RUNETERRA_POIS) {
      const sprite = sprites[poi.slug];
      if (sprite) landmarkOverlay(poi, sprite).addTo(landmarks);
    }
    mapRef.current = map;
    const syncLayers = () => {
      syncPoiLayers(map, groups, shownRef.current);
      syncLandmarks(map, landmarks, show3dRef.current);
    };
    map.on('zoomend', syncLayers);
    syncLayers();

    // El contenedor puede cambiar de tamano (menu lateral, movil).
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      applyMinZoom();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      map.off('zoomend', syncLayers);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) syncPoiLayers(mapRef.current, groupsRef.current, shown);
  }, [shown]);

  useEffect(() => {
    if (mapRef.current) syncLandmarks(mapRef.current, landmarksRef.current, show3d);
  }, [show3d]);

  const toggleKind = (kind: PoiKind) => {
    setShown(prev => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <div className="mapa-root">
      <div className="mapa-toolbar">
        <span className="mapa-toolbar__title">Runeterra</span>
        <div className="mapa-filters" role="group" aria-label="Puntos de interes">
          {POI_KINDS.map(kind => (
            <button
              key={kind.id}
              type="button"
              className={cx('mapa-chip', `mapa-chip--${kind.id}`, shown.has(kind.id) && 'mapa-chip--on')}
              aria-pressed={shown.has(kind.id)}
              onClick={() => toggleKind(kind.id)}
            >
              {kind.label}
            </button>
          ))}
          <button
            type="button"
            className={cx('mapa-chip', 'mapa-chip--3d', show3d && 'mapa-chip--on')}
            aria-pressed={show3d}
            onClick={() => setShow3d(on => !on)}
          >
            Monumentos 3D
          </button>
        </div>
        <span className="mapa-toolbar__hint">Acerca el zoom para ver ciudades y pueblos &middot; clic en un punto para info</span>
      </div>
      <div ref={hostRef} className="mapa-canvas" />
    </div>
  );
}

/** Muestra cada capa si esta activada y el zoom actual llega a su umbral. */
function syncPoiLayers(map: L.Map, groups: Map<PoiKind, L.LayerGroup>, shown: Set<PoiKind>) {
  const zoom = map.getZoom();
  for (const kind of POI_KINDS) {
    const group = groups.get(kind.id);
    if (!group) continue;
    const visible = shown.has(kind.id) && zoom >= kind.minZoom && zoom < (kind.maxZoom ?? Infinity);
    if (visible && !map.hasLayer(group)) group.addTo(map);
    if (!visible && map.hasLayer(group)) map.removeLayer(group);
  }
}

/** Monumentos 3D: visibles con el chip activado y desde el zoom de los lugares. */
function syncLandmarks(map: L.Map, group: L.LayerGroup, on: boolean) {
  const visible = on && map.getZoom() >= LANDMARK_MIN_ZOOM;
  if (visible && !map.hasLayer(group)) group.addTo(map);
  if (!visible && map.hasLayer(group)) map.removeLayer(group);
}
