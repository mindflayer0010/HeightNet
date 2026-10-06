import React from 'react';
import { Columns2, LayoutGrid, Link2, PanelLeft, PanelRight, Rows2, Square } from 'lucide-react';
import { useWorkspaceStore, type WorkspaceLayout } from '../../state/workspaceStore';

const layouts: Array<{ id: WorkspaceLayout; label: string; icon: React.ReactNode }> = [
  { id: 'single', label: 'One view', icon: <Square size={13} /> },
  { id: 'split-2', label: 'Two views', icon: <Columns2 size={13} /> },
  { id: 'grid-4', label: 'Four views', icon: <LayoutGrid size={13} /> },
];

export const WorkspaceControls: React.FC = () => {
  const { layout, setLayout, panels, togglePanel, syncCameras, setSyncCameras } = useWorkspaceStore();

  return (
    <div className="workspace-controls" aria-label="Workspace layout controls">
      <div className="workspace-layout-switcher" role="group" aria-label="Comparison layout">
        {layouts.map((item) => (
          <button
            key={item.id}
            className={layout === item.id ? 'active' : ''}
            onClick={() => setLayout(item.id)}
            title={item.label}
            aria-label={item.label}
            aria-pressed={layout === item.id}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <button
        className={`workspace-link-toggle ${syncCameras ? 'active' : ''}`}
        onClick={() => setSyncCameras(!syncCameras)}
        title="Link navigation in 3D panes"
        aria-label="Link 3D navigation"
        aria-pressed={syncCameras}
      >
        <Link2 size={13} />
        <span>Link 3D</span>
      </button>

      <div className="workspace-panel-switcher" role="group" aria-label="Workspace panels">
        <button className={panels.left ? 'active' : ''} onClick={() => togglePanel('left')} title="Show or hide left panel" aria-label="Toggle left panel" aria-pressed={panels.left}>
          <PanelLeft size={13} />
        </button>
        <button className={panels.right ? 'active' : ''} onClick={() => togglePanel('right')} title="Show or hide right panel" aria-label="Toggle right panel" aria-pressed={panels.right}>
          <PanelRight size={13} />
        </button>
        <button className={panels.bottom ? 'active' : ''} onClick={() => togglePanel('bottom')} title="Show or hide bottom status bar" aria-label="Toggle bottom status bar" aria-pressed={panels.bottom}>
          <Rows2 size={13} />
        </button>
      </div>
    </div>
  );
};
