import React, { useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { ViewSidebar } from '../navigation/ViewSidebar';
import { WorkspaceViewport } from '../workspace/WorkspaceViewport';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { CommandPalette } from '../modals/CommandPalette';
import { ProjectInfoModal } from '../modals/ProjectInfoModal';
import { KeyboardShortcutsModal } from '../modals/KeyboardShortcutsModal';
import { AboutModal } from '../modals/AboutModal';
import { ExportModal } from '../modals/ExportModal';
import { LayerPropertiesModal } from '../modals/LayerPropertiesModal';
import { useAppStore } from '../../state/appStore';
import { useViewportStore } from '../../state/viewportStore';
import { Info, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { UtilitiesDrawer } from '../utilities/UtilitiesDrawer';

export const AppShell: React.FC = () => {
  const {
    activeView,
    setActiveView,
    openDedicated3DViewer,
    setLeftSidebarWidth,
    setRightPanelWidth,
    notifications,
    dismissNotification,
    notify,
  } = useAppStore();
  const { panels, activePaneId, setPaneView } = useWorkspaceStore();

  // Keep the global view selector and the visible pane in sync. Without this,
  // the header/sidebar could say Map or 3D while the canvas was still rendering
  // the old Raster pane.
  useEffect(() => {
    setPaneView(activePaneId, activeView);
  }, [activePaneId, activeView, setPaneView]);

  const {
    fit2DToView,
    reset2DView,
    resetCamera3D,
    toggleGrid2D,
    toggleGrid3D,
    toggleMeasureMode2D,
  } = useViewportStore();

  // Splitter dragging states
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        setLeftSidebarWidth(e.clientX);
      } else if (isDraggingRight) {
        setRightPanelWidth(window.innerWidth - e.clientX);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, setLeftSidebarWidth, setRightPanelWidth]);

  // Global Application Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === '1') {
        e.preventDefault();
        setActiveView('2D');
        notify('Switched to 2D Raster View', 'info');
      } else if (e.key === '2') {
        e.preventDefault();
        setActiveView('3D');
        notify('Switched to 3D Terrain Perspective', 'info');
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (activeView === 'MAP') {
          notify('Use the map controls to search and select an area', 'info');
        } else if (activeView === '2D') {
          fit2DToView();
        } else {
          resetCamera3D();
        }
        notify('Fitted to View', 'info');
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (activeView === 'MAP') {
          notify('Map view is ready for a new area selection', 'info');
        } else if (activeView === '2D') {
          reset2DView();
        } else {
          resetCamera3D();
        }
        notify('Camera / View Reset', 'info');
      } else if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (activeView === 'MAP') {
          notify('Map imagery already provides geographic context', 'info');
        } else if (activeView === '2D') {
          toggleGrid2D();
        } else {
          toggleGrid3D();
        }
        notify('Toggled Grid Overlay', 'info');
      } else if (e.key.toLowerCase() === 'm' && activeView === '2D') {
        e.preventDefault();
        toggleMeasureMode2D();
        notify('Toggled Measure Tool', 'info');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        openDedicated3DViewer(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeView,
    setActiveView,
    openDedicated3DViewer,
    fit2DToView,
    reset2DView,
    resetCamera3D,
    toggleGrid2D,
    toggleGrid3D,
    toggleMeasureMode2D,
    notify,
  ]);

  return (
    <div className={`app-shell ${panels.left ? '' : 'panels-left-hidden'} ${panels.right ? '' : 'panels-right-hidden'} ${panels.bottom ? '' : 'panels-bottom-hidden'}`}>
      <TopBar />

      <div className="workspace-container">
        {/* Left Sidebar (Views + Layers) */}
        {panels.left ? <ViewSidebar /> : null}

        {/* Left Splitter */}
        {panels.left ? <div
          className={`workspace-splitter ${isDraggingLeft ? 'dragging' : ''}`}
          onMouseDown={() => setIsDraggingLeft(true)}
          title="Drag to resize Views & Layers sidebar"
        /> : null}

        {/* Center Main Viewport */}
        <WorkspaceViewport />

        {/* Right Splitter */}
        {panels.right ? <div
          className={`workspace-splitter ${isDraggingRight ? 'dragging' : ''}`}
          onMouseDown={() => setIsDraggingRight(true)}
          title="Drag to resize Inspector panel"
        /> : null}

        {/* Right Inspector Panel */}
        {panels.right ? <InspectorPanel /> : null}
      </div>

      {/* Application Notifications / Toasts */}
      <div className="notification-container">
        {notifications.map((notif) => (
          <div key={notif.id} className={`notification-toast ${notif.type}`}>
            {notif.type === 'success' && <CheckCircle2 size={14} color="var(--status-success)" />}
            {notif.type === 'warning' && <AlertTriangle size={14} color="var(--status-warning)" />}
            {notif.type === 'info' && <Info size={14} color="var(--status-info)" />}
            <span style={{ flex: 1 }}>{notif.message}</span>
            <button
              style={{ padding: '2px', color: 'var(--text-muted)' }}
              onClick={() => dismissNotification(notif.id)}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* Modals & Command Palette */}
      <CommandPalette />
      <ProjectInfoModal />
      <KeyboardShortcutsModal />
      <AboutModal />
      <ExportModal />
      <LayerPropertiesModal />
      <UtilitiesDrawer />
    </div>
  );
};
