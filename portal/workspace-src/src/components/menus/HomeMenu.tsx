import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  FilePlus,
  FolderOpen,
  History,
  Info,
  Upload,
} from 'lucide-react';
import { useAppStore } from '../../state/appStore';

export const HomeMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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
        Home
      </button>

      {open && (
        <div className="dw-dropdown-menu" role="menu">
          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              notify('Created new workspace session', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <FilePlus size={13} />
              <span>New Project</span>
            </div>
            <span className="dw-menu-shortcut">Ctrl+N</span>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              notify('Open Project dialog', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <FolderOpen size={13} />
              <span>Open Project...</span>
            </div>
            <span className="dw-menu-shortcut">Ctrl+O</span>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              notify('No saved project loader is connected yet', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <History size={13} />
              <span>Recent Projects</span>
            </div>
          </button>

          <div className="dw-menu-separator" />

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              notify('Raster import wizard opened', 'info');
            }}
          >
            <div className="dw-menu-item-left">
              <Upload size={13} />
              <span>Import GeoTIFF / DEM...</span>
            </div>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openModal('export');
            }}
          >
            <div className="dw-menu-item-left">
              <Download size={13} />
              <span>Export...</span>
            </div>
            <span className="dw-menu-shortcut">Ctrl+E</span>
          </button>

          <div className="dw-menu-separator" />

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openModal('project-info');
            }}
          >
            <div className="dw-menu-item-left">
              <Info size={13} />
              <span>Project Information</span>
            </div>
            <span className="dw-menu-shortcut">Ctrl+I</span>
          </button>
        </div>
      )}
    </div>
  );
};
