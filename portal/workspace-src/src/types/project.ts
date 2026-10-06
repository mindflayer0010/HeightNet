export interface ProjectMetadata {
  id: string;
  name: string;
  created: string;
  updated: string;
  crs: string;
  bounds: {
    west: number;
    east: number;
    south: number;
    north: number;
  };
  dimensions: {
    width: number;
    height: number;
    bands: number;
    dataType: string;
    resolutionMeters: number;
  };
  elevationStats: {
    min: number;
    max: number;
    mean: number;
    unit: string;
  };
  depthModel: {
    name: string;
    version: string;
    confidenceScore: number;
    inferenceTimeMs: number;
    checkpoint: string;
  };
}

export interface ProjectData {
  metadata: ProjectMetadata;
  sourceRasterUrl: string;
  depthMapUrl: string;
  has3DReady: boolean;
  liveViewerUrl: string | null;
  rawOutputPaths: {
    input: string | null;
    relative: string | null;
    agl: string | null;
    dsm: string | null;
    confidence: string | null;
    uncertainty: string | null;
    sceneRisk: string | null;
  };
  outputs: {
    input: string | null;
    relative: string | null;
    agl: string | null;
    dsm: string | null;
    confidence: string | null;
    uncertainty: string | null;
    metadata: string | null;
    mesh: string | null;
    material: string | null;
    texture: string | null;
    meshMetadata: string | null;
    sceneRisk: string | null;
  };
}
