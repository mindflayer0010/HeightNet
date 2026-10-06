import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Navigation,
  Footprints,
  Orbit,
  RotateCw,
  Play,
  Pause,
  Download,
  ExternalLink,
} from 'lucide-react';
import { useViewportStore } from '../../state/viewportStore';
import { useLayerStore } from '../../state/layerStore';
import type { CameraMode, TerrainMaterialMode } from '../../types/viewport';
import { useProjectStore } from '../../state/projectStore';
import { useAppStore } from '../../state/appStore';
import { API_BASE, openInQgis } from '../../integration/api';

export const ThreeDInspector: React.FC = () => {
  const {
    viewport3D,
    setCameraMode3D,
    setCameraFov3D,
    setCameraSpeed3D,
    setAutoOrbitSpeed3D,
    setAutoOrbitDirection3D,
    setAutoOrbitElevation3D,
    setAutoOrbitTargetType3D,
    toggleAutoOrbitPaused3D,
    setVerticalExaggeration3D,
    setMaterialMode3D,
    toggleWireframe3D,
    toggleGrid3D,
    setSunAzimuth3D,
    setSunAltitude3D,
    setMeshResolution3D,
    resetCamera3D,
  } = useViewportStore();

  const { layers, selectedLayerId, setLayerOpacity, toggleLayerVisibility } = useLayerStore();
  const hasGeneratedMesh = useProjectStore((state) => state.project.has3DReady);
  const outputs = useProjectStore((state) => state.project.outputs);
  const rawOutputPaths = useProjectStore((state) => state.project.rawOutputPaths);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const notify = useAppStore((state) => state.notify);
  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const terrainLayer = layers.find((l) => l.id === 'layer-terrain-mesh');

  // Rollout collapse states
  const [openCamera, setOpenCamera] = useState(true);
  const [openView, setOpenView] = useState(true);
  const [openScene, setOpenScene] = useState(true);
  const [openOverlays, setOpenOverlays] = useState(true);
  const [openLayer, setOpenLayer] = useState(true);
  const [openingQgis, setOpeningQgis] = useState(false);
  const [qgisProjectUrl, setQgisProjectUrl] = useState<string | null>(null);

  const openCurrentResultInQgis = async () => {
    const candidates = [
      { path: rawOutputPaths.input, label: 'RGB input', visible: true, opacity: 1 },
      { path: rawOutputPaths.dsm, label: 'Estimated DSM', visible: true, opacity: 0.55 },
      { path: rawOutputPaths.agl, label: 'Predicted AGL', visible: false, opacity: 0.75 },
      { path: rawOutputPaths.relative, label: 'Relative depth', visible: false, opacity: 0.75 },
      { path: rawOutputPaths.confidence, label: 'Calibration confidence', visible: false, opacity: 0.7 },
      { path: rawOutputPaths.uncertainty, label: 'Calibration uncertainty', visible: false, opacity: 0.7 },
      { path: rawOutputPaths.sceneRisk, label: 'Scene risk flags', visible: false, opacity: 0.65 },
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

  if (!hasGeneratedMesh) {
    return (
      <div className="inspector-empty-state">
        <strong>No 3D terrain loaded</strong>
        <span>Run the HeightNet pipeline first. Camera and terrain controls will appear with the real mesh.</span>
        <button onClick={() => setActiveView('MAP')}>Open map</button>
        <button onClick={() => {
          setActiveView('2D');
          window.setTimeout(() => window.dispatchEvent(new CustomEvent('heightnet:open-upload')), 0);
        }}>Upload image</button>
      </div>
    );
  }

  const cameraModes: { id: CameraMode; label: string; icon: React.ReactNode; tooltip: string }[] = [
    { id: 'orbit', label: 'Orbit', icon: <Orbit size={11} />, tooltip: 'Manual turntable orbit' },
    { id: 'auto-orbit', label: 'Auto Orbit', icon: <RotateCw size={11} />, tooltip: 'Auto orbit around terrain' },
    { id: 'flythrough', label: 'Fly (6-DOF)', icon: <Navigation size={11} />, tooltip: '6-DOF flythrough camera' },
    { id: 'walkthrough', label: 'Walk', icon: <Footprints size={11} />, tooltip: 'Ground-level walkthrough' },
  ];

  const materialModes: { id: TerrainMaterialMode; label: string }[] = [
    { id: 'satellite', label: 'Satellite Orthophoto' },
    { id: 'hypsometric', label: 'Hypsometric DEM Tint' },
    { id: 'shaded-relief', label: 'Shaded Relief' },
    { id: 'surface', label: 'Facet Surface' },
  ];

  return (
    <div className="inspector-content">
      <div className="rollout-section">
        <div className="rollout-header">
          <div className="rollout-title"><Download size={12} /><span>Export results</span></div>
        </div>
        <div className="rollout-body export-links">
          <button className="map-qgis-button" onClick={() => void openCurrentResultInQgis()} disabled={openingQgis}>
            <ExternalLink size={11} /> {openingQgis ? 'Preparing QGIS project...' : 'Open all layers in QGIS'}
          </button>
          {qgisProjectUrl ? <a className="map-qgis-download" href={`${API_BASE}${qgisProjectUrl}`} download>Download QGIS project file</a> : null}
          {([
            ['dsm', 'DSM GeoTIFF'],
            ['agl', 'AGL GeoTIFF'],
            ['relative', 'Relative depth'],
            ['confidence', 'Confidence map'],
            ['mesh', 'Terrain OBJ'],
          ] as const).map(([key, label]) => outputs[key] ? (
            <a key={key} href={outputs[key] ?? '#'} download className="export-link">
              <Download size={11} /> {label}
            </a>
          ) : null)}
        </div>
      </div>

      {/* 1. CAMERA SYSTEM ROLLOUT */}
      <div className="rollout-section">
        <div className="rollout-header" onClick={() => setOpenCamera(!openCamera)}>
          <div className="rollout-title">
            {openCamera ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Camera Navigation System</span>
          </div>
        </div>

        {openCamera && (
          <div className="rollout-body">
            <div className="desktop-segmented" role="group" aria-label="Camera Mode">
              {cameraModes.map((mode) => (
                <button
                  key={mode.id}
                  className={`desktop-segmented-btn ${viewport3D.cameraMode === mode.id ? 'active' : ''}`}
                  onClick={() => setCameraMode3D(mode.id)}
                  title={mode.tooltip}
                  aria-pressed={viewport3D.cameraMode === mode.id}
                >
                  {mode.icon}
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>

            {viewport3D.cameraMode === 'auto-orbit' ? (
              <>
                {/* Pause / Resume Button */}
                <div style={{ marginTop: '5px', marginBottom: '3px' }}>
                  <button
                    className={`desktop-action-btn ${viewport3D.autoOrbit.paused ? 'warning' : 'active'}`}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '24px' }}
                    onClick={toggleAutoOrbitPaused3D}
                    title={viewport3D.autoOrbit.paused ? 'Resume Continuous Rotation' : 'Pause Continuous Rotation'}
                  >
                    {viewport3D.autoOrbit.paused ? <Play size={12} /> : <Pause size={12} />}
                    <span>{viewport3D.autoOrbit.paused ? 'Resume Orbit' : 'Pause Orbit'}</span>
                  </button>
                </div>

                {/* Orbit Speed */}
                <div className="prop-row">
                  <span className="prop-label">Orbit Speed</span>
                  <div className="prop-field">
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={viewport3D.autoOrbit.speed}
                      onChange={(e) => setAutoOrbitSpeed3D(parseFloat(e.target.value))}
                      className="prop-slider"
                      aria-label="Orbit Speed"
                    />
                    <span className="prop-num-box">{viewport3D.autoOrbit.speed.toFixed(1)}x</span>
                  </div>
                </div>

                {/* Direction */}
                <div className="prop-row">
                  <span className="prop-label">Direction</span>
                  <div className="desktop-segmented" style={{ flex: 1, minWidth: '120px' }}>
                    <button
                      className={`desktop-segmented-btn ${viewport3D.autoOrbit.direction === 'clockwise' ? 'active' : ''}`}
                      onClick={() => setAutoOrbitDirection3D('clockwise')}
                      title="Clockwise Rotation"
                    >
                      <span>Clockwise</span>
                    </button>
                    <button
                      className={`desktop-segmented-btn ${viewport3D.autoOrbit.direction === 'counter-clockwise' ? 'active' : ''}`}
                      onClick={() => setAutoOrbitDirection3D('counter-clockwise')}
                      title="Counter-Clockwise Rotation"
                    >
                      <span>Counter-CW</span>
                    </button>
                  </div>
                </div>

                {/* Elevation */}
                <div className="prop-row">
                  <span className="prop-label">Elevation</span>
                  <div className="prop-field">
                    <input
                      type="range"
                      min="25"
                      max="220"
                      step="1"
                      value={viewport3D.autoOrbit.elevation}
                      onChange={(e) => setAutoOrbitElevation3D(parseInt(e.target.value, 10))}
                      className="prop-slider"
                      aria-label="Orbit Elevation"
                    />
                    <span className="prop-num-box">{viewport3D.autoOrbit.elevation}m</span>
                  </div>
                </div>

                {/* Orbit Target */}
                <div className="prop-row">
                  <span className="prop-label">Orbit Target</span>
                  <div className="prop-field">
                    <select
                      className="prop-select"
                      value={viewport3D.autoOrbit.targetType}
                      onChange={(e) => setAutoOrbitTargetType3D(e.target.value as 'center' | 'layer' | 'custom')}
                      aria-label="Orbit Target"
                    >
                      <option value="center">Terrain Center</option>
                      <option value="layer">Selected Layer</option>
                      <option value="custom">Custom Target</option>
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="prop-row" style={{ marginTop: '3px' }}>
                  <span className="prop-label">Field of View</span>
                  <div className="prop-field">
                    <input
                      type="range"
                      min="30"
                      max="80"
                      step="1"
                      value={viewport3D.cameraFov}
                      onChange={(e) => setCameraFov3D(parseInt(e.target.value, 10))}
                      className="prop-slider"
                      aria-label="Camera FOV"
                    />
                    <span className="prop-num-box">{viewport3D.cameraFov}°</span>
                  </div>
                </div>

                <div className="prop-row">
                  <span className="prop-label">Flight Speed</span>
                  <div className="prop-field">
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={viewport3D.cameraSpeed}
                      onChange={(e) => setCameraSpeed3D(parseFloat(e.target.value))}
                      className="prop-slider"
                      aria-label="Navigation Speed"
                    />
                    <span className="prop-num-box">{viewport3D.cameraSpeed.toFixed(1)}x</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 2. VIEW ORIENTATION ROLLOUT */}
      <div className="rollout-section">
        <div className="rollout-header" onClick={() => setOpenView(!openView)}>
          <div className="rollout-title">
            {openView ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>View Orientation</span>
          </div>
        </div>

        {openView && (
          <div className="rollout-body">
            <div className="prop-action-row">
              <button
                className="desktop-action-btn"
                onClick={() => setCameraFov3D(Math.max(25, viewport3D.cameraFov - 5))}
                title="Zoom Camera (Narrow FOV)"
              >
                <span>Zoom In (+5°)</span>
              </button>

              <button
                className="desktop-action-btn"
                onClick={() => setCameraFov3D(Math.min(85, viewport3D.cameraFov + 5))}
                title="Zoom Camera (Wide FOV)"
              >
                <span>Zoom Out (-5°)</span>
              </button>
            </div>

            <button
              className="desktop-action-btn"
              style={{ width: '100%', marginTop: '3px' }}
              onClick={resetCamera3D}
              title="Reset Camera to Home Extents (R)"
            >
              <RotateCcw size={11} />
              <span>Reset Camera</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. SCENE & ILLUMINATION ROLLOUT */}
      <div className="rollout-section">
        <div className="rollout-header" onClick={() => setOpenScene(!openScene)}>
          <div className="rollout-title">
            {openScene ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Scene & Illumination</span>
          </div>
        </div>

        {openScene && (
          <div className="rollout-body">
            <div className="prop-row">
              <span className="prop-label">Elevation Scale</span>
              <div className="prop-field">
                <input
                  type="range"
                  min="0.5"
                  max="4.0"
                  step="0.1"
                  value={viewport3D.verticalExaggeration}
                  onChange={(e) => setVerticalExaggeration3D(parseFloat(e.target.value))}
                  className="prop-slider"
                  aria-label="Vertical Exaggeration"
                />
                <span className="prop-num-box">
                  {viewport3D.verticalExaggeration.toFixed(1)}x
                </span>
              </div>
            </div>

            <div className="prop-row">
              <span className="prop-label">Sun Azimuth</span>
              <div className="prop-field">
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={viewport3D.sunAzimuth}
                  onChange={(e) => setSunAzimuth3D(parseInt(e.target.value, 10))}
                  className="prop-slider"
                  aria-label="Sun Azimuth"
                />
                <span className="prop-num-box">{viewport3D.sunAzimuth}°</span>
              </div>
            </div>

            <div className="prop-row">
              <span className="prop-label">Sun Altitude</span>
              <div className="prop-field">
                <input
                  type="range"
                  min="10"
                  max="85"
                  step="2"
                  value={viewport3D.sunAltitude}
                  onChange={(e) => setSunAltitude3D(parseInt(e.target.value, 10))}
                  className="prop-slider"
                  aria-label="Sun Altitude"
                />
                <span className="prop-num-box">{viewport3D.sunAltitude}°</span>
              </div>
            </div>

            <div className="prop-row" style={{ marginTop: '2px' }}>
              <span className="prop-label">Surface Material</span>
              <select
                value={viewport3D.materialMode}
                onChange={(e) => setMaterialMode3D(e.target.value as TerrainMaterialMode)}
                style={{ flex: 1, height: '22px' }}
                aria-label="Terrain Surface Material"
              >
                {materialModes.map((mat) => (
                  <option key={mat.id} value={mat.id}>
                    {mat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="prop-row">
              <span className="prop-label">Tessellation</span>
              <select
                value={viewport3D.meshResolution}
                onChange={(e) => setMeshResolution3D(e.target.value as any)}
                style={{ flex: 1, height: '22px' }}
                aria-label="Mesh Resolution"
              >
                <option value="low">Low (64×64)</option>
                <option value="medium">Medium (128×128)</option>
                <option value="high">High (256×256)</option>
                <option value="ultra">Ultra (384×384)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 4. TOPOLOGY & OVERLAYS ROLLOUT */}
      <div className="rollout-section">
        <div className="rollout-header" onClick={() => setOpenOverlays(!openOverlays)}>
          <div className="rollout-title">
            {openOverlays ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Topology & Overlays</span>
          </div>
        </div>

        {openOverlays && (
          <div className="rollout-body">
            <div className="prop-action-row-4">
              <button
                className={`desktop-action-btn ${viewport3D.wireframeVisible ? 'active' : ''}`}
                onClick={toggleWireframe3D}
              >
                <span>Wireframe</span>
              </button>

              <button
                className={`desktop-action-btn ${viewport3D.gridVisible ? 'active' : ''}`}
                onClick={toggleGrid3D}
              >
                <span>Datum Grid</span>
              </button>

              <button
                className={`desktop-action-btn ${terrainLayer?.visible ?? true ? 'active' : ''}`}
                onClick={() => {
                  if (terrainLayer) toggleLayerVisibility(terrainLayer.id);
                }}
              >
                <span>Terrain Mesh</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. ACTIVE LAYER STYLING ROLLOUT */}
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
                <span className="prop-label">Opacity</span>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
};
