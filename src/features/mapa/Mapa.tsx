import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Mapa.css';

/**
 * Prototipo: mapa de Runeterra (solo render, pan + zoom).
 * Tiles locales en public/assets/runeterra/tiles/{z}/{x}/{y}.jpg (512px, z0..z4).
 * z4 = resolucion nativa 8192x8192 (64 tiles 1024px de la wiki de LoL, recortados).
 */
const TILE_SIZE = 512;
const MAX_NATIVE_ZOOM = 4;
/** En CRS.Simple, a zoom 0 un tile de 512px = 512 unidades: el mapa entero mide 512x512. */
const MAP_UNITS = TILE_SIZE;
const BOUNDS = L.latLngBounds([-MAP_UNITS, 0], [0, MAP_UNITS]);
const TILE_URL = `${import.meta.env.BASE_URL}assets/runeterra/tiles/{z}/{x}/{y}.jpg`;

export default function Mapa() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const map = L.map(host, {
      crs: L.CRS.Simple,
      minZoom: -1,
      maxZoom: MAX_NATIVE_ZOOM + 1,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBounds: BOUNDS.pad(0.15),
      maxBoundsViscosity: 0.8,
      attributionControl: true,
      zoomControl: true,
    });

    L.tileLayer(TILE_URL, {
      tileSize: TILE_SIZE,
      minZoom: -1,
      maxZoom: MAX_NATIVE_ZOOM + 1,
      minNativeZoom: 0,
      maxNativeZoom: MAX_NATIVE_ZOOM,
      noWrap: true,
      bounds: BOUNDS,
      keepBuffer: 4,
      attribution: 'Runeterra &copy; Riot Games (fan use)',
    }).addTo(map);

    map.attributionControl.setPrefix(false);
    map.fitBounds(BOUNDS);

    // El contenedor puede cambiar de tamano (menu lateral, movil).
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(host);

    return () => {
      observer.disconnect();
      map.remove();
    };
  }, []);

  return (
    <div className="mapa-root">
      <div className="mapa-toolbar">
        <span className="mapa-toolbar__title">Runeterra</span>
        <span className="mapa-toolbar__hint">Arrastra para mover &middot; rueda / pellizco para zoom</span>
      </div>
      <div ref={hostRef} className="mapa-canvas" />
    </div>
  );
}
