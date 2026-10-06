import React from 'react';
import { Plus, Minus, RotateCcw, Navigation, Footprints } from 'lucide-react';
import { useViewportStore } from '../../state/viewportStore';
import { useAppStore } from '../../state/appStore';

interface ViewportOverlayProps {
  activeViewOverride?: import('../../types/viewport').ActiveView;
}

export const ViewportOverlay: React.FC<ViewportOverlayProps> = ({ activeViewOverride }) => {
  const globalActiveView = useAppStore((state) => state.activeView);
  const activeView = activeViewOverride ?? globalActiveView;
  const {
    viewport3D,
    resetCamera3D,
    setCameraFov3D,
  } = useViewportStore();

  if (activeView !== '3D') {
    return null;
  }

  const handleZoomIn = () => {
    setCameraFov3D(Math.max(25, viewport3D.cameraFov - 5));
  };

  const handleZoomOut = () => {
    setCameraFov3D(Math.min(85, viewport3D.cameraFov + 5));
  };

  return (
    <>
      {/* Compact 3D View Controls: +, -, Reset Camera */}
      <div className="viewport-3d-controls" aria-label="3D View Controls">
        <button
          className="viewport-3d-btn"
          onClick={handleZoomIn}
          title="Zoom In (FOV -5°)"
          aria-label="Zoom In"
        >
          <Plus size={14} />
        </button>

        <button
          className="viewport-3d-btn"
          onClick={handleZoomOut}
          title="Zoom Out (FOV +5°)"
          aria-label="Zoom Out"
        >
          <Minus size={14} />
        </button>

        <button
          className="viewport-3d-btn"
          onClick={resetCamera3D}
          title="Reset Camera (R)"
          aria-label="Reset Camera"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* Flythrough HUD */}
      {viewport3D.cameraMode === 'flythrough' && (
        <div className="camera-mode-hud">
          <div className="hud-title">
            <Navigation size={13} />
            <span>6-DOF Flythrough Active</span>
          </div>
          <div className="hud-keys-row">
            <span>Translate:</span>
            <span className="hud-key">W</span>
            <span className="hud-key">A</span>
            <span className="hud-key">S</span>
            <span className="hud-key">D</span>
          </div>
          <div className="hud-keys-row">
            <span>Elevation:</span>
            <span className="hud-key">Space (Up)</span>
            <span className="hud-key">Ctrl / C (Down)</span>
          </div>
          <div className="hud-keys-row">
            <span>Look:</span>
            <span>Click & Drag Mouse</span>
            <span className="hud-key">Shift (Turbo)</span>
          </div>
          <div className="hud-keys-row">
            <span>Scroll Wheel:</span>
            <span>Dolly In/Out</span>
            <span className="hud-key">Ctrl+Scroll (FOV)</span>
          </div>
        </div>
      )}

      {/* Walkthrough HUD */}
      {viewport3D.cameraMode === 'walkthrough' && (
        <div className="camera-mode-hud">
          <div className="hud-title">
            <Footprints size={13} />
            <span>Walkthrough (Ground Clamped)</span>
          </div>
          <div className="hud-keys-row">
            <span>Movement:</span>
            <span className="hud-key">W</span>
            <span className="hud-key">A</span>
            <span className="hud-key">S</span>
            <span className="hud-key">D</span>
          </div>
          <div className="hud-keys-row">
            <span>Scroll Wheel:</span>
            <span>Step Forward / Backward</span>
          </div>
          <div className="hud-keys-row">
            <span>Terrain Collision:</span>
            <span style={{ color: 'var(--status-success)' }}>Active (+3.2m Eye Level)</span>
          </div>
        </div>
      )}
    </>
  );
};
