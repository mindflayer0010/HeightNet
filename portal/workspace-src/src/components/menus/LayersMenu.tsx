import React, { useState, useRef, useEffect } from 'react';
import {
  PlusCircle,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Sliders,
} from 'lucide-react';
import { useLayerStore } from '../../state/layerStore';
import { useAppStore } from '../../state/appStore';

export const LayersMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    selectedLayerId,
    removeLayer,
    duplicateLayer,
    showAllLayers,
    hideAllLayers,
    addLayer,
  } = useLayerStore();
  const activeView = useAppStore((state) => state.activeView);
  const openModal = useAppStore((state) => state.openModal);
  const notify = useAppStore((state) => state.notify);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="dw-menu-container" ref={menuRef}>
      <button
        className={`menu-trigger-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        Layers
      </button>

      {open && (
        <div className="dw-dropdown-menu" role="menu">
          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              addLayer({
                name: 'Custom Annotation Overlay',
                type: 'grid',
                viewTarget: activeView,
                visible: true,
                opacity: 0.8,
                description: 'User-defined spatial vector layer',
                typeBadge: 'Vector',
              });
              notify('Added new layer', 'success');
            }}
          >
            <div className="dw-menu-item-left">
              <PlusCircle size={13} />
              <span>Add Layer</span>
            </div>
            <span className="dw-menu-shortcut">Ctrl+Shift+A</span>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (selectedLayerId) {
                removeLayer(selectedLayerId);
                notify('Layer removed', 'info');
              }
            }}
          >
            <div className="dw-menu-item-left">
              <Trash2 size={13} />
              <span>Remove Layer</span>
            </div>
            <span className="dw-menu-shortcut">Del</span>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (selectedLayerId) {
                duplicateLayer(selectedLayerId);
                notify('Layer duplicated', 'info');
              }
            }}
          >
            <div className="dw-menu-item-left">
              <Copy size={13} />
              <span>Duplicate Layer</span>
            </div>
            <span className="dw-menu-shortcut">Ctrl+D</span>
          </button>

          <div className="dw-menu-separator" />

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              showAllLayers(activeView);
              notify('All view layers set to visible', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <Eye size={13} />
              <span>Show All</span>
            </div>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              hideAllLayers(activeView);
              notify('All view layers hidden', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <EyeOff size={13} />
              <span>Hide All</span>
            </div>
          </button>

          <div className="dw-menu-separator" />

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openModal('layer-props', selectedLayerId);
            }}
          >
            <div className="dw-menu-item-left">
              <Sliders size={13} />
              <span>Layer Properties...</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
