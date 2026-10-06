import React from 'react';
import { X, Info, Layers, Cpu, Globe } from 'lucide-react';
import { useAppStore } from '../../state/appStore';
import { useProjectStore } from '../../state/projectStore';

export const ProjectInfoModal: React.FC = () => {
  const { activeModal, closeModal } = useAppStore();
  const project = useProjectStore((state) => state.project);

  if (activeModal !== 'project-info') return null;

  return (
    <div className="modal-backdrop" onClick={closeModal} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Info size={14} color="var(--accent-light)" />
            <span>Project Information & Spatial Metadata</span>
          </div>
          <button className="modal-close-btn" onClick={closeModal} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          {/* Spatial / Dataset Overview */}
          <div className="inspector-section">
            <div className="inspector-section-title">
              <span>Spatial Dataset Overview</span>
              <Globe size={12} />
            </div>
            <div className="meta-table">
              <div className="meta-row">
                <span className="meta-label">Project Name</span>
                <span className="meta-value">{project.metadata.name}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Project ID</span>
                <span className="meta-value">{project.metadata.id}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">CRS / Projection</span>
                <span className="meta-value">{project.metadata.crs}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Ground Sample Distance</span>
                <span className="meta-value">
                  {project.metadata.dimensions.resolutionMeters} m / pixel
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Raster Dimensions</span>
                <span className="meta-value">
                  {project.metadata.dimensions.width} × {project.metadata.dimensions.height} px
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Spectral Channels</span>
                <span className="meta-value">4 Bands (Red, Green, Blue, NIR)</span>
              </div>
            </div>
          </div>

          {/* Elevation Statistics */}
          <div className="inspector-section">
            <div className="inspector-section-title">
              <span>Topographic Statistics</span>
              <Layers size={12} />
            </div>
            <div className="meta-table">
              <div className="meta-row">
                <span className="meta-label">Minimum Elevation</span>
                <span className="meta-value">
                  {project.metadata.elevationStats.min.toLocaleString()} m AMSL
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Maximum output elevation</span>
                <span className="meta-value">
                  {project.metadata.elevationStats.max.toLocaleString()} m AMSL
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Mean Massif Elevation</span>
                <span className="meta-value">
                  {project.metadata.elevationStats.mean.toLocaleString()} m AMSL
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Spatial Bounding Extents</span>
                <span className="meta-value">
                  [{project.metadata.bounds.west.toFixed(4)}°, {project.metadata.bounds.south.toFixed(4)}°] to [
                  {project.metadata.bounds.east.toFixed(4)}°, {project.metadata.bounds.north.toFixed(4)}°]
                </span>
              </div>
            </div>
          </div>

          {/* Machine Learning Depth Pipeline */}
          <div className="inspector-section">
            <div className="inspector-section-title">
              <span>Depth Estimation Pipeline</span>
              <Cpu size={12} />
            </div>
            <div className="meta-table">
              <div className="meta-row">
                <span className="meta-label">Depth Model</span>
                <span className="meta-value">{project.metadata.depthModel.name}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Pipeline Version</span>
                <span className="meta-value">{project.metadata.depthModel.version}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Inference Latency</span>
                <span className="meta-value">
                  {project.metadata.depthModel.inferenceTimeMs} ms
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Confidence Metric</span>
                <span className="meta-value">
                  {(project.metadata.depthModel.confidenceScore * 100).toFixed(1)}% (High Fidelity)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={closeModal}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
