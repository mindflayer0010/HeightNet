import React from 'react';
import { useViewportStore } from '../../state/viewportStore';
import { useProjectStore } from '../../state/projectStore';
import { useAppStore } from '../../state/appStore';

interface ViewportStatusBarProps {
  activeViewOverride?: import('../../types/viewport').ActiveView;
}

export const ViewportStatusBar: React.FC<ViewportStatusBarProps> = ({ activeViewOverride }) => {
  const globalActiveView = useAppStore((state) => state.activeView);
  const activeView = activeViewOverride ?? globalActiveView;
  const project = useProjectStore((state) => state.project);
  const { viewport2D, cursorReadout, viewport3D, camera3DReadout } =
    useViewportStore();

  return (
    <footer className="viewport-status-bar" role="status" aria-label="Workspace status">
      {activeView === 'MAP' ? (
        <>
          <div className="status-panes-group">
            <div className="status-pane"><span className="status-label">View</span><span className="status-value accent">Map</span></div>
            <div className="status-pane"><span className="status-label">Data</span><span className="status-value">Sentinel-2 RGB</span></div>
          </div>
          <div className="status-panes-group">
            <div className="status-pane"><span className="status-label">Next</span><span className="status-value">Draw a rectangle on the map</span></div>
          </div>
        </>
      ) : activeView === '2D' ? (
        <>
          <div className="status-panes-group">
            <div className="status-pane hide-md">
              <span className="status-label">DIM:</span>
              <span className="status-value">
                {project.metadata.dimensions.width}×{project.metadata.dimensions.height}
              </span>
            </div>

            <div className="status-pane">
              <span className="status-label">ZOOM:</span>
              <span className="status-value accent">
                {Math.round(viewport2D.zoom * 100)}%
              </span>
            </div>

            <div className="status-pane">
              <span className="status-label">PX:</span>
              <span className="status-value">
                {cursorReadout.pixelX}, {cursorReadout.pixelY}
              </span>
            </div>

            <div className="status-pane">
              <span className="status-label">{cursorReadout.mapX != null ? 'MAP:' : 'WGS84:'}</span>
              <span className="status-value">
                {cursorReadout.mapX != null && cursorReadout.mapY != null
                  ? `${cursorReadout.mapX.toFixed(1)}, ${cursorReadout.mapY.toFixed(1)}`
                  : `${cursorReadout.lat.toFixed(4)}° N, ${cursorReadout.lon.toFixed(4)}° E`}
              </span>
            </div>

            <div className="status-pane">
              <span className="status-label">ELEV:</span>
              <span className="status-value accent">
                {cursorReadout.readoutSource === 'live-raster' ? `${cursorReadout.elevation.toLocaleString(undefined, { maximumFractionDigits: 2 })} m AMSL` : '— click the DSM to inspect height'}
                {cursorReadout.slopeDegrees != null ? ` · ${cursorReadout.slopeDegrees.toFixed(1)}° slope` : ''}
              </span>
            </div>
          </div>

          <div className="status-panes-group">
            <div className="status-pane hide-md">
              <span className="status-label">GSD:</span>
              <span className="status-value">
                {project.metadata.dimensions.resolutionMeters} m/px
              </span>
            </div>

            <div className="status-pane hide-sm">
              <span className="status-label">CRS:</span>
              <span className="status-value">{project.metadata.crs}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="status-panes-group">
            <div className="status-pane">
              <span className="status-label">CAMERA:</span>
              <span className="status-value accent" style={{ textTransform: 'uppercase' }}>
                {viewport3D.cameraMode === 'auto-orbit' ? 'AUTO ORBIT' : viewport3D.cameraMode}
              </span>
            </div>

            {viewport3D.cameraMode === 'auto-orbit' && (
              viewport3D.autoOrbit.paused ? (
                <div className="status-pane">
                  <span className="status-label">STATUS:</span>
                  <span className="status-value" style={{ color: 'var(--status-warning)' }}>PAUSED</span>
                </div>
              ) : (
                <>
                  <div className="status-pane">
                    <span className="status-label">SPEED:</span>
                    <span className="status-value">{viewport3D.autoOrbit.speed.toFixed(1)}x</span>
                  </div>
                  <div className="status-pane">
                    <span className="status-label">DIR:</span>
                    <span className="status-value">
                      {viewport3D.autoOrbit.direction === 'clockwise' ? 'CW' : 'CCW'}
                    </span>
                  </div>
                </>
              )
            )}

            <div className="status-pane">
              <span className="status-label">POS:</span>
              <span className="status-value">
                [{camera3DReadout.posX}, {camera3DReadout.posY}, {camera3DReadout.posZ}]
              </span>
            </div>

            <div className="status-pane">
              <span className="status-label">ROT:</span>
              <span className="status-value">
                P: {camera3DReadout.pitch}° Y: {camera3DReadout.yaw}°
              </span>
            </div>

            <div className="status-pane">
              <span className="status-label">SCALE:</span>
              <span className="status-value">
                {viewport3D.verticalExaggeration.toFixed(1)}x
              </span>
            </div>
          </div>

          <div className="status-panes-group">
            <div className="status-pane">
              <span className="status-label">TRIS:</span>
              <span className="status-value">
                {camera3DReadout.triangles.toLocaleString()}
              </span>
            </div>

            <div className="status-pane">
              <span className="status-label">FPS:</span>
              <span
                className="status-value"
                style={{
                  color: camera3DReadout.fps >= 45 ? 'var(--status-success)' : 'var(--status-warning)',
                }}
              >
                {camera3DReadout.fps}
              </span>
            </div>

            <div className="status-pane hide-sm">
              <span className="status-label">ENGINE:</span>
              <span className="status-value">WebGL 2.0</span>
            </div>
          </div>
        </>
      )}
    </footer>
  );
};
