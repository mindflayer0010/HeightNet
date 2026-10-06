import { create } from 'zustand';
import {
  acquireSentinelImagery,
  geocodePlace,
  getReferenceAvailability,
  searchSentinelScenes,
  startPipeline,
  waitForJob,
  type AcquiredImagery,
  type GeocodePlace,
  type PipelineResult,
  type SourceAvailability,
  type SentinelScene,
} from '../integration/api';
import { useAppStore } from './appStore';
import { useProjectStore, type TemporalRun } from './projectStore';
import { useWorkspaceStore } from './workspaceStore';

type MapStatus = 'idle' | 'searching' | 'downloading' | 'ready' | 'running' | 'complete' | 'error';

interface MapStore {
  searchQuery: string;
  searchResults: GeocodePlace[];
  searchMessage: string;
  selectedBbox: [number, number, number, number] | null;
  selectionMessage: string;
  selectionMode: boolean;
  cloudCover: number;
  dateFrom: string;
  dateTo: string;
  scenes: SentinelScene[];
  selectedScene: SentinelScene | null;
  selectedScenes: SentinelScene[];
  imagery: AcquiredImagery | null;
  referenceAvailability: SourceAvailability | null;
  referenceAvailabilityStatus: 'idle' | 'checking' | 'ready' | 'error';
  status: MapStatus;
  statusMessage: string;
  result: PipelineResult | null;
  focusRequest: { lat: number; lon: number; label: string; id: number } | null;
  setSearchQuery: (query: string) => void;
  search: () => Promise<void>;
  focusPlace: (place: GeocodePlace) => void;
  setSelectionMode: (enabled: boolean) => void;
  setSelectionMessage: (message: string) => void;
  setSelectedBbox: (bbox: [number, number, number, number]) => void;
  clearSelection: () => void;
  setCloudCover: (value: number) => void;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  searchScenes: () => Promise<void>;
  selectScene: (scene: SentinelScene) => void;
  toggleSceneSelection: (scene: SentinelScene) => void;
  download: () => Promise<void>;
  buildTerrain: () => Promise<void>;
  buildTemporal: () => Promise<void>;
  checkReferenceAvailability: () => Promise<void>;
  runPipeline: () => Promise<void>;
  reset: () => void;
}

const initialState = {
  searchQuery: '',
  searchResults: [] as GeocodePlace[],
  searchMessage: '',
  selectedBbox: null as [number, number, number, number] | null,
  selectionMessage: 'No area selected. Select a rectangular area of interest on the map.',
  selectionMode: false,
  cloudCover: 30,
  dateFrom: '',
  dateTo: '',
  scenes: [] as SentinelScene[],
  selectedScene: null as SentinelScene | null,
  selectedScenes: [] as SentinelScene[],
  imagery: null as AcquiredImagery | null,
  referenceAvailability: null as SourceAvailability | null,
  referenceAvailabilityStatus: 'idle' as 'idle' | 'checking' | 'ready' | 'error',
  status: 'idle' as MapStatus,
  statusMessage: 'Search a place, select an area of interest, and HeightNet will do the rest.',
  result: null as PipelineResult | null,
  focusRequest: null as { lat: number; lon: number; label: string; id: number } | null,
};

export const useMapStore = create<MapStore>((set, get) => {
  const processPipeline = async (
    imagery: AcquiredImagery,
    onMessage: (message: string) => void,
  ): Promise<PipelineResult> => {
    const started = await startPipeline(imagery.file, imagery.visual_file ?? imagery.file);
    const finished = await waitForJob(started.id, (job) => onMessage(job.message || 'HeightNet is working...'));
    if (finished.status === 'failed') throw new Error(finished.message);
    return finished.result;
  };

  const clearTemporalComparison = () => {
    useProjectStore.getState().setTemporalRuns([]);
    const workspace = useWorkspaceStore.getState();
    workspace.panes.forEach((pane) => workspace.setPaneTemporalRun(pane.id, null));
  };

  const runPipelineForImagery = async (imagery: AcquiredImagery) => {
    clearTemporalComparison();
    set({ status: 'running', statusMessage: 'Running HeightNet on the downloaded image...' });
    try {
      // Keep the raw RGB bands for model inference, but use Sentinel's
      // rendered visual asset for the terrain texture. The two files serve
      // different jobs: raw data is better for the model, visual data is
      // already colour-balanced for people looking at the 3D scene.
      const result = await processPipeline(imagery, (message) => set({ statusMessage: message }));

      useProjectStore.getState().setLiveResult(result, null);
      if (result?.mesh) {
        set({ status: 'complete', result, statusMessage: 'Terrain is ready. The 3D view is open.' });
        useAppStore.getState().setActiveView('3D');
        useAppStore.getState().notify('Terrain generation complete', 'success');
      } else {
        set({
          status: 'complete',
          result,
          statusMessage: result?.mesh_warning
            ? `Elevation was generated, but the 3D mesh could not be exported: ${result.mesh_warning}`
            : 'Elevation was generated, but no 3D mesh was returned. Check the server log and run again.',
        });
        useAppStore.getState().notify('Elevation finished, but 3D mesh export needs attention', 'warning');
      }
    } catch (error) {
      set({ status: 'error', statusMessage: error instanceof Error ? error.message : 'HeightNet pipeline failed.' });
      useAppStore.getState().notify('HeightNet pipeline failed', 'warning');
    }
  };

  return {
    ...initialState,

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  search: async () => {
    const query = get().searchQuery.trim();
    if (!query) {
      set({ searchMessage: 'Type a place name first.', searchResults: [] });
      return;
    }
    set({ status: 'searching', searchMessage: 'Searching the world...', searchResults: [] });
    try {
      const data = await geocodePlace(query);
      set({
        status: 'idle',
        searchResults: data.results,
        searchMessage: data.results.length ? '' : 'No places found. Try a city, region, or landmark.',
      });
    } catch (error) {
      set({ status: 'error', searchMessage: error instanceof Error ? error.message : 'Place search failed.' });
    }
  },

  focusPlace: (place) => {
    set((state) => ({
      focusRequest: {
        lat: Number(place.lat),
        lon: Number(place.lon),
        label: place.display_name.split(',').slice(0, 2).join(','),
        id: (state.focusRequest?.id ?? 0) + 1,
      },
      searchResults: [],
      searchMessage: `Showing ${place.display_name}`,
    }));
  },

  setSelectionMode: (selectionMode) =>
    set({ selectionMode, selectionMessage: selectionMode ? 'Drag to select a rectangular area of interest.' : get().selectionMessage }),

  setSelectionMessage: (selectionMessage) => set({ selectionMessage }),

  setSelectedBbox: (selectedBbox) =>
    (() => {
      clearTemporalComparison();
      set({
        selectedBbox,
        selectionMode: false,
        selectionMessage: `Area of interest selected: [${selectedBbox.map((value) => value.toFixed(5)).join(', ')}]`,
        scenes: [],
        selectedScene: null,
        selectedScenes: [],
        imagery: null,
        referenceAvailability: null,
        referenceAvailabilityStatus: 'checking',
        result: null,
        status: 'searching',
        statusMessage: 'Looking for available Sentinel-2 captures for this area...',
      });
      void get().searchScenes();
      void get().checkReferenceAvailability();
    })(),

  clearSelection: () =>
    (() => {
      clearTemporalComparison();
      set({
      selectedBbox: null,
      selectionMode: false,
      selectionMessage: 'No area selected. Select a rectangular area of interest on the map.',
      imagery: null,
      scenes: [],
      selectedScene: null,
      selectedScenes: [],
      result: null,
      referenceAvailability: null,
      referenceAvailabilityStatus: 'idle',
      status: 'idle',
      statusMessage: 'Search a place, select an area of interest, and HeightNet will do the rest.',
      });
    })(),

  setCloudCover: (cloudCover) => set({ cloudCover: Math.max(0, Math.min(100, cloudCover)) }),

  setDateFrom: (dateFrom) => set({ dateFrom }),

  setDateTo: (dateTo) => set({ dateTo }),

  searchScenes: async () => {
    const { selectedBbox, cloudCover, dateFrom, dateTo } = get();
    if (!selectedBbox) {
      set({ statusMessage: 'Select an area of interest first.' });
      return;
    }
    set({ status: 'searching', statusMessage: 'Checking Sentinel-2 captures for the selected dates...' });
    try {
      const data = await searchSentinelScenes(selectedBbox, cloudCover, dateFrom, dateTo);
      const currentId = get().selectedScene?.scene_id;
      const selectedScene = data.scenes.find((scene) => scene.scene_id === currentId) ?? data.scenes[0] ?? null;
      const selectedIds = new Set(get().selectedScenes.map((scene) => scene.scene_id));
      set({
        scenes: data.scenes,
        selectedScene,
        selectedScenes: data.scenes.filter((scene) => selectedIds.has(scene.scene_id)),
        status: 'idle',
        statusMessage: data.scenes.length
          ? `${data.scenes.length} capture${data.scenes.length === 1 ? '' : 's'} found. Choose one to build, or select several for comparison.`
          : 'No captures matched that date and cloud limit. Widen the date range or cloud limit.',
      });
    } catch (error) {
      set({ status: 'error', statusMessage: error instanceof Error ? error.message : 'Sentinel-2 scene search failed.' });
    }
  },

  selectScene: (selectedScene) => set({
    selectedScene,
    imagery: null,
    result: null,
    status: 'idle',
    statusMessage: `${selectedScene.scene_id} selected. Download it or build this capture.`,
  }),

  toggleSceneSelection: (scene) =>
    set((state) => {
      const exists = state.selectedScenes.some((item) => item.scene_id === scene.scene_id);
      if (exists) return { selectedScenes: state.selectedScenes.filter((item) => item.scene_id !== scene.scene_id) };
      if (state.selectedScenes.length >= 4) {
        setTimeout(() => useAppStore.getState().notify('Compare up to four captures at once', 'info'), 0);
        return state;
      }
      return { selectedScenes: [...state.selectedScenes, scene] };
    }),

  checkReferenceAvailability: async () => {
    const bbox = get().selectedBbox;
    if (!bbox) {
      set({ referenceAvailability: null, referenceAvailabilityStatus: 'idle' });
      return;
    }
    set({ referenceAvailabilityStatus: 'checking' });
    try {
      const availability = await getReferenceAvailability(bbox);
      // Do not let a slow response for an older AOI overwrite the newer one.
      if (get().selectedBbox?.join(',') !== bbox.join(',')) return;
      set({ referenceAvailability: availability, referenceAvailabilityStatus: 'ready' });
    } catch {
      if (get().selectedBbox?.join(',') !== bbox.join(',')) return;
      set({ referenceAvailability: null, referenceAvailabilityStatus: 'error' });
    }
  },

  download: async () => {
    const { selectedBbox, cloudCover, selectedScene } = get();
    if (!selectedBbox) return;
    if (!selectedScene) {
      await get().searchScenes();
      if (!get().selectedScene) return;
    }
    set({ status: 'downloading', statusMessage: 'Finding a clear Sentinel-2 scene for the selected area...' });
    try {
      const imagery = await acquireSentinelImagery(selectedBbox, cloudCover, get().selectedScene);
      const [height, width] = imagery.dimensions ?? [0, 0];
      useProjectStore.getState().setInputInfo('Sentinel-2 RGB', {
        kind: 'georeferenced',
        width,
        height,
        crs: imagery.crs,
      });
      set({
        imagery,
        status: 'ready',
        statusMessage: `${imagery.source.scene_id} is ready. HeightNet can now process it.`,
      });
      useAppStore.getState().notify('Sentinel-2 RGB is ready', 'success');
    } catch (error) {
      set({ status: 'error', statusMessage: error instanceof Error ? error.message : 'Sentinel-2 download failed.' });
      useAppStore.getState().notify('Sentinel-2 download failed', 'warning');
    }
  },

  buildTerrain: async () => {
    const { selectedBbox, cloudCover, selectedScene } = get();
    if (!selectedBbox || get().status === 'running') return;

    if (!selectedScene) {
      await get().searchScenes();
      if (!get().selectedScene) return;
    }

    set({ status: 'downloading', statusMessage: 'Downloading the selected Sentinel-2 capture...' });
    try {
      const imagery = await acquireSentinelImagery(selectedBbox, cloudCover, get().selectedScene);
      const [height, width] = imagery.dimensions ?? [0, 0];
      useProjectStore.getState().setInputInfo('Sentinel-2 RGB', {
        kind: 'georeferenced',
        width,
        height,
        crs: imagery.crs,
      });
      set({ imagery, statusMessage: `${imagery.source.scene_id} downloaded. Starting HeightNet...` });
      await runPipelineForImagery(imagery);
    } catch (error) {
      set({ status: 'error', statusMessage: error instanceof Error ? error.message : 'Sentinel-2 terrain build failed.' });
      useAppStore.getState().notify('Sentinel-2 terrain build failed', 'warning');
    }
  },

  buildTemporal: async () => {
    const { selectedBbox, cloudCover, selectedScenes } = get();
    if (!selectedBbox || selectedScenes.length < 2 || get().status === 'running') return;

    clearTemporalComparison();
    const runs: TemporalRun[] = [];
    set({ status: 'downloading', statusMessage: `Preparing ${selectedScenes.length} captures for comparison...` });
    try {
      for (const [index, scene] of selectedScenes.entries()) {
        const sceneLabel = scene.capture_date ? new Date(scene.capture_date).toISOString().slice(0, 10) : scene.scene_id;
        try {
          set({ status: 'downloading', statusMessage: `Downloading capture ${index + 1} of ${selectedScenes.length}...` });
          const imagery = await acquireSentinelImagery(selectedBbox, cloudCover, scene);
          set({ status: 'running', statusMessage: `Building ${sceneLabel} (${index + 1}/${selectedScenes.length})...` });
          const result = await processPipeline(imagery, (message) => set({ statusMessage: `${sceneLabel}: ${message}` }));
          runs.push({
            id: `temporal-${scene.scene_id}`,
            sceneId: scene.scene_id,
            captureDate: scene.capture_date,
            cloudCover: scene.cloud_cover,
            result,
          });
          useProjectStore.getState().setTemporalRuns([...runs]);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Capture failed.';
          if (!/does not cover enough|valid pixels|scene footprint/i.test(message)) throw error;
          set({ statusMessage: `Skipped ${sceneLabel}: incomplete Sentinel coverage.` });
          useAppStore.getState().notify(`${sceneLabel} skipped because the AOI is not fully covered`, 'warning');
        }
      }

      if (runs.length < 2) {
        throw new Error('Fewer than two selected dates had enough valid Sentinel coverage. Choose different dates or a smaller AOI.');
      }

      const latest = runs[runs.length - 1];
      if (latest) useProjectStore.getState().setLiveResult(latest.result, null);
      const layout = runs.length >= 3 ? 'grid-4' : 'split-2';
      const workspace = useWorkspaceStore.getState();
      workspace.setLayout(layout);
      const panes = useWorkspaceStore.getState().panes;
      panes.forEach((pane, index) => {
        const run = runs[index];
        workspace.setPaneTemporalRun(pane.id, run?.id ?? null);
        workspace.setPaneView(pane.id, run ? '3D' : '2D');
      });
      useAppStore.getState().setActiveView('3D');
      useAppStore.getState().notify(`${runs.length} dated terrains are ready to compare`, 'success');
      set({ status: 'complete', result: latest?.result ?? null, statusMessage: `${runs.length} dated terrains are ready. Use Link 3D to move them together.` });
    } catch (error) {
      set({ status: 'error', statusMessage: error instanceof Error ? error.message : 'Temporal terrain comparison failed.' });
      useAppStore.getState().notify('Temporal terrain comparison failed', 'warning');
    }
  },

  runPipeline: async () => {
    const imagery = get().imagery;
    if (!imagery) return;
    await runPipelineForImagery(imagery);
  },

  reset: () => {
    useProjectStore.getState().setTemporalRuns([]);
    set({ ...initialState });
  },
  };
});
