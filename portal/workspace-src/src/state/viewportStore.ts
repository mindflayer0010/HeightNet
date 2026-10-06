import { create } from 'zustand';
import type {
  Viewport2DState,
  Viewport3DState,
  CursorReadout,
  Camera3DReadout,
  CameraMode,
  TerrainMaterialMode,
  ColormapPreset,
} from '../types/viewport';

interface ViewportStore {
  // 2D State
  viewport2D: Viewport2DState;
  setZoom2D: (zoom: number | ((prev: number) => number)) => void;
  setPan2D: (panX: number, panY: number) => void;
  setRotation2D: (rotation: number) => void;
  zoomAtPoint2D: (zoom: number, panX: number, panY: number) => void;
  reset2DView: () => void;
  fit2DToView: () => void;
  setBrightness2D: (val: number) => void;
  setContrast2D: (val: number) => void;
  setOpacity2D: (val: number) => void;
  setColormap2D: (cmap: ColormapPreset) => void;
  toggleInvertColormap2D: () => void;
  toggleGrid2D: () => void;
  toggleCrosshair2D: () => void;
  toggleMeasureMode2D: () => void;
  addMeasurePoint2D: (pt: { x: number; y: number }) => void;
  clearMeasurePoints2D: () => void;

  // 3D State
  viewport3D: Viewport3DState;
  setCameraMode3D: (mode: CameraMode) => void;
  setCameraFov3D: (fov: number) => void;
  setCameraSpeed3D: (speed: number) => void;
  setVerticalExaggeration3D: (scale: number) => void;
  setMaterialMode3D: (mode: TerrainMaterialMode) => void;
  toggleWireframe3D: () => void;
  setWireframeColor3D: (color: string) => void;
  toggleGrid3D: () => void;
  toggleWater3D: () => void;
  setWaterElevation3D: (elev: number) => void;
  setSunAzimuth3D: (azimuth: number) => void;
  setSunAltitude3D: (altitude: number) => void;
  setMeshResolution3D: (res: 'low' | 'medium' | 'high' | 'ultra') => void;
  resetCamera3D: () => void;
  resetTrigger3D: number; // Increment to trigger Three.js camera reset

  // Auto Orbit Actions
  setAutoOrbitSpeed3D: (speed: number) => void;
  setAutoOrbitDirection3D: (direction: 'clockwise' | 'counter-clockwise') => void;
  setAutoOrbitElevation3D: (elevation: number) => void;
  setAutoOrbitTargetType3D: (targetType: 'center' | 'layer' | 'custom', customPos?: [number, number, number]) => void;
  setAutoOrbitPaused3D: (paused: boolean) => void;
  toggleAutoOrbitPaused3D: () => void;

  // Status & Telemetry
  cursorReadout: CursorReadout;
  setCursorReadout: (readout: Partial<CursorReadout>) => void;
  camera3DReadout: Camera3DReadout;
  setCamera3DReadout: (readout: Partial<Camera3DReadout>) => void;
}

const initial2D: Viewport2DState = {
  zoom: 1.0,
  panX: 0,
  panY: 0,
  rotation: 0,
  brightness: 1.0,
  contrast: 1.0,
  opacity: 1.0,
  colormap: 'natural',
  invertColormap: false,
  gridVisible: false,
  crosshairVisible: true,
  measureMode: false,
  measurePoints: [],
};

const initialAutoOrbit = {
  speed: 1.0,
  direction: 'clockwise' as const,
  elevation: 95,
  targetType: 'center' as const,
  targetPos: [0, 15, 0] as [number, number, number],
  paused: false,
};

const initial3D: Viewport3DState = {
  cameraMode: 'orbit',
  autoOrbit: initialAutoOrbit,
  cameraFov: 45,
  cameraSpeed: 1.0,
  verticalExaggeration: 1.0,
  materialMode: 'satellite',
  wireframeVisible: false,
  wireframeColor: '#38bdf8',
  gridVisible: false,
  waterVisible: false,
  waterElevation: 0.11,
  sunAzimuth: 315,
  sunAltitude: 45,
  sunIntensity: 1.25,
  meshResolution: 'high',
};

export const useViewportStore = create<ViewportStore>((set) => ({
  viewport2D: initial2D,
  viewport3D: initial3D,
  resetTrigger3D: 0,

  setZoom2D: (val) =>
    set((state) => ({
      viewport2D: {
        ...state.viewport2D,
        zoom: Math.max(0.1, Math.min(10.0, typeof val === 'function' ? val(state.viewport2D.zoom) : val)),
      },
    })),

  setPan2D: (panX, panY) =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, panX, panY },
    })),

  setRotation2D: (rotation) =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, rotation },
    })),

  zoomAtPoint2D: (zoom, panX, panY) =>
    set((state) => ({
      viewport2D: {
        ...state.viewport2D,
        zoom: Math.max(0.1, Math.min(12.0, zoom)),
        panX,
        panY,
      },
    })),

  reset2DView: () =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, zoom: 1.0, panX: 0, panY: 0 },
    })),

  fit2DToView: () =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, zoom: 0.85, panX: 0, panY: 0 },
    })),

  setBrightness2D: (brightness) =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, brightness },
    })),

  setContrast2D: (contrast) =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, contrast },
    })),

  setOpacity2D: (opacity) =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, opacity },
    })),

  setColormap2D: (colormap) =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, colormap },
    })),

  toggleInvertColormap2D: () =>
    set((state) => ({
      viewport2D: {
        ...state.viewport2D,
        invertColormap: !state.viewport2D.invertColormap,
      },
    })),

  toggleGrid2D: () =>
    set((state) => ({
      viewport2D: {
        ...state.viewport2D,
        gridVisible: !state.viewport2D.gridVisible,
      },
    })),

  toggleCrosshair2D: () =>
    set((state) => ({
      viewport2D: {
        ...state.viewport2D,
        crosshairVisible: !state.viewport2D.crosshairVisible,
      },
    })),

  toggleMeasureMode2D: () =>
    set((state) => ({
      viewport2D: {
        ...state.viewport2D,
        measureMode: !state.viewport2D.measureMode,
      },
    })),

  addMeasurePoint2D: (pt) =>
    set((state) => ({
      viewport2D: {
        ...state.viewport2D,
        measurePoints: [...state.viewport2D.measurePoints, pt],
      },
    })),

  clearMeasurePoints2D: () =>
    set((state) => ({
      viewport2D: { ...state.viewport2D, measurePoints: [] },
    })),

  // 3D Actions
  setCameraMode3D: (cameraMode) =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        cameraMode,
        autoOrbit:
          cameraMode === 'auto-orbit'
            ? { ...state.viewport3D.autoOrbit, paused: false }
            : state.viewport3D.autoOrbit,
      },
    })),

  setAutoOrbitSpeed3D: (speed) =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        autoOrbit: {
          ...state.viewport3D.autoOrbit,
          speed: Math.max(0.1, Math.min(3.0, speed)),
        },
      },
    })),

  setAutoOrbitDirection3D: (direction) =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        autoOrbit: {
          ...state.viewport3D.autoOrbit,
          direction,
        },
      },
    })),

  setAutoOrbitElevation3D: (elevation) =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        autoOrbit: {
          ...state.viewport3D.autoOrbit,
          elevation: Math.max(25, Math.min(220, elevation)),
        },
      },
    })),

  setAutoOrbitTargetType3D: (targetType, customPos) =>
    set((state) => {
      let targetPos: [number, number, number] = [0, 15, 0];
      if (targetType === 'layer') {
        targetPos = [15, 30, -10];
      } else if (targetType === 'custom' && customPos) {
        targetPos = customPos;
      }
      return {
        viewport3D: {
          ...state.viewport3D,
          autoOrbit: {
            ...state.viewport3D.autoOrbit,
            targetType,
            targetPos,
          },
        },
      };
    }),

  setAutoOrbitPaused3D: (paused) =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        autoOrbit: {
          ...state.viewport3D.autoOrbit,
          paused,
        },
      },
    })),

  toggleAutoOrbitPaused3D: () =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        autoOrbit: {
          ...state.viewport3D.autoOrbit,
          paused: !state.viewport3D.autoOrbit.paused,
        },
      },
    })),

  setCameraFov3D: (cameraFov) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, cameraFov },
    })),

  setCameraSpeed3D: (cameraSpeed) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, cameraSpeed },
    })),

  setVerticalExaggeration3D: (verticalExaggeration) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, verticalExaggeration },
    })),

  setMaterialMode3D: (materialMode) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, materialMode },
    })),

  toggleWireframe3D: () =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        wireframeVisible: !state.viewport3D.wireframeVisible,
      },
    })),

  setWireframeColor3D: (wireframeColor) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, wireframeColor },
    })),

  toggleGrid3D: () =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        gridVisible: !state.viewport3D.gridVisible,
      },
    })),

  toggleWater3D: () =>
    set((state) => ({
      viewport3D: {
        ...state.viewport3D,
        waterVisible: !state.viewport3D.waterVisible,
      },
    })),

  setWaterElevation3D: (waterElevation) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, waterElevation },
    })),

  setSunAzimuth3D: (sunAzimuth) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, sunAzimuth },
    })),

  setSunAltitude3D: (sunAltitude) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, sunAltitude },
    })),

  setMeshResolution3D: (meshResolution) =>
    set((state) => ({
      viewport3D: { ...state.viewport3D, meshResolution },
    })),

  resetCamera3D: () =>
    set((state) => ({
      resetTrigger3D: state.resetTrigger3D + 1,
    })),

  // Telemetry
  cursorReadout: {
    pixelX: 0,
    pixelY: 0,
    lat: 0,
    lon: 0,
    elevation: 0,
    slopeDegrees: undefined,
    readoutSource: 'metadata',
  },
  setCursorReadout: (readout) =>
    set((state) => ({
      cursorReadout: { ...state.cursorReadout, ...readout },
    })),

  camera3DReadout: {
    posX: 120,
    posY: 180,
    posZ: 240,
    pitch: -24,
    yaw: 45,
    fps: 60,
    triangles: 131072,
  },
  setCamera3DReadout: (readout) =>
    set((state) => ({
      camera3DReadout: { ...state.camera3DReadout, ...readout },
    })),
}));
