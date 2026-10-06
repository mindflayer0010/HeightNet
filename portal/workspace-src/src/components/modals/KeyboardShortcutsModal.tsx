import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { useAppStore } from '../../state/appStore';

export const KeyboardShortcutsModal: React.FC = () => {
  const { activeModal, closeModal } = useAppStore();

  if (activeModal !== 'shortcuts') return null;

  const shortcuts = [
    { key: 'Ctrl + K', desc: 'Open Command Palette' },
    { key: '1', desc: 'Switch to 2D Raster GIS View' },
    { key: '2', desc: 'Switch to 3D Terrain Perspective View' },
    { key: 'F', desc: 'Fit raster/terrain to viewport' },
    { key: 'R', desc: 'Reset camera orientation and zoom' },
    { key: 'G', desc: 'Toggle coordinate grid reticle' },
    { key: 'M', desc: 'Toggle distance measurement tool (2D)' },
    { key: 'Shift + F', desc: 'Activate 6-DOF Flythrough camera' },
    { key: 'W / S', desc: 'Fly/Walk forward or backward' },
    { key: 'A / D', desc: 'Fly/Walk strafe left or right' },
    { key: 'Space', desc: 'Ascend elevation in Flythrough' },
    { key: 'Ctrl / C', desc: 'Descend elevation in Flythrough' },
    { key: 'Shift', desc: 'Hold for 2.5x speed boost' },
    { key: 'Mouse Drag', desc: 'Rotate view direction (Pitch & Yaw)' },
    { key: 'Del', desc: 'Delete selected layer' },
    { key: 'Ctrl + D', desc: 'Duplicate selected layer' },
  ];

  return (
    <div className="modal-backdrop" onClick={closeModal} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Keyboard size={14} color="var(--accent-light)" />
            <span>Keyboard Shortcuts</span>
          </div>
          <button className="modal-close-btn" onClick={closeModal} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '420px', overflowY: 'auto' }}>
          <div className="meta-table">
            {shortcuts.map((sc, idx) => (
              <div className="meta-row" key={idx} style={{ padding: '6px 0' }}>
                <span className="meta-label" style={{ color: 'var(--text-primary)' }}>
                  {sc.desc}
                </span>
                <span className="cmd-badge" style={{ fontSize: '10px' }}>
                  {sc.key}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
