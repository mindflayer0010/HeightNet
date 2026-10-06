import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Maximize2,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { useViewportStore } from '../../state/viewportStore';
import { useProjectStore } from '../../state/projectStore';
import { useLayerStore } from '../../state/layerStore';
import type { ColormapPreset } from '../../types/viewport';
import { useAppStore } from '../../state/appStore';
import { API_BASE, openInQgis } from '../../integration/api';

export const TwoDInspector: React.FC = () => {
  const {
    viewport2D,
    setZoom2D,
    fit2DToView,
    reset2DView,
    setBrightness2D,
    setContrast2D,
    setOpacity2D,
    setColormap2D,
  } = useViewportStore();

  const project = useProjectStore((state) => state.project);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const notify = useAppStore((state) => state.notify);
  const { layers, selectedLayerId, setLayerOpacity, setLayerBlendMode } = useLayerStore();

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const hasData = Boolean(project.sourceRasterUrl || project.outputs.dsm);

  // Section rollout open states
  const [openView, setOpenView] = useState(true);
  const [openTone, setOpenTone] = useState(true);
  const [openLayer, setOpenLayer] = useState(true);
  const [openInfo, setOpenInfo] = useState(true);
  const [openingQgis, setOpeningQgis] = useState(false);
  const [qgisProjectUrl, setQgisProjectUrl] = useState<string | null>(null);

  const openCurrentResultInQgis = async () => {
    const raw = project.rawOutputPaths;
    const candidates = [
      { path: raw.input, label: 'RGB input', visible: true, opacity: 1 },
      { path: raw.dsm, label: 'Estimated DSM', visible: true, opacity: 0.55 },
      { path: raw.agl, label: 'Predicted AGL', visible: false, opacity: 0.75 },
      { path: raw.relative, label: 'Relative depth', visible: false, opacity: 0.75 },
      { path: raw.confidence, label: 'Calibration confidence', visible: false, opacity: 0.7 },
      { path: raw.uncertainty, label: 'Calibration uncertainty', visible: false, opacity: 0.7 },
      { path: raw.sceneRisk, label: 'Scene risk flags', visible: false, opacity: 0.65 },
    ].filter((layer): layer is { path: string; label: string; visible: boolean; opacity: number } => Boolean(layer.path));
    if (!candidates.length) return;
    setOpeningQgis(true);
    try {
      const opened = await openInQgis(candidates);
      setQgisProjectUrl(opened.project_url);
      notify(opened.qgis_launched ? 'QGIS opened with the result layers' : 'QGIS project created. Open it from the download link.', opened.qgis_launched ? 'success' : 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create the QGIS project', 'warning');
    } finally {
      setOpeningQgis(false);
    }
  };

  if (!hasData) {
    return (
      <div className="inspector-empty-state">
        <strong>No raster loaded</strong>
        <span>Upload an image or fetch Sentinel-2 data from Map Acquisition.</span>
        <button onClick={() => setActiveView('MAP')}>Open map</button>
        <button onClick={() => {
          window.setTimeout(() => window.dispatchEvent(new CustomEvent('heightnet:open-upload')), 0);
        }}>Upload image</button>
      </div>
    );
  }

  const colormaps: { label: string; value: ColormapPreset }[] = [
    { label: 'Natural Multispectral', value: 'natural' },
    { label: 'Viridis (Elevation DEM)', value: 'viridis' },
    { label: 'Turbo (Spectral Ramp)', value: 'turbo' },
    { label: 'Terrain Hypsometric', value: 'terrain' },
  ];

  return (
    <div className="inspector-content">
      <div className="rollout-section">
        <div className="rollout-header">
          <div className="rollout-title"><ExternalLink size={12} /><span>Desktop analysis</span></div>
        </div>
        <div className="rollout-body">
          <button className="map-qgis-button" onClick={() => void openCurrentResultInQgis()} disabled={openingQgis}>
            <ExternalLink size={11} /> {openingQgis ? 'Preparing QGIS project...' : 'Open all layers in QGIS'}
          </button>
          {qgisProjectUrl ? <a className="map-qgis-download" href={`${API_BASE}${qgisProjectUrl}`} download>Download QGIS project file</a> : null}
        </div>
      </div>

      {/* 1. VIEW NAVIGATION ROLLOUT */}
      <div className="rollout-section">
        <div className="rollout-header" onClick={() => setOpenView(!openView)}>
          <div className="rollout-title">
            {openView ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>View Navigation</span>
          </div>
        </div>

        {openView && (
          <div className="rollout-body">
            <div className="prop-action-row">
              <button
                className="desktop-action-btn"
                onClick={fit2DToView}
                title="Fit Raster Extents to Viewport (F)"
              >
                <Maximize2 size={11} />
                <span>Fit Extents</span>
              </button>

              <button
                className="desktop-action-btn"
                onClick={() => setZoom2D(1.0)}
                title="100% 1:1 Actual Pixel Scale"
              >
                <span>Actual Size (1:1)</span>
              </button>
            </div>

            <button
              className="desktop-action-btn"
              style={{ width: '100%', marginTop: '3px' }}
              onClick={reset2DView}
              title="Reset Zoom & Pan (R)"
            >
              <RotateCcw size={11} />
              <span>Reset Viewport</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. DISPLAY & RADIOMETRIC TONE ROLLOUT */}
      <div className="rollout-section">
        <div className="rollout-header" onClick={() => setOpenTone(!openTone)}>
          <div className="rollout-title">
            {openTone ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Display & Radiometric Tone</span>
          </div>
        </div>

        {openTone && (
          <div className="rollout-body">
            <div className="prop-row">
              <span className="prop-label">Brightness</span>
              <div className="prop-field">
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={viewport2D.brightness}
                  onChange={(e) => setBrightness2D(parseFloat(e.target.value))}
                  className="prop-slider"
                  aria-label="Brightness"
                />
                <span className="prop-num-box">
                  {Math.round(viewport2D.brightness * 100)}%
                </span>
              </div>
            </div>

            <div className="prop-row">
              <span className="prop-label">Contrast</span>
              <div className="prop-field">
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={viewport2D.contrast}
                  onChange={(e) => setContrast2D(parseFloat(e.target.value))}
                  className="prop-slider"
                  aria-label="Contrast"
                />
                <span className="prop-num-box">
                  {Math.round(viewport2D.contrast * 100)}%
                </span>
              </div>
            </div>

            <div className="prop-row">
              <span className="prop-label">Raster Opacity</span>
              <div className="prop-field">
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={viewport2D.opacity}
                  onChange={(e) => setOpacity2D(parseFloat(e.target.value))}
                  className="prop-slider"
                  aria-label="Raster Opacity"
                />
                <span className="prop-num-box">
                  {Math.round(viewport2D.opacity * 100)}%
                </span>
              </div>
            </div>

            <div className="prop-row" style={{ marginTop: '2px' }}>
              <span className="prop-label">Color Ramp</span>
              <select
                value={viewport2D.colormap}
                onChange={(e) => setColormap2D(e.target.value as ColormapPreset)}
                style={{ flex: 1, height: '22px' }}
                aria-label="Color Ramp"
              >
                {colormaps.map((cm) => (
                  <option key={cm.value} value={cm.value}>
                    {cm.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 3. ACTIVE LAYER STYLING ROLLOUT (GIS Standard: Properties in Inspector) */}
      {selectedLayer && (
        <div className="rollout-section">
          <div className="rollout-header" onClick={() => setOpenLayer(!openLayer)}>
            <div className="rollout-title">
              {openLayer ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Layer: {selectedLayer.name}</span>
            </div>
            <span className="dw-badge">{selectedLayer.typeBadge}</span>
          </div>

          {openLayer && (
            <div className="rollout-body">
              <div className="prop-row">
                <span className="prop-label">Layer Opacity</span>
                <div className="prop-field">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={selectedLayer.opacity}
                    onChange={(e) => setLayerOpacity(selectedLayer.id, parseFloat(e.target.value))}
                    className="prop-slider"
                    aria-label="Layer Opacity"
                  />
                  <span className="prop-num-box">
                    {Math.round(selectedLayer.opacity * 100)}%
                  </span>
                </div>
              </div>

              <div className="prop-row">
                <span className="prop-label">Blend Mode</span>
                <select
                  value={selectedLayer.blendMode || 'normal'}
                  onChange={(e) => setLayerBlendMode(selectedLayer.id, e.target.value as any)}
                  style={{ flex: 1, height: '22px' }}
                  aria-label="Layer Blend Mode"
                >
                  <option value="normal">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. DATASET SPECIFICATIONS ROLLOUT */}
      <div className="rollout-section">
        <div className="rollout-header" onClick={() => setOpenInfo(!openInfo)}>
          <div className="rollout-title">
            {openInfo ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Raster Information</span>
          </div>
        </div>

        {openInfo && (
          <div className="rollout-body">
            <div className="gis-meta-table">
              <div className="gis-meta-row">
                <span className="gis-meta-label">Width</span>
                <span className="gis-meta-val">{project.metadata.dimensions.width} px</span>
              </div>
              <div className="gis-meta-row">
                <span className="gis-meta-label">Height</span>
                <span className="gis-meta-val">{project.metadata.dimensions.height} px</span>
              </div>
              <div className="gis-meta-row">
                <span className="gis-meta-label">Ground Resolution</span>
                <span className="gis-meta-val">
                  {project.metadata.dimensions.resolutionMeters} m/px (GSD)
                </span>
              </div>
              <div className="gis-meta-row">
                <span className="gis-meta-label">File Type</span>
                <span className="gis-meta-val">Input or generated raster</span>
              </div>
              <div className="gis-meta-row">
                <span className="gis-meta-label">Channels</span>
                <span className="gis-meta-val">{project.metadata.dimensions.bands} bands</span>
              </div>
              <div className="gis-meta-row">
                <span className="gis-meta-label">CRS</span>
                <span className="gis-meta-val" title={project.metadata.crs}>
                  {project.metadata.crs}
                </span>
              </div>
              <div className="gis-meta-row">
                <span className="gis-meta-label">Datum</span>
                <span className="gis-meta-val">Source metadata</span>
              </div>
              <div className="gis-meta-row">
                <span className="gis-meta-label">Elevation Min</span>
                <span className="gis-meta-val">
                  {project.metadata.elevationStats.min.toLocaleString()} m AMSL
                </span>
              </div>
              <div className="gis-meta-row">
                <span className="gis-meta-label">Elevation Max</span>
                <span className="gis-meta-val">
                  {project.metadata.elevationStats.max.toLocaleString()} m AMSL
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
