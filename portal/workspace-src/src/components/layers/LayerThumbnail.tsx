import React from 'react';
import type { LayerType } from '../../types/layer';
import {
  FileImage,
  Layers,
  Box,
  Palette,
  Grid,
  Droplets,
  Network,
} from 'lucide-react';

interface LayerThumbnailProps {
  type: LayerType;
}

export const LayerThumbnail: React.FC<LayerThumbnailProps> = ({ type }) => {
  switch (type) {
    case 'raster':
      return (
        <div
          className="layer-thumbnail"
          style={{
            background: 'linear-gradient(135deg, #2e4a2d 0%, #687958 40%, #a2a092 75%, #ffffff 100%)',
          }}
          title="Satellite Orthophoto"
        >
          <FileImage size={12} color="#ffffff" style={{ opacity: 0.9 }} />
        </div>
      );
    case 'depth':
      return (
        <div
          className="layer-thumbnail"
          style={{
            background: 'linear-gradient(135deg, #111111 0%, #555555 50%, #f0f0f0 100%)',
          }}
          title="Depth Elevation Map"
        >
          <Layers size={12} color="#38bdf8" style={{ opacity: 0.9 }} />
        </div>
      );
    case 'terrain':
      return (
        <div
          className="layer-thumbnail"
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            border: '1px solid #38bdf8',
          }}
          title="3D Tessellated Surface"
        >
          <Box size={12} color="#38bdf8" />
        </div>
      );
    case 'texture':
      return (
        <div
          className="layer-thumbnail"
          style={{
            background: 'linear-gradient(135deg, #4d7c0f 0%, #15803d 50%, #0369a1 100%)',
          }}
          title="Texture Map"
        >
          <Palette size={12} color="#ffffff" />
        </div>
      );
    case 'wireframe':
      return (
        <div
          className="layer-thumbnail"
          style={{
            backgroundColor: '#0f172a',
            border: '1px dashed #38bdf8',
          }}
          title="CAD Wireframe"
        >
          <Network size={12} color="#38bdf8" />
        </div>
      );
    case 'water':
      return (
        <div
          className="layer-thumbnail"
          style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
          }}
          title="Water Plane Hydrology"
        >
          <Droplets size={12} color="#ffffff" />
        </div>
      );
    case 'contours':
      return (
        <div
          className="layer-thumbnail"
          style={{
            backgroundColor: '#1e293b',
          }}
          title="Iso-Elevation Contours"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" style={{ opacity: 0.8 }}>
            <circle cx="10" cy="10" r="4" fill="none" stroke="#f59e0b" strokeWidth="1" />
            <circle cx="10" cy="10" r="7" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2,2" />
          </svg>
        </div>
      );
    case 'grid':
    default:
      return (
        <div className="layer-thumbnail" style={{ backgroundColor: '#1e222a' }}>
          <Grid size={12} color="#94a3b8" />
        </div>
      );
  }
};
