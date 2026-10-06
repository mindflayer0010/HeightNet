import { create } from 'zustand';
import type { ProjectData, ProjectMetadata } from '../types/project';
import { artifactUrl, rasterPreviewUrl, type InputInfo, type PipelineResult } from '../integration/api';

export interface TemporalRun {
  id: string;
  sceneId: string;
  captureDate: string | null;
  cloudCover: number | null;
  result: PipelineResult;
}

const defaultMetadata: ProjectMetadata = {
  id: 'heightnet-live-session',
  name: 'No project loaded',
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  crs: 'CRS not available',
  bounds: {
    west: 0,
    east: 0,
    south: 0,
    north: 0,
  },
  dimensions: {
    width: 0,
    height: 0,
    bands: 3,
    dataType: 'Waiting for input',
    resolutionMeters: 10,
  },
  elevationStats: {
    min: 0,
    max: 0,
    mean: 0,
    unit: 'meters (AMSL)',
  },
  depthModel: {
    name: 'Depth Anything V2 fine-tuned on GAMUS',
    version: 'HeightNet local pipeline',
    confidenceScore: 0,
    inferenceTimeMs: 0,
    checkpoint: 'Configured by the Python pipeline',
  },
};

interface ProjectStore {
  project: ProjectData;
  temporalRuns: TemporalRun[];
  hydrateProject: () => void;
  setProjectName: (name: string) => void;
  updateMetadata: (meta: Partial<ProjectMetadata>) => void;
  setInputInfo: (name: string, info: InputInfo) => void;
  setLiveResult: (result: PipelineResult, viewerUrl: string | null) => void;
  setTemporalRuns: (runs: TemporalRun[]) => void;
}

const PROJECT_STORAGE_KEY = 'heightnet:last-project';

export const useProjectStore = create<ProjectStore>((set) => ({
  temporalRuns: [],
  project: {
    metadata: defaultMetadata,
    sourceRasterUrl: '',
    depthMapUrl: '',
    has3DReady: false,
    liveViewerUrl: null,
    rawOutputPaths: {
      input: null,
      relative: null,
      agl: null,
      dsm: null,
      confidence: null,
      uncertainty: null,
      sceneRisk: null,
    },
    outputs: {
      input: null,
      relative: null,
      agl: null,
      dsm: null,
      confidence: null,
      uncertainty: null,
      metadata: null,
      mesh: null,
      material: null,
      texture: null,
      meshMetadata: null,
      sceneRisk: null,
    },
  },
  hydrateProject: () => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.sessionStorage.getItem(PROJECT_STORAGE_KEY);
      if (!saved) return;
      const project = JSON.parse(saved) as ProjectData;
      if (project?.metadata && project?.outputs && project?.rawOutputPaths) {
        set({ project });
      }
    } catch {
      window.sessionStorage.removeItem(PROJECT_STORAGE_KEY);
    }
  },
  setProjectName: (name: string) =>
    set((state) => ({
      project: {
        ...state.project,
        metadata: { ...state.project.metadata, name },
      },
    })),
  updateMetadata: (meta) =>
    set((state) => ({
      project: {
        ...state.project,
        metadata: { ...state.project.metadata, ...meta },
      },
    })),
  setInputInfo: (name, info) =>
    set((state) => ({
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          name,
          crs: info.crs ?? 'CRS not available',
          updated: new Date().toISOString(),
          dimensions: {
            ...state.project.metadata.dimensions,
            width: info.width,
            height: info.height,
            dataType: info.kind === 'georeferenced' ? 'GeoTIFF input' : 'PNG/JPG input',
          },
        },
      },
    })),
  setLiveResult: (result, liveViewerUrl) => {
    const stats = result.stats?.dsm ?? result.stats?.relative;
    set((state) => {
      const project: ProjectData = {
        ...state.project,
        sourceRasterUrl: artifactUrl(result.texture) ?? '',
        depthMapUrl: rasterPreviewUrl(result.dsm ?? result.relative, 'elevation') ?? '',
        has3DReady: Boolean(result.mesh),
        liveViewerUrl,
        rawOutputPaths: {
          input: result.input ?? null,
          relative: result.relative ?? null,
          agl: result.agl ?? null,
          dsm: result.dsm ?? null,
          confidence: result.confidence ?? null,
          uncertainty: result.uncertainty ?? null,
          sceneRisk: result.scene_risk ?? null,
        },
        outputs: {
          input: artifactUrl(result.input),
          relative: artifactUrl(result.relative),
          agl: artifactUrl(result.agl),
          dsm: artifactUrl(result.dsm),
          confidence: artifactUrl(result.confidence),
          uncertainty: artifactUrl(result.uncertainty),
          metadata: artifactUrl(result.metadata),
          mesh: artifactUrl(result.mesh),
          material: artifactUrl(result.material),
          texture: artifactUrl(result.texture),
          meshMetadata: artifactUrl(result.mesh_metadata),
          sceneRisk: artifactUrl(result.scene_risk),
        },
        metadata: {
          ...state.project.metadata,
          name: stats ? 'Generated HeightNet terrain' : state.project.metadata.name,
          crs: stats?.crs ?? state.project.metadata.crs,
          updated: new Date().toISOString(),
          dimensions: stats
            ? {
                ...state.project.metadata.dimensions,
                width: stats.shape[1],
                height: stats.shape[0],
                dataType: 'Generated DSM',
              }
            : state.project.metadata.dimensions,
          elevationStats: result.stats?.dsm
            ? {
                ...state.project.metadata.elevationStats,
                min: result.stats.dsm.min,
                max: result.stats.dsm.max,
                mean: result.stats.dsm.mean,
              }
            : state.project.metadata.elevationStats,
        },
      };
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
        } catch {
          // The browser may refuse a large session entry. The live project still works.
        }
      }
      return { project };
    });
  },
  setTemporalRuns: (temporalRuns) => set({ temporalRuns }),
}));
