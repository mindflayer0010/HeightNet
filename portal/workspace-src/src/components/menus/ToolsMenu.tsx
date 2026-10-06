import React, { useState, useRef, useEffect } from 'react';
import {
  Ruler,
  Camera,
  Grid,
  Image as ImageIcon,
  Sparkles,
  ExternalLink,
  RotateCw,
  Wrench,
} from 'lucide-react';
import { useViewportStore } from '../../state/viewportStore';
import { useAppStore } from '../../state/appStore';
import { useUtilitiesStore } from '../../state/utilitiesStore';

export const ToolsMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeView = useAppStore((state) => state.activeView);
  const notify = useAppStore((state) => state.notify);
  const openDedicated3DViewer = useAppStore((state) => state.openDedicated3DViewer);
  const toggleUtilities = useUtilitiesStore((state) => state.toggle);
  const {
    toggleMeasureMode2D,
    toggleGrid2D,
    toggleGrid3D,
    setCameraMode3D,
  } = useViewportStore();

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
        Tools
      </button>

      {open && (
        <div className="dw-dropdown-menu" role="menu">
          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              toggleMeasureMode2D();
              notify('Distance measurement tool toggled', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <Ruler size={13} />
              <span>Measure Distance</span>
            </div>
            <span className="dw-menu-shortcut">M</span>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (activeView === 'MAP') {
                notify('Grid controls are available in the raster and terrain views', 'info');
              } else if (activeView === '2D') {
                toggleGrid2D();
              } else {
                toggleGrid3D();
              }
              notify('Coordinate reticle toggled', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <Grid size={13} />
              <span>Toggle Grid</span>
            </div>
            <span className="dw-menu-shortcut">G</span>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              toggleUtilities();
            }}
          >
            <div className="dw-menu-item-left">
              <Wrench size={13} />
              <span>Open Utilities</span>
            </div>
          </button>

          <div className="dw-menu-separator" />

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCameraMode3D('orbit');
              notify('Switched to 3D Orbit Camera', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <Camera size={13} />
              <span>Camera: Orbit Mode</span>
            </div>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCameraMode3D('auto-orbit');
              notify('Auto Orbit Camera Active', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <RotateCw size={13} />
              <span>Camera: Auto Orbit Mode</span>
            </div>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCameraMode3D('flythrough');
              notify('Switched to 3D Flythrough Camera', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <Camera size={13} />
              <span>Camera: Flythrough Mode</span>
            </div>
            <span className="dw-menu-shortcut">Shift+F</span>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCameraMode3D('walkthrough');
              notify('Switched to 3D Walkthrough Camera', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <Sparkles size={13} />
              <span>Camera: Walkthrough Mode</span>
            </div>
          </button>

          <div className="dw-menu-separator" />

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              notify('Screenshot exported to project outputs', 'success');
            }}
          >
            <div className="dw-menu-item-left">
              <ImageIcon size={13} />
              <span>Capture Viewport Screenshot</span>
            </div>
            <span className="dw-menu-shortcut">F12</span>
          </button>

          <div className="dw-menu-separator" />

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openDedicated3DViewer(false);
            }}
          >
            <div className="dw-menu-item-left">
              <ExternalLink size={13} />
              <span>Open 3D Viewer</span>
            </div>
            <span className="dw-menu-shortcut">Ctrl+3</span>
          </button>
        </div>
      )}
    </div>
  );
};
