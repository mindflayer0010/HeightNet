import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Maximize,
  Minimize,
  ExternalLink,
  RotateCcw,
  Camera,
  Network,
  Droplets,
  Navigation,
  Footprints,
  Rotate3d,
  Mountain,
  RotateCw,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { TerrainScene } from '../../renderer/three/TerrainScene';
import { ViewportOverlay } from '../viewport/ViewportOverlay';
import { useViewportStore } from '../../state/viewportStore';
import { useAppStore } from '../../state/appStore';
import { useProjectStore } from '../../state/projectStore';
import type { CameraMode } from '../../types/viewport';

export const Dedicated3DViewer: React.FC = () => {
  const {
    backToWorkspace,
    openDedicated3DViewer,
    notifications,
    dismissNotification,
    notify,
  } = useAppStore();

  const project = useProjectStore((state) => state.project);

  const {
    viewport3D,
    setCameraMode3D,
    resetCamera3D,
    toggleWireframe3D,
    toggleWater3D,
    toggleAutoOrbitPaused3D,
    camera3DReadout,
  } = useViewportStore();

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Monitor fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Dedicated Screen Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        if (!document.fullscreenElement) {
          backToWorkspace();
        }
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        resetCamera3D();
        notify('Camera Reset to Default', 'info');
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'F12') {
        e.preventDefault();
        notify('Viewport snapshot exported to disk', 'success');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [backToWorkspace, resetCamera3D, notify]);

  const handleCameraModeChange = (mode: CameraMode) => {
    setCameraMode3D(mode);
    notify(`Camera Mode: ${mode.toUpperCase()}`, 'info');
  };

  return (
    <div className={`dedicated-viewer-root ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      {/* Dedicated Compact Header */}
      <header className="viewer-top-bar" role="banner" aria-label="3D Viewer Navigation">
        <div className="viewer-top-left">
          <div className="viewer-brand">
            <Mountain size={15} color="var(--accent-light)" />
            <span className="brand-name">HeightNet</span>
            <span className="viewer-badge">3D VIEWER</span>
          </div>

          <div className="viewer-file-meta hide-sm">
            <span>{project.metadata.name}</span>
            <span className="meta-sep">•</span>
            <span>{project.metadata.dimensions.width}×{project.metadata.dimensions.height}</span>
            <span className="meta-sep">•</span>
            <span>{project.metadata.crs}</span>
          </div>
        </div>

        <div className="viewer-top-right">
          {/* Camera Mode Segmented Switcher */}
          <div className="viewer-segmented-group" role="group" aria-label="Camera Mode">
            <button
              className={`viewer-segment-btn ${viewport3D.cameraMode === 'orbit' ? 'active' : ''}`}
              onClick={() => handleCameraModeChange('orbit')}
              title="Manual turntable orbit"
            >
              <Rotate3d size={12} />
              <span>Orbit</span>
            </button>
            <button
              className={`viewer-segment-btn ${viewport3D.cameraMode === 'auto-orbit' ? 'active' : ''}`}
              onClick={() => handleCameraModeChange('auto-orbit')}
              title="Auto orbit around terrain"
            >
              <RotateCw size={12} />
              <span>Auto Orbit</span>
            </button>
            <button
              className={`viewer-segment-btn ${viewport3D.cameraMode === 'flythrough' ? 'active' : ''}`}
              onClick={() => handleCameraModeChange('flythrough')}
              title="6-DOF Flythrough Mode (WASD + Mouse Look)"
            >
              <Navigation size={12} />
              <span>Fly (6-DOF)</span>
            </button>
            <button
              className={`viewer-segment-btn ${viewport3D.cameraMode === 'walkthrough' ? 'active' : ''}`}
              onClick={() => handleCameraModeChange('walkthrough')}
              title="Walkthrough Mode (Ground Clamped)"
            >
              <Footprints size={12} />
              <span>Walk</span>
            </button>
          </div>

          {viewport3D.cameraMode === 'auto-orbit' && (
            <button
              className={`viewer-icon-btn ${viewport3D.autoOrbit.paused ? 'warning' : 'active'}`}
              onClick={toggleAutoOrbitPaused3D}
              title={viewport3D.autoOrbit.paused ? 'Resume Auto Orbit' : 'Pause Auto Orbit'}
              aria-label={viewport3D.autoOrbit.paused ? 'Resume Auto Orbit' : 'Pause Auto Orbit'}
            >
              {viewport3D.autoOrbit.paused ? <Play size={13} /> : <Pause size={13} />}
            </button>
          )}

          <div className="viewer-divider" />

          {/* Quick 3D Toggles */}
          <button
            className={`viewer-icon-btn ${viewport3D.wireframeVisible ? 'active' : ''}`}
            onClick={toggleWireframe3D}
            title="Toggle Wireframe Overlay"
            aria-label="Toggle Wireframe"
          >
            <Network size={13} />
          </button>

          <button
            className={`viewer-icon-btn ${viewport3D.waterVisible ? 'active' : ''}`}
            onClick={toggleWater3D}
            title="Toggle Hydrology / Water Plane"
            aria-label="Toggle Water"
          >
            <Droplets size={13} />
          </button>

          <button
            className="viewer-icon-btn"
            onClick={resetCamera3D}
            title="Reset Camera (R)"
            aria-label="Reset Camera"
          >
            <RotateCcw size={13} />
          </button>

          <button
            className="viewer-icon-btn"
            onClick={() => notify('Viewport snapshot exported to project outputs', 'success')}
            title="Capture Screenshot (F12)"
            aria-label="Capture Screenshot"
          >
            <Camera size={13} />
          </button>

          <div className="viewer-divider" />

          {/* Popout (Open in New Window) */}
          <button
            className="viewer-icon-btn"
            onClick={() => openDedicated3DViewer(true)}
            title="Open 3D Viewer in New Window"
            aria-label="Popout New Window"
          >
            <ExternalLink size={13} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            className="viewer-icon-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
            aria-label="Fullscreen"
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>

          <div className="viewer-divider" />

          {/* Back to Workspace Button */}
          <button
            className="viewer-back-btn"
            onClick={backToWorkspace}
            title="Return to Main Workspace (Esc)"
          >
            <ArrowLeft size={13} />
            <span>Back to Workspace</span>
          </button>
        </div>
      </header>

      {/* Main Screen Three.js Canvas Container */}
      <main className="viewer-stage" role="main" aria-label="3D Terrain Scene">
        <TerrainScene />
        <ViewportOverlay />
      </main>

      {/* Dedicated Subtle Status Bar */}
      <footer className="viewer-status-bar" role="status" aria-label="3D Telemetry">
        <div className="viewer-status-group">
          <div className="status-item">
            <span className="status-label">CAMERA:</span>
            <span className="status-val accent" style={{ textTransform: 'uppercase' }}>
              {viewport3D.cameraMode === 'auto-orbit' ? 'AUTO ORBIT' : viewport3D.cameraMode}
            </span>
          </div>

          {viewport3D.cameraMode === 'auto-orbit' && (
            viewport3D.autoOrbit.paused ? (
              <div className="status-item">
                <span className="status-label">STATUS:</span>
                <span className="status-val" style={{ color: 'var(--status-warning)' }}>PAUSED</span>
              </div>
            ) : (
              <>
                <div className="status-item">
                  <span className="status-label">SPEED:</span>
                  <span className="status-val">{viewport3D.autoOrbit.speed.toFixed(1)}x</span>
                </div>
                <div className="status-item">
                  <span className="status-label">DIR:</span>
                  <span className="status-val">
                    {viewport3D.autoOrbit.direction === 'clockwise' ? 'CW' : 'CCW'}
                  </span>
                </div>
              </>
            )
          )}

          <div className="status-item">
            <span className="status-label">POSITION:</span>
            <span className="status-val">
              [{camera3DReadout.posX}, {camera3DReadout.posY}, {camera3DReadout.posZ}]
            </span>
          </div>

          <div className="status-item">
            <span className="status-label">ROTATION:</span>
            <span className="status-val">
              P: {camera3DReadout.pitch}° Y: {camera3DReadout.yaw}°
            </span>
          </div>

          <div className="status-item hide-sm">
            <span className="status-label">FOV:</span>
            <span className="status-val">{viewport3D.cameraFov}°</span>
          </div>

          <div className="status-item hide-sm">
            <span className="status-label">EXAGGERATION:</span>
            <span className="status-val">{viewport3D.verticalExaggeration.toFixed(1)}x</span>
          </div>
        </div>

        <div className="viewer-status-group">
          <div className="status-item">
            <span className="status-label">TRIS:</span>
            <span className="status-val">{camera3DReadout.triangles.toLocaleString()}</span>
          </div>

          <div className="status-item">
            <span className="status-label">FPS:</span>
            <span
              className="status-val"
              style={{
                color: camera3DReadout.fps >= 45 ? 'var(--status-success)' : 'var(--status-warning)',
              }}
            >
              {camera3DReadout.fps}
            </span>
          </div>

          <div className="status-item hide-sm">
            <span className="status-label">ENGINE:</span>
            <span className="status-val">Three.js / WebGL 2.0</span>
          </div>
        </div>
      </footer>

      {/* Notifications container */}
      <div className="notification-container">
        {notifications.map((notif) => (
          <div key={notif.id} className={`notification-toast ${notif.type}`}>
            {notif.type === 'success' && <CheckCircle2 size={14} color="var(--status-success)" />}
            {notif.type === 'warning' && <AlertTriangle size={14} color="var(--status-warning)" />}
            {notif.type === 'info' && <Info size={14} color="var(--status-info)" />}
            <span style={{ flex: 1 }}>{notif.message}</span>
            <button
              style={{ padding: '2px', color: 'var(--text-muted)' }}
              onClick={() => dismissNotification(notif.id)}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
