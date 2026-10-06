import React from 'react';
import { Copy, Map, Mountain, X } from 'lucide-react';
import { MainViewport } from '../viewport/MainViewport';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { useAppStore } from '../../state/appStore';
import { useProjectStore } from '../../state/projectStore';
import type { ActiveView } from '../../types/viewport';

const viewLabels: Record<ActiveView, string> = {
  MAP: 'Map',
  '2D': 'Raster',
  '3D': 'Terrain',
};

export const WorkspaceViewport: React.FC = () => {
  const { layout, panes, activePaneId, setActivePane, setPaneView, reorderPanes, duplicatePane, removePane } = useWorkspaceStore();
  const setActiveView = useAppStore((state) => state.setActiveView);
  const temporalRuns = useProjectStore((state) => state.temporalRuns);
  const [draggingPaneId, setDraggingPaneId] = React.useState<string | null>(null);
  const [columnSplit, setColumnSplit] = React.useState(50);
  const [rowSplit, setRowSplit] = React.useState(50);

  const startResize = (axis: 'column' | 'row', event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const grid = event.currentTarget.parentElement;
    if (!grid) return;
    const bounds = grid.getBoundingClientRect();
    const startPosition = axis === 'column' ? event.clientX : event.clientY;
    const initialSplit = axis === 'column' ? columnSplit : rowSplit;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const size = axis === 'column' ? bounds.width : bounds.height;
      const position = axis === 'column' ? moveEvent.clientX : moveEvent.clientY;
      const delta = size > 0 ? ((position - startPosition) / size) * 100 : 0;
      const nextSplit = Math.max(22, Math.min(78, initialSplit + delta));
      if (axis === 'column') setColumnSplit(nextSplit);
      else setRowSplit(nextSplit);
    };
    const stopResize = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      document.body.classList.remove('workspace-resizing');
      document.body.classList.remove(`workspace-resizing-${axis}`);
    };

    document.body.classList.add('workspace-resizing');
    document.body.classList.add(`workspace-resizing-${axis}`);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });
  };

  const gridStyle = {
    '--workspace-col-split': `${columnSplit}%`,
    '--workspace-row-split': `${rowSplit}%`,
  } as React.CSSProperties;

  return (
    <div className={`workspace-viewport-grid workspace-layout-${layout}`} style={gridStyle}>
      {panes.map((pane) => {
        const active = pane.id === activePaneId;
        return (
          <section
            key={pane.id}
            className={`workspace-pane ${active ? 'active' : ''} ${draggingPaneId === pane.id ? 'dragging' : ''}`}
            onMouseDown={() => {
              setActivePane(pane.id);
              setActiveView(pane.view);
            }}
            aria-label={`${viewLabels[pane.view]} comparison pane`}
          >
            {layout !== 'single' ? (
              <div
                className="workspace-pane-header"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData('text/heightnet-pane');
                  if (sourceId) reorderPanes(sourceId, pane.id);
                  setDraggingPaneId(null);
                }}
              >
                <span
                  className="workspace-pane-title"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/heightnet-pane', pane.id);
                    setDraggingPaneId(pane.id);
                  }}
                  onDragEnd={() => setDraggingPaneId(null)}
                  title="Drag to rearrange this view"
                >
                  {pane.view === 'MAP' ? <Map size={12} /> : <Mountain size={12} />}
                  {pane.temporalRunId
                    ? `${pane.title} · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(temporalRuns.find((run) => run.id === pane.temporalRunId)?.captureDate ?? ''))}`
                    : pane.title}
                </span>
                <div className="workspace-pane-actions">
                  <select
                    value={pane.view}
                    onChange={(event) => {
                      const nextView = event.target.value as ActiveView;
                      setPaneView(pane.id, nextView);
                      setActivePane(pane.id);
                      setActiveView(nextView);
                    }}
                    aria-label={`View type for ${pane.title}`}
                  >
                    <option value="MAP">Map</option>
                    <option value="2D">Raster</option>
                    <option value="3D">Terrain</option>
                  </select>
                  <button title="Duplicate pane" aria-label={`Duplicate ${pane.title}`} onClick={() => duplicatePane(pane.id)} disabled={panes.length >= 4}>
                    <Copy size={12} />
                  </button>
                  <button title="Close pane" aria-label={`Close ${pane.title}`} onClick={() => removePane(pane.id)} disabled={panes.length <= 1}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : null}
            <MainViewport viewOverride={pane.view} paneId={pane.id} compact={layout !== 'single'} />
          </section>
        );
      })}
      {layout === 'split-2' || layout === 'grid-4' ? (
        <div
          className="workspace-resize-handle workspace-resize-handle-column"
          role="separator"
          aria-label="Resize left and right views"
          title="Drag to resize left and right views"
          onPointerDown={(event) => startResize('column', event)}
        />
      ) : null}
      {layout === 'grid-4' ? (
        <div
          className="workspace-resize-handle workspace-resize-handle-row"
          role="separator"
          aria-label="Resize top and bottom views"
          title="Drag to resize top and bottom views"
          onPointerDown={(event) => startResize('row', event)}
        />
      ) : null}
    </div>
  );
};
