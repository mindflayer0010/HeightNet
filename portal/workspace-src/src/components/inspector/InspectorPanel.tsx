import React from 'react';
import { Sliders } from 'lucide-react';
import { TwoDInspector } from './TwoDInspector';
import { ThreeDInspector } from './ThreeDInspector';
import { useAppStore } from '../../state/appStore';
import { MapInspector } from '../map/MapInspector';
import { LivePipelinePanel } from '../pipeline/LivePipelinePanel';
import { ValidationPanel } from './ValidationPanel';

export const InspectorPanel: React.FC = () => {
  const { activeView, rightPanelWidth } = useAppStore();

  return (
    <aside
      className="inspector-panel"
      style={{ width: `${rightPanelWidth}px`, minWidth: '240px', maxWidth: '480px' }}
      aria-label="Inspector Panel"
    >
      <div className="inspector-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sliders size={13} style={{ color: 'var(--accent-light)' }} />
          <span>{activeView === 'MAP' ? 'Build terrain' : activeView === '2D' ? 'Raster details' : 'Terrain controls'}</span>
        </div>
        <span className="inspector-header-badge">{activeView === 'MAP' ? 'Map' : activeView === '2D' ? '2D raster' : '3D terrain'}</span>
      </div>

      {/* Keep the upload controller mounted in every view so the compact
          Upload button works from Map, 2D, and 3D without painting a card
          over the workspace. */}
      <LivePipelinePanel />
      <ValidationPanel />
      {activeView === 'MAP' ? <MapInspector /> : activeView === '2D' ? <TwoDInspector /> : <ThreeDInspector />}
    </aside>
  );
};
