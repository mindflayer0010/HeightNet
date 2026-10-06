import React, { useState, useEffect } from 'react';
import { X, Sliders } from 'lucide-react';
import { useAppStore } from '../../state/appStore';
import { useLayerStore } from '../../state/layerStore';

export const LayerPropertiesModal: React.FC = () => {
  const { activeModal, activeLayerForModal, closeModal, notify } = useAppStore();
  const { layers, setLayerOpacity, setLayerBlendMode } = useLayerStore();

  const layer = layers.find((l) => l.id === activeLayerForModal);

  const [name, setName] = useState('');
  const [opacity, setOpacity] = useState(1);
  const [blendMode, setBlendMode] = useState<'normal' | 'multiply' | 'screen' | 'overlay'>('normal');

  useEffect(() => {
    if (layer) {
      setName(layer.name);
      setOpacity(layer.opacity);
      setBlendMode(layer.blendMode || 'normal');
    }
  }, [layer]);

  if (activeModal !== 'layer-props' || !layer) return null;

  const handleSave = () => {
    setLayerOpacity(layer.id, opacity);
    setLayerBlendMode(layer.id, blendMode);
    closeModal();
    notify(`Updated layer properties for "${layer.name}"`, 'success');
  };

  return (
    <div className="modal-backdrop" onClick={closeModal} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <Sliders size={14} color="var(--accent-light)" />
            <span>Layer Properties: {layer.name}</span>
          </div>
          <button className="modal-close-btn" onClick={closeModal} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="inspector-section">
            <div className="control-row">
              <span className="control-label">Layer Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ flex: 1, maxWidth: '220px' }}
              />
            </div>

            <div className="control-row">
              <span className="control-label">Layer Type</span>
              <span className="dw-badge dw-badge-blue">{layer.typeBadge}</span>
            </div>

            <div className="control-row">
              <span className="control-label">Opacity</span>
              <div className="control-input-group">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="control-slider"
                />
                <span className="control-val-display">{Math.round(opacity * 100)}%</span>
              </div>
            </div>

            <div className="control-row">
              <span className="control-label">Blend Mode</span>
              <select
                value={blendMode}
                onChange={(e) => setBlendMode(e.target.value as any)}
                style={{ width: '130px' }}
              >
                <option value="normal">Normal</option>
                <option value="multiply">Multiply</option>
                <option value="screen">Screen</option>
                <option value="overlay">Overlay</option>
              </select>
            </div>

            <div className="meta-row" style={{ marginTop: '8px' }}>
              <span className="meta-label">Description</span>
              <span className="meta-value">{layer.description}</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={closeModal}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};
