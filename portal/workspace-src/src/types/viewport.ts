export type ActiveView = 'MAP' | '2D' | '3D';

export type CameraMode = 'orbit' | 'auto-orbit' | 'flythrough' | 'walkthrough';

export type TerrainMaterialMode =
  | 'satellite'
  | 'hypsometric'
  | 'shaded-relief'
  | 'slope'
  | 'surface';

export type ColormapPreset =
  | 'natural'
  | 'viridis'
  | 'turbo'
  | 'terrain'
  | 'magma'
  | 'grayscale';

export interface AutoOrbitConfig {
  speed: number; // 0.1 to 3.0, default 1.0
  direction: 'clockwise' | 'counter-clockwise';
  elevation: number; // 25 to 220, default 95
  targetType: 'center' | 'layer' | 'custom';
  targetPos: [number, number, number];
  paused: boolean;
}

export interface Viewport2DState {
  zoom: number; // 0.1 to 10.0 (1.0 = 100%)
  panX: number;
  panY: number;
  rotation: number;
  brightness: number; // 0.5 to 2.0, default 1.0
  contrast: number; // 0.5 to 2.0, default 1.0
  opacity: number; // 0 to 1, default 1.0
  colormap: ColormapPreset;
  invertColormap: boolean;
  gridVisible: boolean;
  crosshairVisible: boolean;
  measureMode: boolean;
  measurePoints: Array<{ x: number; y: number }>;
}

export interface Viewport3DState {
  cameraMode: CameraMode;
  autoOrbit: AutoOrbitConfig;
  cameraFov: number; // 35 to 90
  cameraSpeed: number; // 0.5 to 4.0
  verticalExaggeration: number; // 0.5 to 4.0, default 1.6
  materialMode: TerrainMaterialMode;
  wireframeVisible: boolean;
  wireframeColor: string;
  gridVisible: boolean;
  waterVisible: boolean;
  waterElevation: number; // 0 to 1
  sunAzimuth: number; // 0 to 360 deg
  sunAltitude: number; // 10 to 90 deg
  sunIntensity: number;
  meshResolution: 'low' | 'medium' | 'high' | 'ultra'; // 64, 128, 256, 384
}

export interface CursorReadout {
  pixelX: number;
  pixelY: number;
  lat: number;
  lon: number;
  elevation: number;
  slopeDegrees?: number;
  mapX?: number;
  mapY?: number;
  readoutSource?: 'metadata' | 'live-raster';
}

export interface Camera3DReadout {
  posX: number;
  posY: number;
  posZ: number;
  pitch: number;
  yaw: number;
  fps: number;
  triangles: number;
}
