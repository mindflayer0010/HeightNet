import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, Keyboard, Info } from 'lucide-react';
import { useAppStore } from '../../state/appStore';

export const HelpMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const openModal = useAppStore((state) => state.openModal);

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
        Help
      </button>

      {open && (
        <div className="dw-dropdown-menu" role="menu">
          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.open('https://github.com', '_blank');
            }}
          >
            <div className="dw-menu-item-left">
              <BookOpen size={13} />
              <span>Documentation</span>
            </div>
            <span className="dw-menu-shortcut">F1</span>
          </button>

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openModal('shortcuts');
            }}
          >
            <div className="dw-menu-item-left">
              <Keyboard size={13} />
              <span>Keyboard Shortcuts</span>
            </div>
            <span className="dw-menu-shortcut">?</span>
          </button>

          <div className="dw-menu-separator" />

          <button
            className="dw-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openModal('about');
            }}
          >
            <div className="dw-menu-item-left">
              <Info size={13} />
              <span>About HeightNet</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
