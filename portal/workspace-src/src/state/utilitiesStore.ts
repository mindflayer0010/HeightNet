import { create } from 'zustand';
import type { Viewport2DState, Viewport3DState } from '../types/viewport';
import type { ProfileResult } from '../integration/api';

export type UtilityTab = 'analyze' | 'compare' | 'quality' | 'export' | 'history';
export type AnalysisMode = 'probe' | 'profile';

export interface ProbeReadout {
  row: number;
  column: number;
  elevation: number | null;
  slopeDegrees: number | null;
  agl: number | null;
  confidence: number | null;
  uncertainty: number | null;
  sceneRisk: number | null;
  mapX: number | null;
  mapY: number | null;
  crs: string | null;
}

export interface ViewBookmark {
  id: string;
  name: string;
  createdAt: string;
  viewport2D: Pick<Viewport2DState, 'zoom' | 'panX' | 'panY' | 'rotation'>;
  viewport3D: Pick<Viewport3DState, 'cameraMode' | 'cameraFov' | 'cameraSpeed' | 'verticalExaggeration' | 'materialMode'>;
}

export interface RunHistoryEntry {
  id: string;
  name: string;
  createdAt: string;
  crs: string;
  dimensions: string;
  outputs: number;
}

const BOOKMARKS_KEY = 'heightnet.view-bookmarks';
const HISTORY_KEY = 'heightnet.run-history';

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage is a convenience. A blocked browser storage policy should
    // never break the terrain workspace.
  }
}

interface UtilitiesStore {
  open: boolean;
  tab: UtilityTab;
  analysisMode: AnalysisMode;
  profilePoints: Array<{ x: number; y: number }>;
  profile: ProfileResult | null;
  profileLoading: boolean;
  profileError: string | null;
  probe: ProbeReadout | null;
  bookmarks: ViewBookmark[];
  history: RunHistoryEntry[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setTab: (tab: UtilityTab) => void;
  setAnalysisMode: (mode: AnalysisMode) => void;
  addProfilePoint: (point: { x: number; y: number }) => void;
  clearProfile: () => void;
  setProfile: (profile: ProfileResult | null) => void;
  setProfileLoading: (loading: boolean) => void;
  setProfileError: (message: string | null) => void;
  setProbe: (probe: ProbeReadout | null) => void;
  saveBookmark: (bookmark: Omit<ViewBookmark, 'id' | 'createdAt'>) => void;
  removeBookmark: (id: string) => void;
  addHistory: (entry: Omit<RunHistoryEntry, 'id' | 'createdAt'>) => void;
  clearHistory: () => void;
}

export const useUtilitiesStore = create<UtilitiesStore>((set) => ({
  open: false,
  tab: 'analyze',
  analysisMode: 'probe',
  profilePoints: [],
  profile: null,
  profileLoading: false,
  profileError: null,
  probe: null,
  bookmarks: readStored<ViewBookmark[]>(BOOKMARKS_KEY, []),
  history: readStored<RunHistoryEntry[]>(HISTORY_KEY, []),

  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  setTab: (tab) => set({ tab, open: true }),
  setAnalysisMode: (analysisMode) => set({ analysisMode, profilePoints: [], profile: null, profileError: null }),
  addProfilePoint: (point) => set((state) => ({
    profilePoints: state.profilePoints.length >= 2 ? [point] : [...state.profilePoints, point],
    profile: null,
    profileError: null,
  })),
  clearProfile: () => set({ profilePoints: [], profile: null, profileError: null, profileLoading: false }),
  setProfile: (profile) => set({ profile, profileLoading: false }),
  setProfileLoading: (profileLoading) => set({ profileLoading }),
  setProfileError: (profileError) => set({ profileError, profileLoading: false }),
  setProbe: (probe) => set({ probe }),

  saveBookmark: (bookmark) => set((state) => {
    const next: ViewBookmark = {
      ...bookmark,
      id: `bookmark-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    const bookmarks = [next, ...state.bookmarks].slice(0, 12);
    writeStored(BOOKMARKS_KEY, bookmarks);
    return { bookmarks };
  }),
  removeBookmark: (id) => set((state) => {
    const bookmarks = state.bookmarks.filter((bookmark) => bookmark.id !== id);
    writeStored(BOOKMARKS_KEY, bookmarks);
    return { bookmarks };
  }),

  addHistory: (entry) => set((state) => {
    const next: RunHistoryEntry = {
      ...entry,
      id: `run-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    const history = [next, ...state.history].slice(0, 20);
    writeStored(HISTORY_KEY, history);
    return { history };
  }),
  clearHistory: () => {
    writeStored(HISTORY_KEY, []);
    set({ history: [] });
  },
}));
