import React from 'react';
import { X, MountainSnow } from 'lucide-react';
import { useAppStore } from '../../state/appStore';

export const AboutModal: React.FC = () => {
  const { activeModal, closeModal } = useAppStore();

  if (activeModal !== 'about') return null;

  return (
    <div className="modal-backdrop" onClick={closeModal} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <MountainSnow size={15} color="var(--accent-light)" />
            <span>About HeightNet</span>
          </div>
          <button className="modal-close-btn" onClick={closeModal} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
            }}
          >
            <MountainSnow size={28} color="var(--accent-light)" />
          </div>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            HeightNet
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Professional GIS & 3D Terrain Visualization Workspace
          </p>
          <div style={{ marginTop: '8px' }}>
            <span className="dw-badge dw-badge-blue">Version 3.4.2 Production</span>
          </div>

          <div
            className="meta-table"
            style={{ marginTop: '20px', textAlign: 'left', backgroundColor: 'var(--bg-subtle)', padding: '10px', borderRadius: '4px' }}
          >
            <div className="meta-row">
              <span className="meta-label">Renderer</span>
              <span className="meta-value">Three.js / WebGL 2.0 ACES</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">GIS Pipeline</span>
              <span className="meta-value">GDAL / Cloud-Optimized GeoTIFF</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Stereo Model</span>
              <span className="meta-value">Depth Anything V2 + GAMUS fine-tuning</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Engine Build</span>
              <span className="meta-value">Local research prototype</span>
            </div>
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
