import React, { useState } from 'react';
import { X, Download, FileBox, FileSpreadsheet, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '../../state/appStore';
import { useProjectStore } from '../../state/projectStore';

export const ExportModal: React.FC = () => {
  const { activeModal, closeModal, notify } = useAppStore();
  const project = useProjectStore((state) => state.project);
  const [exportFormat, setExportFormat] = useState<'obj' | 'geotiff' | 'png'>('obj');

  if (activeModal !== 'export') return null;

  const handleExport = () => {
    const target = exportFormat === 'obj'
      ? project.outputs.mesh
      : exportFormat === 'geotiff'
        ? project.outputs.dsm
        : project.outputs.texture;
    if (!target) {
      notify('Run the live pipeline before exporting an artifact', 'warning');
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
    closeModal();
    notify(`Opened the generated ${exportFormat.toUpperCase()} artifact`, 'success');
  };

  return (
    <div className="modal-backdrop" onClick={closeModal} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <Download size={14} color="var(--accent-light)" />
            <span>Export generated data</span>
          </div>
          <button className="modal-close-btn" onClick={closeModal} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="inspector-section">
            <div className="inspector-section-title">
              <span>Choose an artifact</span>
            </div>
            <div className="action-grid">
              <button className={`compact-action-btn ${exportFormat === 'obj' ? 'active' : ''}`} onClick={() => setExportFormat('obj')}>
                <FileBox size={12} />
                <span>Wavefront OBJ</span>
              </button>
              <button className={`compact-action-btn ${exportFormat === 'geotiff' ? 'active' : ''}`} onClick={() => setExportFormat('geotiff')}>
                <FileSpreadsheet size={12} />
                <span>DSM GeoTIFF</span>
              </button>
              <button className={`compact-action-btn ${exportFormat === 'png' ? 'active' : ''}`} onClick={() => setExportFormat('png')}>
                <ImageIcon size={12} />
                <span>Texture PNG</span>
              </button>
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.4 }}>
            These links open files produced by the Python pipeline. Run the
            live pipeline first if no artifact is available yet.
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={closeModal}>Cancel</button>
          <button className="btn-primary" onClick={handleExport}>Open artifact</button>
        </div>
      </div>
    </div>
  );
};
