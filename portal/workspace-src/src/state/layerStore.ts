import { create } from 'zustand';
import type { LayerItemData, ViewTarget } from '../types/layer';

const initialLayers: LayerItemData[] = [
  // 2D Layers
  {
    id: 'layer-raster-original',
    name: 'Original Orthophoto Raster',
    type: 'raster',
    viewTarget: '2D',
    visible: true,
    opacity: 1.0,
    blendMode: 'normal',
    description: 'RGB image supplied by the user or Sentinel-2 acquisition',
    typeBadge: 'GeoTIFF',
  },
  {
    id: 'layer-depth-map',
    name: 'Estimated DSM',
    type: 'depth',
    viewTarget: '2D',
    visible: false,
    opacity: 0.85,
    blendMode: 'normal',
    description: 'Relative depth or calibrated height output from the model',
    typeBadge: 'DEM 32F',
  },
  {
    id: 'layer-agl-map',
    name: 'Predicted AGL',
    type: 'depth',
    viewTarget: '2D',
    visible: false,
    opacity: 0.75,
    blendMode: 'normal',
    description: 'Above-ground height predicted after calibration',
    typeBadge: 'AGL',
  },
  {
    id: 'layer-confidence-map',
    name: 'Calibration Confidence',
    type: 'depth',
    viewTarget: '2D',
    visible: false,
    opacity: 0.7,
    blendMode: 'normal',
    description: 'Where the calibrated height estimate is more or less reliable',
    typeBadge: 'CONF',
  },
  {
    id: 'layer-uncertainty-map',
    name: 'Calibration Uncertainty',
    type: 'depth',
    viewTarget: '2D',
    visible: false,
    opacity: 0.7,
    blendMode: 'normal',
    description: 'Estimated calibration error magnitude',
    typeBadge: 'UNC',
  },
  {
    id: 'layer-scene-risk-map',
    name: 'Scene Risk Flags',
    type: 'depth',
    viewTarget: '2D',
    visible: false,
    opacity: 0.65,
    blendMode: 'normal',
    description: 'Regions where water, shadows, clouds, glare, or weak texture may confuse height estimation',
    typeBadge: 'RISK',
  },
  {
    id: 'layer-contours',
    name: 'Topographic Contours (50m)',
    type: 'contours',
    viewTarget: '2D',
    visible: false,
    opacity: 0.7,
    blendMode: 'overlay',
    description: 'Iso-elevation contour lines generated at 50m intervals',
    typeBadge: 'Vector',
  },
  {
    id: 'layer-grid-2d',
    name: 'UTM Coordinate Grid',
    type: 'grid',
    viewTarget: '2D',
    visible: true,
    opacity: 0.6,
    blendMode: 'normal',
    description: 'WGS 84 / UTM Zone 32N 1km technical reticle',
    typeBadge: 'Grid',
  },

  // 3D Layers
  {
    id: 'layer-terrain-mesh',
    name: 'Generated 3D Terrain Mesh',
    type: 'terrain',
    viewTarget: '3D',
    visible: true,
    opacity: 1.0,
    blendMode: 'normal',
    description: 'Tessellated elevation surface mesh with normal shading',
    typeBadge: 'Mesh',
  },
  {
    id: 'layer-surface-texture',
    name: 'Satellite Ortho Texture',
    type: 'texture',
    viewTarget: '3D',
    visible: true,
    opacity: 1.0,
    blendMode: 'normal',
    description: 'Georeferenced RGB photogrammetry texture mapped to surface',
    typeBadge: 'Texture',
  },
  {
    id: 'layer-wireframe',
    name: 'Structural Wireframe Overlay',
    type: 'wireframe',
    viewTarget: '3D',
    visible: false,
    opacity: 0.45,
    blendMode: 'normal',
    description: 'Triangle topology and vertex edge wireframe overlay',
    typeBadge: 'Wireframe',
  },
];

interface LayerStore {
  layers: LayerItemData[];
  selectedLayerId: string;
  selectLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlendMode: (id: string, mode: 'normal' | 'multiply' | 'screen' | 'overlay') => void;
  duplicateLayer: (id: string) => void;
  removeLayer: (id: string) => void;
  addLayer: (layer: Omit<LayerItemData, 'id'>) => void;
  showAllLayers: (viewTarget?: ViewTarget) => void;
  hideAllLayers: (viewTarget?: ViewTarget) => void;
  reorderLayers: (startIndex: number, endIndex: number) => void;
}

export const useLayerStore = create<LayerStore>((set) => ({
  layers: initialLayers,
  selectedLayerId: 'layer-raster-original',

  selectLayer: (id) => set({ selectedLayerId: id }),

  toggleLayerVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    })),

  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l
      ),
    })),

  setLayerBlendMode: (id, mode) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, blendMode: mode } : l
      ),
    })),

  duplicateLayer: (id) =>
    set((state) => {
      const target = state.layers.find((l) => l.id === id);
      if (!target) return state;
      const newLayer: LayerItemData = {
        ...target,
        id: `${target.id}-copy-${Date.now().toString().slice(-4)}`,
        name: `${target.name} (Copy)`,
      };
      const index = state.layers.findIndex((l) => l.id === id);
      const newLayers = [...state.layers];
      newLayers.splice(index + 1, 0, newLayer);
      return { layers: newLayers, selectedLayerId: newLayer.id };
    }),

  removeLayer: (id) =>
    set((state) => ({
      layers: state.layers.filter((l) => l.id !== id),
      selectedLayerId:
        state.selectedLayerId === id
          ? state.layers.find((l) => l.id !== id)?.id || ''
          : state.selectedLayerId,
    })),

  addLayer: (layerData) =>
    set((state) => {
      const newLayer: LayerItemData = {
        ...layerData,
        id: `layer-custom-${Date.now()}`,
      };
      return {
        layers: [newLayer, ...state.layers],
        selectedLayerId: newLayer.id,
      };
    }),

  showAllLayers: (viewTarget) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        !viewTarget || l.viewTarget === viewTarget || l.viewTarget === 'both'
          ? { ...l, visible: true }
          : l
      ),
    })),

  hideAllLayers: (viewTarget) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        !viewTarget || l.viewTarget === viewTarget || l.viewTarget === 'both'
          ? { ...l, visible: false }
          : l
      ),
    })),

  reorderLayers: (startIndex, endIndex) =>
    set((state) => {
      const result = Array.from(state.layers);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return { layers: result };
    }),
}));
