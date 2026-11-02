import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cx } from '../../lib/cx';
import { useAppRole } from '../../data/appRoleContext';
import { useLiveRevision } from '../../data/live';
import { createMapPoi, deleteMapPoi, loadMapPois, updateMapPoi, type MapPoi } from '../../data/mapPois';
import MapaPoiPanel, { type PoiFormDraft } from './MapaPoiPanel';
import { MAP_PIXELS, POI_KINDS, RUNETERRA_POIS, poiIconSpec, type PoiKind, type RuneterraPoi } from './pois';
import { YORDLE_PORTAL, YORDLE_PORTAL_ICON, portalDayKey, yordlePortalForDay, type YordlePortalDay } from './yordlePortal';
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

/** Pixel del mapa 8192 → coordenada Leaflet (y al revés), igual que los puntos oficiales. */
function pixelLatLng(x: number, y: number): L.LatLng {
  return L.latLng(-y * UNITS_PER_PIXEL, x * UNITS_PER_PIXEL);
}

function latLngPixel(latlng: L.LatLng): { x: number; y: number } {
  const clamp = (value: number) => Math.min(MAP_PIXELS, Math.max(0, Math.round(value * 10) / 10));
  return { x: clamp(latlng.lng / UNITS_PER_PIXEL), y: clamp(-latlng.lat / UNITS_PER_PIXEL) };
}

/** Pin de los puntos propios: la party con bandera; el resto con chincheta. */
function customIcon(poi: Pick<MapPoi, 'kind' | 'name'>, selected: boolean, ghost = false): L.DivIcon {
  const party = poi.kind === 'party';
  return L.divIcon({
    className: cx('mapa-mine', party ? 'mapa-mine--party' : 'mapa-mine--poi', selected && 'mapa-mine--on', ghost && 'mapa-mine--ghost'),
    html:
      `<span class="mapa-mine__pin" aria-hidden="true">${party ? '\u{1F6A9}' : '\u{1F4CD}'}</span>` +
      `<span class="mapa-mine__label">${escapeHtml(poi.name || (party ? 'Party' : 'Nuevo punto'))}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Portal yordle: escudo de Bandle con el brillo naranja del pin oficial. */
function portalIcon(): L.DivIcon {
  return L.divIcon({
    className: 'mapa-poi mapa-poi--region mapa-portal',
    html:
      `<span class="mapa-portal__glow" aria-hidden="true"></span>` +
      `<span class="mapa-poi__icon mapa-portal__icon" style="width:44px;height:50px">` +
      `<img class="mapa-poi__img" src="${YORDLE_PORTAL_ICON}" alt="" draggable="false">` +
      `</span>` +
      `<span class="mapa-poi__label mapa-portal__label" style="top:28px">${escapeHtml(YORDLE_PORTAL.name)}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function portalPopup(day: YordlePortalDay): string {
  const parts = [
    `<div class="mapa-popup__kind">Portal yordle &middot; ${escapeHtml(YORDLE_PORTAL.region)}</div>`,
    `<div class="mapa-popup__title">Portal de los yordles</div>`,
    `<div class="mapa-popup__alt">Bandle City</div>`,
    `<div class="mapa-popup__subtitle">${escapeHtml(YORDLE_PORTAL.subtitle)}</div>`,
    `<p class="mapa-popup__text">${escapeHtml(YORDLE_PORTAL.description)}</p>`,
    `<p class="mapa-popup__text mapa-portal__today">Hoy (${escapeHtml(day.dayLabel)}) está en la ubicación ${day.index + 1} de ${day.total}. ` +
      `Cambia de sitio cada día a medianoche (hora de Madrid).</p>`,
    `<a class="mapa-popup__link" href="${escapeHtml(YORDLE_PORTAL.link)}" target="_blank" rel="noreferrer">Ver en Universe &rarr;</a>`,
  ];
  return `<div class="mapa-popup">${parts.join('')}</div>`;
}

type Placing = { mode: 'new' } | { mode: 'move'; id: string } | null;

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

  // ── Puntos propios (Mongo mapPois): todos los ven; solo el admin añade, mueve y borra. ──
  const isAdmin = useAppRole().role === 'admin';
  const poisRevision = useLiveRevision('mapPois');
  const [pois, setPois] = useState<MapPoi[]>([]);
  const [poisError, setPoisError] = useState<string | null>(null);
  const [showMine, setShowMine] = useState(true);
  const [placing, setPlacing] = useState<Placing>(null);
  const placingRef = useRef<Placing>(null);
  placingRef.current = placing;
  const [draft, setDraft] = useState<PoiFormDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mineRef = useRef<L.LayerGroup>(L.layerGroup());

  // ── Portal yordle: un único pin que cambia de sitio cada día (misma posición para todos). ──
  const [portalDay, setPortalDay] = useState<YordlePortalDay>(() => yordlePortalForDay());
  const [showPortal, setShowPortal] = useState(true);
  const portalRef = useRef<L.LayerGroup>(L.layerGroup());
  const party = pois.find(poi => poi.kind === 'party') ?? null;
  const selected = pois.find(poi => poi.id === selectedId) ?? null;

  const refreshPois = useCallback(async () => {
    try {
      setPois(await loadMapPois());
      setPoisError(null);
    } catch (error) {
      setPoisError(error instanceof Error ? error.message : 'No se pudieron cargar los puntos del mapa');
    }
  }, []);

  useEffect(() => {
    void refreshPois();
  }, [refreshPois, poisRevision]);

  /** Guarda en la API y aplica la respuesta; los errores se muestran en el panel. */
  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setPoisError(null);
    try {
      await task();
    } catch (error) {
      setPoisError(error instanceof Error ? error.message : 'No se pudo guardar');
      void refreshPois();
    } finally {
      setBusy(false);
    }
  }, [refreshPois]);

  const movePoi = useCallback((id: string, x: number, y: number) => run(async () => {
    const saved = await updateMapPoi(id, { x, y });
    setPois(list => list.map(poi => (poi.id === id ? saved : poi)));
    setNotice(saved.kind === 'party' ? 'Ubicación de la party movida' : `«${saved.name}» movido`);
  }), [run]);
  const movePoiRef = useRef(movePoi);
  movePoiRef.current = movePoi;

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
    portalRef.current.addTo(map);
    mineRef.current.addTo(map);
    // Modo «colocar»: el clic en el mapa fija el punto nuevo o la nueva posición del que se mueve.
    const onMapClick = (event: L.LeafletMouseEvent) => {
      const mode = placingRef.current;
      if (!mode) return;
      const { x, y } = latLngPixel(event.latlng);
      if (mode.mode === 'new') {
        setDraft(prev => ({ kind: prev?.kind ?? 'poi', name: prev?.name ?? '', note: prev?.note ?? '', x, y }));
      } else {
        void movePoiRef.current(mode.id, x, y);
      }
      setPlacing(null);
    };
    map.on('click', onMapClick);
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
      map.off('click', onMapClick);
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

  // Pines propios: se rehacen al cambiar la lista, la selección o el borrador.
  useEffect(() => {
    const layer = mineRef.current;
    layer.clearLayers();
    if (!showMine) return;
    for (const poi of pois) {
      const marker = L.marker(pixelLatLng(poi.x, poi.y), {
        icon: customIcon(poi, poi.id === selectedId),
        title: poi.name,
        draggable: isAdmin && !busy,
        riseOnHover: true,
        zIndexOffset: poi.kind === 'party' ? 2000 : 1000,
        keyboard: true,
      });
      marker.on('click', () => {
        setDraft(null);
        setSelectedId(poi.id);
      });
      marker.on('dragend', () => {
        const { x, y } = latLngPixel(marker.getLatLng());
        void movePoiRef.current(poi.id, x, y);
      });
      marker.addTo(layer);
    }
    if (draft) {
      L.marker(pixelLatLng(draft.x, draft.y), {
        icon: customIcon({ kind: draft.kind, name: draft.name.trim() }, true, true),
        interactive: false,
        zIndexOffset: 3000,
      }).addTo(layer);
    }
  }, [pois, selectedId, isAdmin, busy, draft, showMine]);

  // Al pasar la medianoche (Madrid) el portal salta a su ubicación del día nuevo.
  useEffect(() => {
    const timer = setInterval(() => {
      setPortalDay(current => (portalDayKey() === current.dayKey ? current : yordlePortalForDay()));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const layer = portalRef.current;
    layer.clearLayers();
    if (!showPortal) return;
    L.marker(pixelLatLng(portalDay.spot.x, portalDay.spot.y), {
      icon: portalIcon(),
      title: `${YORDLE_PORTAL.name} (hoy)`,
      riseOnHover: true,
      zIndexOffset: 1500,
    })
      .bindPopup(portalPopup(portalDay), { className: 'mapa-popup-wrap', maxWidth: 320, minWidth: 220 })
      .addTo(layer);
  }, [portalDay, showPortal]);

  // Cursor de cruz en modo colocar. Se toca classList a mano: el div es de Leaflet
  // (leaflet-container, leaflet-grab…) y un className de React le borraría esas clases.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.classList.toggle('mapa-canvas--placing', placing !== null);
  }, [placing]);

  // Esc cancela el modo colocar.
  useEffect(() => {
    if (!placing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlacing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  // Si el punto seleccionado desaparece (borrado en otra pestaña), se cierra su panel.
  useEffect(() => {
    if (selectedId && !pois.some(poi => poi.id === selectedId)) setSelectedId(null);
  }, [pois, selectedId]);

  const goToParty = () => {
    if (!party || !mapRef.current) return;
    setShowMine(true);
    const map = mapRef.current;
    map.flyTo(pixelLatLng(party.x, party.y), Math.max(map.getZoom(), 3.5), { duration: 0.8 });
    setSelectedId(party.id);
  };

  const goToPortal = () => {
    const map = mapRef.current;
    if (!map) return;
    setShowPortal(true);
    map.flyTo(pixelLatLng(portalDay.spot.x, portalDay.spot.y), Math.max(map.getZoom(), 3), { duration: 0.8 });
  };

  const startAdding = () => {
    setSelectedId(null);
    setShowMine(true);
    setDraft(null);
    setPlacing(current => (current?.mode === 'new' ? null : { mode: 'new' }));
  };

  const saveDraft = (next: PoiFormDraft) => run(async () => {
    const { poi, replaced } = await createMapPoi(next);
    setPois(list => {
      const rest = list.filter(item => item.id !== poi.id && !(poi.kind === 'party' && item.kind === 'party'));
      return poi.kind === 'party' ? [poi, ...rest] : [...rest, poi];
    });
    setDraft(null);
    setSelectedId(poi.id);
    setNotice(replaced ? 'La ubicación de la party se ha movido aquí' : poi.kind === 'party' ? 'Ubicación de la party guardada' : `«${poi.name}» añadido`);
  });

  const saveDetails = (id: string, patch: { name?: string; note?: string | null }) => run(async () => {
    const saved = await updateMapPoi(id, patch);
    setPois(list => list.map(poi => (poi.id === id ? saved : poi)));
    setNotice('Punto guardado');
  });

  const removePoi = (id: string) => run(async () => {
    await deleteMapPoi(id);
    setPois(list => list.filter(poi => poi.id !== id));
    setSelectedId(null);
    setNotice('Punto borrado');
  });

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
          <button
            type="button"
            className={cx('mapa-chip', 'mapa-chip--mine', showMine && 'mapa-chip--on')}
            aria-pressed={showMine}
            onClick={() => setShowMine(on => !on)}
          >
            Puntos propios{pois.length ? ` (${pois.length})` : ''}
          </button>
          <button
            type="button"
            className={cx('mapa-chip', 'mapa-chip--portal', showPortal && 'mapa-chip--on')}
            aria-pressed={showPortal}
            title="Cambia de ubicación cada día"
            onClick={() => setShowPortal(on => !on)}
          >
            Portal yordle
          </button>
        </div>
        <div className="mapa-actions">
          <button
            type="button"
            className="mapa-action"
            disabled={!party}
            title={party ? `Centrar en ${party.name}` : 'Todavía no hay ubicación de la party'}
            onClick={goToParty}
          >
            {'\u{1F6A9}'} Ir a la party
          </button>
          <button
            type="button"
            className="mapa-action"
            title={`Ubicación de hoy (${portalDay.index + 1} de ${portalDay.total})`}
            onClick={goToPortal}
          >
            {'\u{1F300}'} Ir al portal yordle
          </button>
          {isAdmin && (
            <button
              type="button"
              className={cx('mapa-action', 'mapa-action--primary', placing?.mode === 'new' && 'mapa-action--on')}
              aria-pressed={placing?.mode === 'new'}
              disabled={busy}
              onClick={startAdding}
            >
              {placing?.mode === 'new' ? 'Cancelar' : '＋ Añadir punto'}
            </button>
          )}
        </div>
        <span className="mapa-toolbar__hint">
          {placing
            ? placing.mode === 'new'
              ? 'Haz clic en el mapa donde va el punto · Esc para cancelar'
              : 'Haz clic en la nueva posición · Esc para cancelar'
            : 'Acerca el zoom para ver ciudades y pueblos · clic en un punto para info'}
        </span>
      </div>
      <div className="mapa-stage">
        <div ref={hostRef} className="mapa-canvas" />
        {notice && <div className="mapa-notice" role="status">{notice}</div>}
        {(draft || selected || poisError) && (
          <MapaPoiPanel
            key={draft ? 'draft' : selected?.id ?? 'error'}
            draft={draft}
            selected={draft ? null : selected}
            party={party}
            isAdmin={isAdmin}
            busy={busy}
            error={poisError}
            onDraftChange={setDraft}
            onSaveDraft={next => { void saveDraft(next); }}
            onCancelDraft={() => setDraft(null)}
            onRepick={() => setPlacing({ mode: 'new' })}
            onSaveDetails={(id, patch) => { void saveDetails(id, patch); }}
            onMove={id => setPlacing({ mode: 'move', id })}
            onDelete={id => { void removePoi(id); }}
            onClose={() => {
              setSelectedId(null);
              setPoisError(null);
            }}
          />
        )}
      </div>
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
