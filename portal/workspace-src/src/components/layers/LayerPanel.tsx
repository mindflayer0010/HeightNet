import React from 'react';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { LayerItem } from './LayerItem';
import { useLayerStore } from '../../state/layerStore';
import { useAppStore } from '../../state/appStore';
import { useProjectStore } from '../../state/projectStore';

export const LayerPanel: React.FC = () => {
  const { layers, showAllLayers, hideAllLayers, addLayer } = useLayerStore();
  const activeView = useAppStore((state) => state.activeView);
  const notify = useAppStore((state) => state.notify);
  const project = useProjectStore((state) => state.project);
  const hasData = Boolean(project.sourceRasterUrl || project.has3DReady || project.outputs.dsm);

  // Filter layers by active view
  const visibleLayers = layers.filter(
    (layer) =>
      layer.viewTarget === 'both' || layer.viewTarget === activeView
  );

  return (
    <div className="layers-section" aria-label="Layers Manager">
      <div className="sidebar-section-header">
        <span>Layers ({visibleLayers.length})</span>
        <div className="sidebar-section-actions">
          <button
            className="sidebar-icon-btn"
            onClick={() => {
              addLayer({
                name: `Layer_${visibleLayers.length + 1}`,
                type: activeView === '2D' ? 'raster' : 'terrain',
                viewTarget: activeView,
                visible: true,
                opacity: 1.0,
                description: 'User created layer',
                typeBadge: activeView === '2D' ? 'Raster' : 'Mesh',
              });
              notify('Created new layer', 'success');
            }}
            title="Add Layer"
            aria-label="Add Layer"
          >
            <Plus size={12} />
          </button>
          <button
            className="sidebar-icon-btn"
            onClick={() => {
              showAllLayers(activeView);
              notify(`All ${activeView} layers visible`, 'info');
            }}
            title="Show All"
            aria-label="Show All Layers"
          >
            <Eye size={12} />
          </button>
          <button
            className="sidebar-icon-btn"
            onClick={() => {
              hideAllLayers(activeView);
              notify(`All ${activeView} layers hidden`, 'info');
            }}
            title="Hide All"
            aria-label="Hide All Layers"
          >
            <EyeOff size={12} />
          </button>
        </div>
      </div>

      <div className="layers-list" role="list">
        {activeView === 'MAP' ? (
          <div className="layers-empty-state">Map mode uses the acquisition controls on the right.</div>
        ) : !hasData ? (
          <div className="layers-empty-state">
            <strong>No data loaded</strong>
            <span>Layers will appear after an upload or terrain run.</span>
          </div>
        ) : visibleLayers.map((layer) => (
          <LayerItem key={layer.id} layer={layer} />
        ))}
      </div>
    </div>
  );
};
