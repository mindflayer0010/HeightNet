import React from 'react';
import { ViewSelector } from './ViewSelector';
import { LayerPanel } from '../layers/LayerPanel';
import { useAppStore } from '../../state/appStore';

export const ViewSidebar: React.FC = () => {
  const leftSidebarWidth = useAppStore((state) => state.leftSidebarWidth);

  return (
    <aside
      className="left-sidebar"
      style={{ width: `${leftSidebarWidth}px`, minWidth: '220px', maxWidth: '420px' }}
      aria-label="Navigation & Layer Sidebar"
    >
      <ViewSelector />
      <div className="sidebar-divider" />
      <LayerPanel />
    </aside>
  );
};
