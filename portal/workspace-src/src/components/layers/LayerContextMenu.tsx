import React, { useEffect, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Copy,
  Sliders,
  Trash2,
} from 'lucide-react';
import type { LayerItemData } from '../../types/layer';
import { useLayerStore } from '../../state/layerStore';
import { useAppStore } from '../../state/appStore';

interface LayerContextMenuProps {
  layer: LayerItemData;
  position: { x: number; y: number };
  onClose: () => void;
}

export const LayerContextMenu: React.FC<LayerContextMenuProps> = ({
  layer,
  position,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { toggleLayerVisibility, duplicateLayer, removeLayer } = useLayerStore();
  const openModal = useAppStore((state) => state.openModal);
  const notify = useAppStore((state) => state.notify);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      className="layer-context-menu"
      ref={menuRef}
      style={{
        top: Math.min(window.innerHeight - 200, position.y),
        left: Math.min(window.innerWidth - 180, position.x),
      }}
      role="menu"
    >
      <button
        className="dw-menu-item"
        role="menuitem"
        onClick={() => {
          toggleLayerVisibility(layer.id);
          onClose();
        }}
      >
        <div className="dw-menu-item-left">
          {layer.visible ? <EyeOff size={12} /> : <Eye size={12} />}
          <span>{layer.visible ? 'Hide Layer' : 'Show Layer'}</span>
        </div>
      </button>

      <button
        className="dw-menu-item"
        role="menuitem"
        onClick={() => {
          duplicateLayer(layer.id);
          notify(`Duplicated "${layer.name}"`, 'info');
          onClose();
        }}
      >
        <div className="dw-menu-item-left">
          <Copy size={12} />
          <span>Duplicate</span>
        </div>
      </button>

      <button
        className="dw-menu-item"
        role="menuitem"
        onClick={() => {
          openModal('layer-props', layer.id);
          onClose();
        }}
      >
        <div className="dw-menu-item-left">
          <Sliders size={12} />
          <span>Properties...</span>
        </div>
      </button>

      <div className="dw-menu-separator" />

      <button
        className="dw-menu-item danger"
        role="menuitem"
        onClick={() => {
          removeLayer(layer.id);
          notify(`Removed "${layer.name}"`, 'warning');
          onClose();
        }}
      >
        <div className="dw-menu-item-left" style={{ color: 'var(--status-danger)' }}>
          <Trash2 size={12} />
          <span>Delete</span>
        </div>
      </button>
    </div>
  );
};
