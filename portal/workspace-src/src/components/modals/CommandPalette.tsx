import React, { useEffect } from 'react';
import { Command } from 'cmdk';
import {
  Eye,
  Box,
  Compass,
  Maximize2,
  RotateCcw,
  Grid,
  Network,
  Ruler,
  Info,
  Keyboard,
  Download,
  HelpCircle,
  ExternalLink,
  RotateCw,
} from 'lucide-react';
import { useAppStore } from '../../state/appStore';
import { useViewportStore } from '../../state/viewportStore';

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActiveView,
    openDedicated3DViewer,
    openModal,
    notify,
  } = useAppStore();

  const {
    viewport3D,
    setCameraMode3D,
    toggleAutoOrbitPaused3D,
    fit2DToView,
    reset2DView,
    resetCamera3D,
    toggleGrid2D,
    toggleGrid3D,
    toggleWireframe3D,
    toggleMeasureMode2D,
  } = useViewportStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const runCommand = (action: () => void) => {
    action();
    setCommandPaletteOpen(false);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => setCommandPaletteOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="cmd-palette-wrapper"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Palette">
          <div className="cmd-input-container">
            <Command.Input
              className="cmd-input"
              placeholder="Type a command, tool name, or shortcut..."
              autoFocus
            />
          </div>

          <Command.List className="cmd-list">
            <Command.Empty style={{ padding: '12px', color: 'var(--text-muted)' }}>
              No matching commands found.
            </Command.Empty>

            <Command.Group heading="Navigation & Views" className="cmd-group-heading">
              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  setActiveView('MAP');
                  notify('Switched to Map Acquisition', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Compass size={13} />
                  <span>Open Map Acquisition</span>
                </div>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  setActiveView('2D');
                  notify('Switched to 2D Raster View', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Eye size={13} />
                  <span>Switch to 2D Raster View</span>
                </div>
                <span className="cmd-badge">1</span>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  setActiveView('3D');
                  notify('Switched to 3D Terrain View', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Box size={13} />
                  <span>Switch to 3D Terrain View</span>
                </div>
                <span className="cmd-badge">2</span>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  openDedicated3DViewer(false);
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ExternalLink size={13} />
                  <span>Open Dedicated 3D Viewer Screen</span>
                </div>
                <span className="cmd-badge">Ctrl+3</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="3D Camera System" className="cmd-group-heading">
              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  setActiveView('3D');
                  setCameraMode3D('orbit');
                  notify('Orbit Camera Active', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Compass size={13} />
                  <span>Camera: Orbit Mode</span>
                </div>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  setActiveView('3D');
                  setCameraMode3D('auto-orbit');
                  notify('Auto Orbit Camera Active (Continuous Terrain Rotation)', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RotateCw size={13} />
                  <span>Camera: Auto Orbit Mode</span>
                </div>
              </Command.Item>

              {viewport3D.cameraMode === 'auto-orbit' && (
                <Command.Item
                  className="cmd-item"
                  onSelect={() => runCommand(() => {
                    toggleAutoOrbitPaused3D();
                    notify(
                      viewport3D.autoOrbit.paused ? 'Auto Orbit Resumed' : 'Auto Orbit Paused',
                      'info'
                    );
                  })}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RotateCw size={13} />
                    <span>
                      {viewport3D.autoOrbit.paused
                        ? 'Auto Orbit: Resume Continuous Rotation'
                        : 'Auto Orbit: Pause Continuous Rotation'}
                    </span>
                  </div>
                </Command.Item>
              )}

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  setActiveView('3D');
                  setCameraMode3D('flythrough');
                  notify('6-DOF Flythrough Camera Active (WASD + Mouse)', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Compass size={13} />
                  <span>Camera: 6-DOF Flythrough Mode</span>
                </div>
                <span className="cmd-badge">Shift+F</span>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  setActiveView('3D');
                  setCameraMode3D('walkthrough');
                  notify('Walkthrough Camera Active (Terrain Collision Clamped)', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Compass size={13} />
                  <span>Camera: Walkthrough Ground Mode</span>
                </div>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  resetCamera3D();
                  reset2DView();
                  notify('Camera Reset to Default Extents', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RotateCcw size={13} />
                  <span>Reset Camera / View</span>
                </div>
                <span className="cmd-badge">R</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Tools & Visualization" className="cmd-group-heading">
              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  fit2DToView();
                  notify('Fitted to View', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Maximize2 size={13} />
                  <span>Fit to View</span>
                </div>
                <span className="cmd-badge">F</span>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  toggleGrid2D();
                  toggleGrid3D();
                  notify('Toggled Grid Overlay', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Grid size={13} />
                  <span>Toggle Coordinate Grid</span>
                </div>
                <span className="cmd-badge">G</span>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  toggleWireframe3D();
                  notify('Toggled Wireframe Mesh', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Network size={13} />
                  <span>Toggle Wireframe Topology</span>
                </div>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => {
                  setActiveView('2D');
                  toggleMeasureMode2D();
                  notify('Distance Measurement Mode Toggled', 'info');
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Ruler size={13} />
                  <span>Measure Distance Tool</span>
                </div>
                <span className="cmd-badge">M</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Project & System" className="cmd-group-heading">
              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => openModal('project-info'))}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Info size={13} />
                  <span>Project Information & CRS Metadata</span>
                </div>
                <span className="cmd-badge">Ctrl+I</span>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => openModal('export'))}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Download size={13} />
                  <span>Export 3D Mesh / GeoTIFF</span>
                </div>
                <span className="cmd-badge">Ctrl+E</span>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => openModal('shortcuts'))}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Keyboard size={13} />
                  <span>Keyboard Shortcuts Reference</span>
                </div>
                <span className="cmd-badge">?</span>
              </Command.Item>

              <Command.Item
                className="cmd-item"
                onSelect={() => runCommand(() => openModal('about'))}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HelpCircle size={13} />
                  <span>About HeightNet</span>
                </div>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};
