import { create } from 'zustand';
import type { ActiveView } from '../types/viewport';

export type WorkspaceLayout = 'single' | 'split-2' | 'grid-4';
export type WorkspacePanel = 'left' | 'right' | 'bottom';

export interface WorkspacePane {
  id: string;
  view: ActiveView;
  title: string;
  temporalRunId?: string | null;
}

const defaultPanes: WorkspacePane[] = [
  { id: 'pane-main', view: 'MAP', title: 'Map', temporalRunId: null },
];

const paneDefaults: WorkspacePane[] = [
  { id: 'pane-main', view: '2D', title: 'Raster', temporalRunId: null },
  { id: 'pane-terrain', view: '3D', title: 'Terrain', temporalRunId: null },
  { id: 'pane-map', view: 'MAP', title: 'Map', temporalRunId: null },
  { id: 'pane-diagnostic', view: '2D', title: 'Diagnostic', temporalRunId: null },
];

const viewTitles: Record<ActiveView, string> = {
  MAP: 'Map',
  '2D': 'Raster',
  '3D': 'Terrain',
};

interface WorkspaceStore {
  layout: WorkspaceLayout;
  panes: WorkspacePane[];
  activePaneId: string;
  panels: Record<WorkspacePanel, boolean>;
  syncCameras: boolean;
  setLayout: (layout: WorkspaceLayout) => void;
  setActivePane: (id: string) => void;
  setPaneView: (id: string, view: ActiveView) => void;
  setPaneTemporalRun: (id: string, temporalRunId: string | null) => void;
  reorderPanes: (sourceId: string, targetId: string) => void;
  duplicatePane: (id: string) => void;
  removePane: (id: string) => void;
  togglePanel: (panel: WorkspacePanel) => void;
  setPanelVisible: (panel: WorkspacePanel, visible: boolean) => void;
  setSyncCameras: (enabled: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  layout: 'single',
  panes: defaultPanes,
  activePaneId: 'pane-main',
  panels: { left: true, right: true, bottom: true },
  syncCameras: false,

  setLayout: (layout) =>
    set((state) => {
      const count = layout === 'single' ? 1 : layout === 'split-2' ? 2 : 4;
      const panes = state.panes.slice(0, count);
      const usedIds = new Set(panes.map((pane) => pane.id));
      for (const fallback of paneDefaults) {
        if (panes.length >= count) break;
        if (!usedIds.has(fallback.id)) {
          panes.push(fallback);
          usedIds.add(fallback.id);
        }
      }
      return {
        layout,
        panes,
        activePaneId: panes.some((pane) => pane.id === state.activePaneId) ? state.activePaneId : panes[0].id,
      };
    }),

  setActivePane: (id) => set((state) => (state.panes.some((pane) => pane.id === id) ? { activePaneId: id } : state)),

  setPaneView: (id, view) =>
    set((state) => ({
      panes: state.panes.map((pane) => (pane.id === id ? { ...pane, view, title: viewTitles[view] } : pane)),
    })),

  setPaneTemporalRun: (id, temporalRunId) =>
    set((state) => ({
      panes: state.panes.map((pane) => (pane.id === id ? { ...pane, temporalRunId } : pane)),
    })),

  reorderPanes: (sourceId, targetId) =>
    set((state) => {
      if (sourceId === targetId) return state;
      const sourceIndex = state.panes.findIndex((pane) => pane.id === sourceId);
      const targetIndex = state.panes.findIndex((pane) => pane.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return state;
      const panes = [...state.panes];
      const [moved] = panes.splice(sourceIndex, 1);
      panes.splice(targetIndex, 0, moved);
      return { panes };
    }),

  duplicatePane: (id) =>
    set((state) => {
      if (state.panes.length >= 4) return state;
      const source = state.panes.find((pane) => pane.id === id);
      if (!source) return state;
      const copyNumber = state.panes.length + 1;
      const copy = { ...source, id: `${source.id}-copy-${copyNumber}`, title: `${source.title} copy` };
      const nextPanes = [...state.panes, copy];
      if (nextPanes.length === 3) nextPanes.push(paneDefaults[3]);
      return {
        layout: state.panes.length === 1 ? 'split-2' : 'grid-4',
        panes: nextPanes,
        activePaneId: copy.id,
      };
    }),

  removePane: (id) =>
    set((state) => {
      if (state.panes.length <= 1 || !state.panes.some((pane) => pane.id === id)) return state;
      const panes = state.panes.filter((pane) => pane.id !== id);
      const layout: WorkspaceLayout = panes.length >= 4 ? 'grid-4' : panes.length >= 2 ? 'split-2' : 'single';
      return {
        layout,
        panes,
        activePaneId: state.activePaneId === id ? panes[0].id : state.activePaneId,
      };
    }),

  togglePanel: (panel) =>
    set((state) => ({ panels: { ...state.panels, [panel]: !state.panels[panel] } })),

  setPanelVisible: (panel, visible) =>
    set((state) => ({ panels: { ...state.panels, [panel]: visible } })),

  setSyncCameras: (enabled) => set({ syncCameras: enabled }),
}));
