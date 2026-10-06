import React from 'react';
import { Box, Image, Map as MapIcon } from 'lucide-react';
import { useAppStore } from '../../state/appStore';
import type { ActiveView } from '../../types/viewport';
import { useWorkspaceStore } from '../../state/workspaceStore';

export const ViewSelector: React.FC = () => {
  const { activeView, setActiveView } = useAppStore();
  const { activePaneId, setPaneView } = useWorkspaceStore();

  const handleSelectView = (view: ActiveView) => {
    setActiveView(view);
    setPaneView(activePaneId, view);
  };

  return (
    <div className="views-section" aria-label="Workspace Views">
      <div className="sidebar-section-header">
        <span>Views</span>
      </div>

      <div className="views-container">
        <button
          id="view-btn-map"
          className={`view-btn ${activeView === 'MAP' ? 'active' : ''}`}
          onClick={() => handleSelectView('MAP')}
          title="Search the world and acquire Sentinel-2 imagery"
          aria-pressed={activeView === 'MAP'}
        >
          <MapIcon size={15} />
          <span>Map</span>
        </button>

        <button
          id="view-btn-2d"
          className={`view-btn ${activeView === '2D' ? 'active' : ''}`}
          onClick={() => handleSelectView('2D')}
          title="2D Raster GIS Viewport (Hot-key: 1)"
          aria-pressed={activeView === '2D'}
        >
          <Image size={15} />
          <span>2D Raster</span>
        </button>

        <button
          id="view-btn-3d"
          className={`view-btn ${activeView === '3D' ? 'active' : ''}`}
          onClick={() => handleSelectView('3D')}
          title="3D Terrain Perspective Viewport (Hot-key: 2)"
          aria-pressed={activeView === '3D'}
        >
          <Box size={15} />
          <span>3D Terrain</span>
        </button>
      </div>
    </div>
  );
};
