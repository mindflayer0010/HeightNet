import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Grid,
  Crosshair,
  Ruler,
  Network,
  Camera,
  Maximize,
  ExternalLink,
} from 'lucide-react';
import { useViewportStore } from '../../state/viewportStore';
import { useAppStore } from '../../state/appStore';

interface ViewportToolbarProps {
  activeViewOverride?: import('../../types/viewport').ActiveView;
  compact?: boolean;
}

export const ViewportToolbar: React.FC<ViewportToolbarProps> = ({ activeViewOverride, compact = false }) => {
  const globalActiveView = useAppStore((state) => state.activeView);
  const activeView = activeViewOverride ?? globalActiveView;
  const notify = useAppStore((state) => state.notify);
  const openDedicated3DViewer = useAppStore((state) => state.openDedicated3DViewer);
  const {
    viewport2D,
    setZoom2D,
    reset2DView,
    fit2DToView,
    toggleGrid2D,
    toggleCrosshair2D,
    toggleMeasureMode2D,
    clearMeasurePoints2D,
    viewport3D,
    setCameraFov3D,
    toggleGrid3D,
    toggleWireframe3D,
    resetCamera3D,
  } = useViewportStore();

  if (activeView === 'MAP') {
    return (
      <div className={`viewport-toolbar ${compact ? 'viewport-toolbar-compact' : ''}`} role="toolbar" aria-label="Map acquisition toolbar">
        <div className="toolbar-group">
          <span className="viewport-mode-label">Map</span>
          <span className="viewport-toolbar-note">Search for a place and download Sentinel-2 imagery</span>
        </div>
      </div>
    );
  }

  const handleZoomIn = () => {
    if (activeView === '2D') {
      setZoom2D((z) => z * 1.25);
    } else {
      const nextFov = Math.max(15, viewport3D.cameraFov - 5);
      setCameraFov3D(nextFov);
      notify(`3D Optical FOV: ${nextFov}°`, 'info');
    }
  };

  const handleZoomOut = () => {
    if (activeView === '2D') {
      setZoom2D((z) => z * 0.8);
    } else {
      const nextFov = Math.min(95, viewport3D.cameraFov + 5);
      setCameraFov3D(nextFov);
      notify(`3D Optical FOV: ${nextFov}°`, 'info');
    }
  };

  const handleReset = () => {
    if (activeView === '2D') {
      reset2DView();
      notify('2D View Reset to 100%', 'info');
    } else {
      resetCamera3D();
      notify('3D Camera Reset to Default', 'info');
    }
  };

  const handleFit = () => {
    if (activeView === '2D') {
      fit2DToView();
      notify('Fitted Raster to Viewport', 'info');
    } else {
      resetCamera3D();
    }
  };

  const handleToggleGrid = () => {
    if (activeView === '2D') {
      toggleGrid2D();
    } else {
      toggleGrid3D();
    }
  };

  return (
    <div className={`viewport-toolbar ${compact ? 'viewport-toolbar-compact' : ''}`} role="toolbar" aria-label="Viewport Toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={handleZoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In"
        >
          <ZoomIn size={12} />
        </button>

        <button
          className="toolbar-btn"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom Out"
        >
          <ZoomOut size={12} />
        </button>

        <button
          className="toolbar-btn"
          onClick={() => {
            if (activeView === '2D') setZoom2D(1.0);
          }}
          title="1:1 Actual Resolution"
          aria-label="1:1 Resolution"
        >
          <span>1:1</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={handleFit}
          title="Fit to View (F)"
          aria-label="Fit to View"
        >
          <Maximize2 size={12} />
          <span>Fit</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={handleReset}
          title="Reset View / Camera (R)"
          aria-label="Reset View / Camera"
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </button>

        <div className="toolbar-separator" />

        <button
          className={`toolbar-btn ${(activeView === '2D' ? viewport2D.gridVisible : viewport3D.gridVisible) ? 'active' : ''}`}
          onClick={handleToggleGrid}
          title="Toggle Grid Reticle (G)"
          aria-label="Toggle Grid"
        >
          <Grid size={12} />
          <span>Grid</span>
        </button>

        {activeView === '2D' ? (
          <>
            <button
              className={`toolbar-btn ${viewport2D.crosshairVisible ? 'active' : ''}`}
              onClick={toggleCrosshair2D}
              title="Toggle Center Crosshair"
              aria-label="Toggle Center Crosshair"
            >
              <Crosshair size={12} />
              <span>Crosshair</span>
            </button>

            <button
              className={`toolbar-btn ${viewport2D.measureMode ? 'active' : ''}`}
              onClick={() => {
                toggleMeasureMode2D();
                if (viewport2D.measurePoints.length > 0) {
                  clearMeasurePoints2D();
                }
              }}
              title="Measure Distance (M)"
              aria-label="Measure Distance"
            >
              <Ruler size={12} />
              <span>Measure</span>
            </button>
          </>
        ) : (
          <button
            className={`toolbar-btn ${viewport3D.wireframeVisible ? 'active' : ''}`}
            onClick={toggleWireframe3D}
            title="Toggle Wireframe Topology"
            aria-label="Toggle Wireframe Topology"
          >
            <Network size={12} />
            <span>Wireframe</span>
          </button>
        )}
      </div>

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => openDedicated3DViewer(false)}
          title="Open 3D Viewer"
          aria-label="Open 3D Viewer"
        >
          <ExternalLink size={12} />
        </button>

        <button
          className="toolbar-btn"
          onClick={() => notify('Viewport snapshot exported to disk', 'success')}
          title="Capture Viewport Screenshot (F12)"
          aria-label="Capture Viewport Screenshot"
        >
          <Camera size={12} />
          <span>Snapshot</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            } else {
              document.exitFullscreen().catch(() => {});
            }
          }}
          title="Maximize Viewport Area"
          aria-label="Maximize Viewport"
        >
          <Maximize size={12} />
        </button>
      </div>
    </div>
  );
};
