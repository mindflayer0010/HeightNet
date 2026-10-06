import React, { useState } from 'react';
import { Eye, EyeOff, MoreVertical } from 'lucide-react';
import type { LayerItemData } from '../../types/layer';
import { LayerThumbnail } from './LayerThumbnail';
import { LayerContextMenu } from './LayerContextMenu';
import { useLayerStore } from '../../state/layerStore';
import { useViewportStore } from '../../state/viewportStore';

interface LayerItemProps {
  layer: LayerItemData;
}

export const LayerItem: React.FC<LayerItemProps> = ({ layer }) => {
  const { selectedLayerId, selectLayer, toggleLayerVisibility, setLayerOpacity } = useLayerStore();
  const { toggleWireframe3D, toggleGrid2D, toggleGrid3D, toggleWater3D } =
    useViewportStore();

  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const isSelected = selectedLayerId === layer.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLayerVisibility(layer.id);

    // Sync layer toggles with viewport renderers
    if (layer.id === 'layer-wireframe') {
      toggleWireframe3D();
    } else if (layer.id === 'layer-grid-2d') {
      toggleGrid2D();
    } else if (layer.id === 'layer-gis-bounding') {
      toggleGrid3D();
    } else if (layer.id === 'layer-water-plane') {
      toggleWater3D();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        className={`layer-row ${isSelected ? 'selected' : ''}`}
        onClick={() => selectLayer(layer.id)}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        aria-selected={isSelected}
        title={`${layer.name} (${layer.typeBadge}) - ${Math.round(layer.opacity * 100)}% Opacity`}
      >
        <button
          className={`layer-vis-btn ${!layer.visible ? 'hidden' : ''}`}
          onClick={handleToggle}
          title={layer.visible ? 'Hide layer' : 'Show layer'}
          aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        >
          {layer.visible ? (
            <Eye size={12} strokeWidth={2} />
          ) : (
            <EyeOff size={12} strokeWidth={1.5} />
          )}
        </button>

        <LayerThumbnail type={layer.type} />

        <span className="layer-name">{layer.name}</span>

        <span className="layer-type-tag">{layer.typeBadge}</span>

        <input
          className="layer-opacity-mini"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={layer.opacity}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setLayerOpacity(layer.id, Number(e.target.value))}
          aria-label={`${layer.name} opacity`}
          title={`${Math.round(layer.opacity * 100)}% opacity`}
        />
        <span className="layer-opacity-value">{Math.round(layer.opacity * 100)}%</span>

        <button
          className="layer-more-btn"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setContextMenuPos({ x: rect.right, y: rect.bottom });
          }}
          title="Layer options"
          aria-label="Layer options"
        >
          <MoreVertical size={12} />
        </button>
      </div>

      {contextMenuPos && (
        <LayerContextMenu
          layer={layer}
          position={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
        />
      )}
    </>
  );
};
