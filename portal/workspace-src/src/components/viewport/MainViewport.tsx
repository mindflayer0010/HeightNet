import React from 'react';
import { ViewportToolbar } from './ViewportToolbar';
import { ViewportStatusBar } from './ViewportStatusBar';
import { ViewportOverlay } from './ViewportOverlay';
import { RasterRenderer } from '../../renderer/raster/RasterRenderer';
import { TerrainScene } from '../../renderer/three/TerrainScene';
import { MapAcquisitionView } from '../map/MapAcquisitionView';
import { useAppStore } from '../../state/appStore';
import { useProjectStore } from '../../state/projectStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { MapPinned, Upload } from 'lucide-react';

interface MainViewportProps {
  viewOverride?: import('../../types/viewport').ActiveView;
  paneId?: string;
  compact?: boolean;
}

export const MainViewport: React.FC<MainViewportProps> = ({ viewOverride, paneId, compact = false }) => {
  const globalActiveView = useAppStore((state) => state.activeView);
  const activeView = viewOverride ?? globalActiveView;
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setPaneView = useWorkspaceStore((state) => state.setPaneView);
  const has3DReady = useProjectStore((state) => state.project.has3DReady);
  const temporalRuns = useProjectStore((state) => state.temporalRuns);
  const temporalRunId = useWorkspaceStore((state) => state.panes.find((pane) => pane.id === paneId)?.temporalRunId ?? null);
  const temporalRun = temporalRuns.find((run) => run.id === temporalRunId) ?? null;
  const sourceRasterUrl = useProjectStore((state) => state.project.sourceRasterUrl);
  const switchPaneView = (view: import('../../types/viewport').ActiveView) => {
    if (paneId) setPaneView(paneId, view);
    setActiveView(view);
  };

  return (
    <main className="main-viewport-container" role="region" aria-label="Main Viewport">
      <ViewportToolbar activeViewOverride={activeView} compact={compact} />

      <div className="viewport-stage">
        {activeView === 'MAP' ? (
          <div style={{ width: '100%', height: '100%' }}>
            <MapAcquisitionView />
          </div>
        ) : null}

        {/* Render 2D Raster View */}
        {activeView === '2D' ? (
          <div style={{ width: '100%', height: '100%' }}>
            <RasterRenderer paneId={paneId} />
            {!sourceRasterUrl ? (
              <div className="viewport-empty-state raster-empty-state">
                <div className="viewport-empty-icon"><Upload size={18} /></div>
                <strong>No raster loaded</strong>
                <span>Upload a PNG, JPG, or GeoTIFF, or fetch one from Map Acquisition.</span>
                <div className="viewport-empty-actions">
                  <button onClick={() => window.dispatchEvent(new CustomEvent('heightnet:open-upload'))}><Upload size={13} /> Upload image</button>
                  <button onClick={() => switchPaneView('MAP')}><MapPinned size={13} /> Open map</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Render 3D Three.js Terrain View (Pre-warmed, no second generation) */}
        {activeView === '3D' ? (
          <div style={{ width: '100%', height: '100%' }}>
            <TerrainScene paneId={paneId} resultOverride={temporalRun?.result ?? null} />
            {!has3DReady && !temporalRun ? (
              <div className="viewport-empty-state">
                <div className="viewport-empty-icon"><MapPinned size={18} /></div>
                <strong>No terrain loaded</strong>
                <span>Generate a terrain from the map or upload an image first.</span>
                <div className="viewport-empty-actions">
                  <button onClick={() => switchPaneView('MAP')}><MapPinned size={13} /> Open map</button>
                  <button onClick={() => { switchPaneView('2D'); window.setTimeout(() => window.dispatchEvent(new CustomEvent('heightnet:open-upload')), 0); }}><Upload size={13} /> Upload image</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <ViewportOverlay activeViewOverride={activeView} />
      </div>

      <ViewportStatusBar activeViewOverride={activeView} />
    </main>
  );
};
