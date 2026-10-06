import React, { useEffect, useRef, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { useMapStore } from '../../state/mapStore';

type LeafletMap = any;
type LeafletLayer = any;
type LeafletLatLng = { lat: number; lng: number };
type BaseMapKey = 'satellite' | 'map' | 'terrain';

const BASE_MAPS: Array<{ key: BaseMapKey; label: string }> = [
  { key: 'satellite', label: 'Satellite' },
  { key: 'map', label: 'Map' },
  { key: 'terrain', label: 'Terrain' },
];

const MAX_AOI_DEGREES = 0.12;

function getLeaflet(): any {
  return typeof window !== 'undefined' ? (window as Window & { L?: any }).L : undefined;
}

const MapTypeIcon: React.FC<{ type: BaseMapKey }> = ({ type }) => {
  if (type === 'satellite') {
    return (
      <svg viewBox="0 0 36 28" aria-hidden="true">
        <rect width="36" height="28" rx="5" fill="#66765f" />
        <path d="M0 18 11 11l7 4 8-8 10 5v16H0Z" fill="#3d5149" />
        <path d="m-2 8 13 5 7-3 7 4 12-5v8l-14 4-8-3-15 5Z" fill="#a9a67b" opacity=".8" />
        <circle cx="26" cy="8" r="3" fill="#cfbd76" opacity=".9" />
      </svg>
    );
  }
  if (type === 'terrain') {
    return (
      <svg viewBox="0 0 36 28" aria-hidden="true">
        <rect width="36" height="28" rx="5" fill="#d7e2bd" />
        <path d="M0 21c6-6 9-7 14-4s7 3 11-2 7-4 11-2v15H0Z" fill="#73956c" />
        <path d="M0 7c6-3 9-2 14 1s8 3 12 0 6-2 10-1" fill="none" stroke="#94a978" strokeWidth="2" />
        <path d="M3 14c5-3 8-3 12 0s8 2 12-1 5-2 9-1" fill="none" stroke="#b1be8b" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 36 28" aria-hidden="true">
      <rect width="36" height="28" rx="5" fill="#e4e0c7" />
      <path d="M0 17 36 5M-3 25 39 12" fill="none" stroke="#c2bba5" strokeWidth="5" />
      <path d="M6-2 27 30" fill="none" stroke="#f8f5e9" strokeWidth="4" />
      <path d="M6-2 27 30" fill="none" stroke="#b48d61" strokeWidth="1.4" />
      <path d="M0 5h36M0 24h36" stroke="#a5c9a0" strokeWidth="1.2" opacity=".8" />
    </svg>
  );
};

export const MapAcquisitionView: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapRefInstance = useRef<LeafletMap>(null);
  const rectangleRef = useRef<LeafletLayer>(null);
  const placeMarkerRef = useRef<LeafletLayer>(null);
  const baseLayersRef = useRef<Record<BaseMapKey, LeafletLayer> | null>(null);
  const labelsLayerRef = useRef<LeafletLayer>(null);
  const layerMenuRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<LeafletLatLng | null>(null);
  const lastDragPointRef = useRef<LeafletLatLng | null>(null);
  const draggingRef = useRef(false);
  const selectionMode = useMapStore((state) => state.selectionMode);
  const focusRequest = useMapStore((state) => state.focusRequest);
  const selectedBbox = useMapStore((state) => state.selectedBbox);
  const setSelectionMessage = useMapStore((state) => state.setSelectionMessage);
  const setSelectedBbox = useMapStore((state) => state.setSelectedBbox);
  const [leafletReady, setLeafletReady] = useState(() => Boolean(getLeaflet()));
  const [baseMap, setBaseMap] = useState<BaseMapKey>('satellite');
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  useEffect(() => {
    if (leafletReady) return;
    const timer = window.setInterval(() => {
      if (getLeaflet()) {
        setLeafletReady(true);
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [leafletReady]);

  useEffect(() => {
    const mapElement = mapRef.current;
    const L = getLeaflet();
    if (!mapElement || !L || !leafletReady) return;

    const map: LeafletMap = L.map(mapElement, {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 19,
    }).setView([20.5937, 78.9629], 4);
    mapRefInstance.current = map;

    const imageryLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri World Imagery',
    });
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
    const terrainLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri World Topographic Map',
    });

    const placeLabelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      opacity: 0.95,
      attribution: '&copy; Esri place labels',
    });

    baseLayersRef.current = {
      satellite: imageryLayer,
      map: streetLayer,
      terrain: terrainLayer,
    };
    labelsLayerRef.current = placeLabelsLayer;
    imageryLayer.addTo(map);

    // The satellite tiles do not include names. Put a transparent reference
    // layer above them so cities, roads and regions stay readable.
    map.createPane('heightnet-labels');
    const labelsPane = map.getPane('heightnet-labels');
    if (labelsPane) {
      labelsPane.style.zIndex = '450';
      labelsPane.style.pointerEvents = 'none';
    }
    placeLabelsLayer.options.pane = 'heightnet-labels';
    placeLabelsLayer.remove();
    placeLabelsLayer.addTo(map);

    const showRectangle = (bbox: [number, number, number, number], preview = false) => {
      if (rectangleRef.current) rectangleRef.current.remove();
      const [west, south, east, north] = bbox;
      rectangleRef.current = L.rectangle([[south, west], [north, east]], {
        color: '#d7dee4',
        weight: 2,
        fillColor: '#94a3b8',
        fillOpacity: preview ? 0.12 : 0.18,
      }).addTo(map);
    };

    const finishDrag = (end: LeafletLatLng | null) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      draggingRef.current = false;
      map.dragging.enable();
      if (!start || !end) return;
      const bbox = [
        Math.min(start.lng, end.lng),
        Math.min(start.lat, end.lat),
        Math.max(start.lng, end.lng),
        Math.max(start.lat, end.lat),
      ] as [number, number, number, number];
      if (bbox[2] - bbox[0] < 0.001 || bbox[3] - bbox[1] < 0.001) {
        if (rectangleRef.current) rectangleRef.current.remove();
        rectangleRef.current = null;
        setSelectionMessage('That area is too small. Drag a larger rectangle.');
        return;
      }
      // Sentinel-2 is 10 m data. Keeping the live AOI small avoids creating a
      // multi-million-pixel download and a browser-hostile mesh.
      if (bbox[2] - bbox[0] > MAX_AOI_DEGREES || bbox[3] - bbox[1] > MAX_AOI_DEGREES) {
        if (rectangleRef.current) rectangleRef.current.remove();
        rectangleRef.current = null;
        setSelectionMessage('That area is too large for a live Sentinel-2 build. Keep the rectangle roughly 10 km across or less.');
        return;
      }
      setSelectedBbox(bbox);
    };

    const onMouseDown = (event: any) => {
      if (!useMapStore.getState().selectionMode) return;
      dragStartRef.current = event.latlng;
      lastDragPointRef.current = event.latlng;
      draggingRef.current = true;
      map.dragging.disable();
      setSelectionMessage('Drag to select a rectangular area of interest, then release.');
    };
    const onMouseMove = (event: any) => {
      if (!draggingRef.current || !dragStartRef.current) return;
      const start = dragStartRef.current;
      const point = event.latlng as LeafletLatLng;
      lastDragPointRef.current = point;
      showRectangle([
        Math.min(start.lng, point.lng), Math.min(start.lat, point.lat),
        Math.max(start.lng, point.lng), Math.max(start.lat, point.lat),
      ] as [number, number, number, number], true);
    };
    const onMouseUp = (event: any) => finishDrag(event.latlng as LeafletLatLng);
    // If the user drags into the inspector or outside the browser window,
    // Leaflet does not receive its own mouseup event. Finish using the last
    // point that was still inside the map instead of leaving the map locked.
    const onWindowMouseUp = () => {
      if (draggingRef.current) finishDrag(lastDragPointRef.current);
    };
    const onWindowBlur = () => {
      if (draggingRef.current) finishDrag(lastDragPointRef.current);
    };
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('blur', onWindowBlur);
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('blur', onWindowBlur);
      lastDragPointRef.current = null;
      if (rectangleRef.current) rectangleRef.current.remove();
      if (placeMarkerRef.current) placeMarkerRef.current.remove();
      rectangleRef.current = null;
      placeMarkerRef.current = null;
      baseLayersRef.current = null;
      labelsLayerRef.current = null;
      map.remove();
      mapRefInstance.current = null;
    };
  }, [leafletReady, setSelectedBbox, setSelectionMessage]);

  useEffect(() => {
    const map = mapRefInstance.current;
    const layers = baseLayersRef.current;
    if (!map || !layers) return;
    (Object.entries(layers) as Array<[BaseMapKey, LeafletLayer]>).forEach(([key, layer]) => {
      if (key === baseMap) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
  }, [baseMap, leafletReady]);

  useEffect(() => {
    const map = mapRefInstance.current;
    const labelsLayer = labelsLayerRef.current;
    if (!map || !labelsLayer) return;
    if (labelsVisible) {
      if (!map.hasLayer(labelsLayer)) labelsLayer.addTo(map);
    } else if (map.hasLayer(labelsLayer)) {
      map.removeLayer(labelsLayer);
    }
  }, [labelsVisible, leafletReady]);

  useEffect(() => {
    if (!layerMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (layerMenuRef.current && !layerMenuRef.current.contains(event.target as Node)) {
        setLayerMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLayerMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [layerMenuOpen]);

  useEffect(() => {
    const map = mapRefInstance.current;
    if (!map || !focusRequest) return;
    map.flyTo([focusRequest.lat, focusRequest.lon], 13, { animate: true, duration: 1.2 });
    const L = getLeaflet();
    if (!L) return;
    if (placeMarkerRef.current) placeMarkerRef.current.remove();
    placeMarkerRef.current = L.circleMarker([focusRequest.lat, focusRequest.lon], {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: '#1677ff',
      fillOpacity: 0.95,
    }).addTo(map);
    placeMarkerRef.current.bindTooltip(focusRequest.label, {
      permanent: true,
      direction: 'top',
      offset: [0, -7],
      className: 'heightnet-place-label',
    }).openTooltip();
  }, [focusRequest]);

  useEffect(() => {
    const map = mapRefInstance.current;
    const L = getLeaflet();
    if (!map || !L) return;
    if (rectangleRef.current) rectangleRef.current.remove();
    rectangleRef.current = null;
    if (!selectedBbox) return;
    const [west, south, east, north] = selectedBbox;
    rectangleRef.current = L.rectangle([[south, west], [north, east]], {
      color: '#d7dee4', weight: 2, fillColor: '#94a3b8', fillOpacity: 0.18,
    }).addTo(map);
    map.fitBounds([[south, west], [north, east]], { padding: [24, 24], animate: true });
  }, [selectedBbox]);

  return (
    <div className="map-acquisition-stage">
      <div ref={mapRef} className={`map-acquisition-canvas ${selectionMode ? 'selection-mode' : ''}`} aria-label="HeightNet world map" />
      <div className="map-style-switcher" ref={layerMenuRef}>
        <button
          type="button"
          className={`map-style-trigger ${layerMenuOpen ? 'open' : ''}`}
          aria-label="Choose map style"
          aria-expanded={layerMenuOpen}
          title="Map style"
          onClick={() => setLayerMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="3" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <rect x="3" y="8" width="13" height="13" rx="2" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        {layerMenuOpen ? (
          <div className="map-style-popover" role="dialog" aria-label="Map style options">
            <div className="map-style-options">
              {BASE_MAPS.map((option) => (
                <button
                  type="button"
                  key={option.key}
                  className={`map-style-option ${baseMap === option.key ? 'selected' : ''}`}
                  aria-pressed={baseMap === option.key}
                  onClick={() => setBaseMap(option.key)}
                >
                  <span className="map-style-thumbnail"><MapTypeIcon type={option.key} /></span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <div className="map-style-divider" />
            <label className="map-label-toggle">
              <input type="checkbox" checked={labelsVisible} onChange={(event) => setLabelsVisible(event.target.checked)} />
              <span className="map-label-icon" aria-hidden="true">Aa</span>
              <span>Place labels</span>
            </label>
          </div>
        ) : null}
      </div>
      <div className={`map-acquisition-hint ${selectionMode ? 'active' : ''}`}>
        <MapPinned size={13} />
        {selectionMode ? 'Drag to select a rectangular area of interest' : 'Search a place, then select an area of interest'}
      </div>
      {!leafletReady ? (
        <div className="map-acquisition-error">Loading the world map...</div>
      ) : null}
    </div>
  );
};
