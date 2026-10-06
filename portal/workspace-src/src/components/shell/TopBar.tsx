import React from 'react';
import { MountainSnow, Command, FileUp, Globe2, Wrench } from 'lucide-react';
import { HomeMenu } from '../menus/HomeMenu';
import { LayersMenu } from '../menus/LayersMenu';
import { ToolsMenu } from '../menus/ToolsMenu';
import { HelpMenu } from '../menus/HelpMenu';
import { useProjectStore } from '../../state/projectStore';
import { useAppStore } from '../../state/appStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { WorkspaceControls } from '../workspace/WorkspaceControls';
import { useUtilitiesStore } from '../../state/utilitiesStore';

export const TopBar: React.FC = () => {
  const project = useProjectStore((state) => state.project);
  const { setCommandPaletteOpen } = useAppStore();
  const setActiveView = useAppStore((state) => state.setActiveView);
  const { activePaneId, setPaneView } = useWorkspaceStore();
  const toggleUtilities = useUtilitiesStore((state) => state.toggle);
  const hasRaster = project.metadata.dimensions.width > 0 && project.metadata.dimensions.height > 0;

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-left">
        <div className="app-branding">
          <MountainSnow className="app-logo-icon" />
          <span className="app-branding-name">HeightNet</span>
          <span className="app-branding-subtitle">workspace</span>
        </div>

        <nav className="app-menu-bar" aria-label="Main Application Menu">
          <HomeMenu />
          <LayersMenu />
          <ToolsMenu />
          <HelpMenu />
        </nav>
      </div>

      <div className="top-bar-center" title="Current project information">
        <span className={`top-bar-status-dot ${hasRaster ? 'ready' : ''}`} aria-hidden="true" />
        <span className="top-bar-project-name">{hasRaster ? project.metadata.name : 'No project loaded'}</span>
        <span className="top-bar-separator">/</span>
        {hasRaster ? (
          <>
            <span aria-hidden="true">&bull;</span>
            <span>{project.metadata.dimensions.width} &times; {project.metadata.dimensions.height} px</span>
            <span aria-hidden="true">&bull;</span>
            <span>{project.metadata.crs}</span>
          </>
        ) : (
          <span className="top-bar-context">Ready for an image or map area</span>
        )}
      </div>

      <div className="top-bar-right">
        <button className="map-trigger" onClick={() => { setPaneView(activePaneId, 'MAP'); setActiveView('MAP'); }} title="Open the Sentinel map and area selector">
          <Globe2 size={11} />
          <span>Map</span>
        </button>
        <button
          className="upload-trigger"
          onClick={() => {
            setPaneView(activePaneId, '2D');
            setActiveView('2D');
            window.setTimeout(() => window.dispatchEvent(new CustomEvent('heightnet:open-upload')), 0);
          }}
          title="Upload a PNG, JPG, or GeoTIFF"
        >
          <FileUp size={11} />
          <span>Upload</span>
        </button>
        <button
          className="cmd-k-trigger"
          onClick={() => setCommandPaletteOpen(true)}
          title="Open Command Palette (Ctrl+K)"
          aria-label="Open Command Palette"
        >
          <Command size={11} />
          <span>Quick Actions</span>
          <span className="kbd-badge">Ctrl+K</span>
        </button>
        <button className="utilities-trigger" onClick={toggleUtilities} title="Open workspace utilities">
          <Wrench size={11} />
          <span>Utilities</span>
        </button>
        <WorkspaceControls />
      </div>
    </header>
  );
};
