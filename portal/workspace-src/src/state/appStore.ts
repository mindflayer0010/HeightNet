import { create } from 'zustand';
import type { ActiveView } from '../types/viewport';

export type ModalType =
  | 'project-info'
  | 'shortcuts'
  | 'about'
  | 'layer-props'
  | 'export'
  | null;

export type AppScreen = 'workspace' | 'dedicated_3d_viewer';

interface AppNotification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  timestamp: number;
}

interface AppStore {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  currentScreen: AppScreen;
  setCurrentScreen: (screen: AppScreen) => void;
  openDedicated3DViewer: (popout?: boolean) => void;
  backToWorkspace: () => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  activeModal: ModalType;
  activeLayerForModal: string | null;
  openModal: (modal: ModalType, layerId?: string) => void;
  closeModal: () => void;

  leftSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;

  rightPanelWidth: number;
  setRightPanelWidth: (width: number) => void;

  notifications: AppNotification[];
  notify: (message: string, type?: 'info' | 'success' | 'warning') => void;
  dismissNotification: (id: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeView:
    typeof window !== 'undefined' && window.location.pathname.startsWith('/viewer/3d')
      ? '3D'
      : typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'map'
        ? 'MAP'
        : 'MAP',

  currentScreen: 'workspace',

  setActiveView: (view) => set({ activeView: view }),
  setCurrentScreen: (screen) => set({ currentScreen: screen }),

  openDedicated3DViewer: (popout = false) => {
    if (popout) {
      const w = 1500;
      const h = 880;
      const left = Math.max(0, (window.screen.width - w) / 2);
      const top = Math.max(0, (window.screen.height - h) / 2);
      window.open(
        '/viewer/3d',
        'HeightNet3DViewer',
        `width=${w},height=${h},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
      );
      return;
    }

    set({ currentScreen: 'workspace', activeView: '3D' });
  },

  backToWorkspace: () => {
    set({ currentScreen: 'workspace', activeView: '3D' });
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({ screen: 'workspace' }, '', '/');
    }
  },

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  activeModal: null,
  activeLayerForModal: null,
  openModal: (modal, layerId) =>
    set({ activeModal: modal, activeLayerForModal: layerId || null }),
  closeModal: () => set({ activeModal: null, activeLayerForModal: null }),

  leftSidebarWidth: 280,
  setLeftSidebarWidth: (width) =>
    set({ leftSidebarWidth: Math.max(220, Math.min(420, width)) }),

  rightPanelWidth: 320,
  setRightPanelWidth: (width) =>
    set({ rightPanelWidth: Math.max(240, Math.min(480, width)) }),

  notifications: [],
  notify: (message, type = 'info') => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((state) => ({
      notifications: [
        ...state.notifications.slice(-4),
        { id, message, type, timestamp: Date.now() },
      ],
    }));
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, 3800);
  },
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
