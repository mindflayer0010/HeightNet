import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bookmark,
  Box,
  Check,
  Download,
  FileArchive,
  History,
  Link2,
  MousePointer2,
  Ruler,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { artifactUrl, createExportBundle, getRasterStats, openInQgis, profileRaster, type ExportBundleResult, type RasterStats } from '../../integration/api';
import { useProjectStore } from '../../state/projectStore';
import { useUtilitiesStore, type UtilityTab, type ViewBookmark } from '../../state/utilitiesStore';
import { useViewportStore } from '../../state/viewportStore';
import { useWorkspaceStore } from '../../state/workspaceStore';

const tabs: Array<{ id: UtilityTab; label: string; icon: React.ReactNode }> = [
  { id: 'analyze', label: 'Analyze', icon: <Activity size={13} /> },
  { id: 'compare', label: 'Compare', icon: <Link2 size={13} /> },
  { id: 'quality', label: 'Quality', icon: <ShieldCheck size={13} /> },
  { id: 'export', label: 'Export', icon: <Download size={13} /> },
  { id: 'history', label: 'History', icon: <History size={13} /> },
];

function formatNumber(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function fileName(path: string | null): string {
  if (!path) return 'Not available';
  return path.split(/[\\/]/).pop() ?? path;
}

function bookmarkLabel(bookmark: ViewBookmark): string {
  return `${bookmark.name} · ${new Date(bookmark.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export const UtilitiesDrawer: React.FC = () => {
  const project = useProjectStore((state) => state.project);
  const {
    open,
    tab,
    analysisMode,
    profilePoints,
    profile,
    profileLoading,
    profileError,
    probe,
    bookmarks,
    history,
    setOpen,
    setTab,
    setAnalysisMode,
    clearProfile,
    setProfile,
    setProfileLoading,
    setProfileError,
    saveBookmark,
    removeBookmark,
    addHistory,
    clearHistory,
  } = useUtilitiesStore();
  const { layout, syncCameras, setLayout, setSyncCameras } = useWorkspaceStore();
  const viewport2D = useViewportStore((state) => state.viewport2D);
  const viewport3D = useViewportStore((state) => state.viewport3D);
  const setZoom2D = useViewportStore((state) => state.setZoom2D);
  const setPan2D = useViewportStore((state) => state.setPan2D);
  const setRotation2D = useViewportStore((state) => state.setRotation2D);
  const setCameraMode3D = useViewportStore((state) => state.setCameraMode3D);
  const setCameraFov3D = useViewportStore((state) => state.setCameraFov3D);
  const setCameraSpeed3D = useViewportStore((state) => state.setCameraSpeed3D);
  const setVerticalExaggeration3D = useViewportStore((state) => state.setVerticalExaggeration3D);
  const setMaterialMode3D = useViewportStore((state) => state.setMaterialMode3D);
  const resetCamera3D = useViewportStore((state) => state.resetCamera3D);
  const [bundle, setBundle] = useState<ExportBundleResult | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [qgisBusy, setQgisBusy] = useState(false);
  const [qgisMessage, setQgisMessage] = useState<string | null>(null);
  const [qualityStats, setQualityStats] = useState<Record<string, RasterStats | null>>({});
  const [qualityLoading, setQualityLoading] = useState(false);
  const lastHistoryKey = useRef<string | null>(null);

  const dsmPath = project.rawOutputPaths.dsm;
  const outputFiles = useMemo(() => [
    { path: project.rawOutputPaths.input, name: 'input-rgb.tif' },
    { path: project.rawOutputPaths.relative, name: 'relative-depth.tif' },
    { path: project.rawOutputPaths.agl, name: 'predicted-agl.tif' },
    { path: project.rawOutputPaths.dsm, name: 'estimated-dsm.tif' },
    { path: project.rawOutputPaths.confidence, name: 'calibration-confidence.tif' },
    { path: project.rawOutputPaths.uncertainty, name: 'calibration-uncertainty.tif' },
    { path: project.rawOutputPaths.sceneRisk, name: 'scene-risk.tif' },
  ].filter((item): item is { path: string; name: string } => Boolean(item.path)), [project.rawOutputPaths]);

  useEffect(() => {
    if (!dsmPath || profilePoints.length !== 2 || analysisMode !== 'profile') return;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    profileRaster(dsmPath, profilePoints[0], profilePoints[1], 72)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch((error) => { if (!cancelled) setProfileError(error instanceof Error ? error.message : 'Profile could not be loaded.'); })
      .finally(() => { if (!cancelled) setProfileLoading(false); });
    return () => { cancelled = true; };
  }, [analysisMode, dsmPath, profilePoints, setProfile, setProfileError, setProfileLoading]);

  useEffect(() => {
    if (!project.has3DReady || !project.metadata.updated) return;
    const key = `${project.metadata.updated}:${project.rawOutputPaths.dsm ?? ''}`;
    if (lastHistoryKey.current === key) return;
    lastHistoryKey.current = key;
    addHistory({
      name: project.metadata.name,
      crs: project.metadata.crs,
      dimensions: `${project.metadata.dimensions.width} × ${project.metadata.dimensions.height}`,
      outputs: outputFiles.length,
    });
  }, [addHistory, outputFiles.length, project.has3DReady, project.metadata.crs, project.metadata.dimensions.height, project.metadata.dimensions.width, project.metadata.name, project.metadata.updated, project.rawOutputPaths.dsm]);

  useEffect(() => {
    if (!open || tab !== 'quality') return;
    const targets = [
      ['confidence', project.rawOutputPaths.confidence],
      ['uncertainty', project.rawOutputPaths.uncertainty],
      ['sceneRisk', project.rawOutputPaths.sceneRisk],
    ] as const;
    const available = targets.filter(([, path]) => path);
    if (!available.length) {
      setQualityStats({});
      return;
    }
    let cancelled = false;
    setQualityLoading(true);
    Promise.all(available.map(async ([key, path]) => [key, await getRasterStats(path as string)] as const))
      .then((entries) => { if (!cancelled) setQualityStats(Object.fromEntries(entries)); })
      .catch(() => { if (!cancelled) setQualityStats({}); })
      .finally(() => { if (!cancelled) setQualityLoading(false); });
    return () => { cancelled = true; };
  }, [open, project.rawOutputPaths.confidence, project.rawOutputPaths.sceneRisk, project.rawOutputPaths.uncertainty, tab]);

  const saveCurrentView = () => {
    saveBookmark({
      name: `View ${bookmarks.length + 1}`,
      viewport2D: { zoom: viewport2D.zoom, panX: viewport2D.panX, panY: viewport2D.panY, rotation: viewport2D.rotation },
      viewport3D: {
        cameraMode: viewport3D.cameraMode,
        cameraFov: viewport3D.cameraFov,
        cameraSpeed: viewport3D.cameraSpeed,
        verticalExaggeration: viewport3D.verticalExaggeration,
        materialMode: viewport3D.materialMode,
      },
    });
  };

  const restoreBookmark = (bookmark: ViewBookmark) => {
    setZoom2D(bookmark.viewport2D.zoom);
    setPan2D(bookmark.viewport2D.panX, bookmark.viewport2D.panY);
    setRotation2D(bookmark.viewport2D.rotation);
    setCameraMode3D(bookmark.viewport3D.cameraMode);
    setCameraFov3D(bookmark.viewport3D.cameraFov);
    setCameraSpeed3D(bookmark.viewport3D.cameraSpeed);
    setVerticalExaggeration3D(bookmark.viewport3D.verticalExaggeration);
    setMaterialMode3D(bookmark.viewport3D.materialMode);
    resetCamera3D();
  };

  const downloadBundle = async () => {
    if (!outputFiles.length) return;
    setBundleLoading(true);
    setBundleError(null);
    try {
      setBundle(await createExportBundle(outputFiles));
    } catch (error) {
      setBundleError(error instanceof Error ? error.message : 'The export bundle could not be created.');
    } finally {
      setBundleLoading(false);
    }
  };

  const openAllLayersInQgis = async () => {
    const layers = [
      { path: project.rawOutputPaths.input, label: 'RGB input', visible: true, opacity: 1 },
      { path: project.rawOutputPaths.dsm, label: 'Estimated DSM', visible: false, opacity: 0.75 },
      { path: project.rawOutputPaths.agl, label: 'Predicted AGL', visible: false, opacity: 0.75 },
      { path: project.rawOutputPaths.relative, label: 'Relative depth', visible: false, opacity: 0.75 },
      { path: project.rawOutputPaths.confidence, label: 'Calibration confidence', visible: false, opacity: 0.75 },
    ].filter((layer): layer is { path: string; label: string; visible: boolean; opacity: number } => Boolean(layer.path));
    if (!layers.length) return;
    setQgisBusy(true);
    setQgisMessage(null);
    try {
      const result = await openInQgis(layers);
      setQgisMessage(result.message);
    } catch (error) {
      setQgisMessage(error instanceof Error ? error.message : 'QGIS project could not be prepared.');
    } finally {
      setQgisBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="utilities-overlay" role="dialog" aria-modal="true" aria-label="HeightNet utilities">
      <button className="utilities-backdrop" aria-label="Close utilities" onClick={() => setOpen(false)} />
      <aside className="utilities-drawer">
        <header className="utilities-header">
          <div>
            <span className="utilities-kicker">WORKSPACE TOOLS</span>
            <h2>Utilities</h2>
            <p>Small tools for checking, comparing, and saving this run.</p>
          </div>
          <button className="utilities-close" onClick={() => setOpen(false)} aria-label="Close utilities"><X size={16} /></button>
        </header>

        <nav className="utilities-tabs" aria-label="Utility sections">
          {tabs.map((item) => (
            <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="utilities-body">
          {tab === 'analyze' ? (
            <>
              <section className="utility-card utility-card-primary">
                <div className="utility-card-heading"><MousePointer2 size={15} /><div><strong>Inspect a point</strong><span>Click the raster to read height and confidence.</span></div></div>
                <button className={`utility-action ${analysisMode === 'probe' ? 'selected' : ''}`} onClick={() => setAnalysisMode('probe')}>
                  {analysisMode === 'probe' ? <Check size={13} /> : <MousePointer2 size={13} />} Point probe
                </button>
                {probe ? (
                  <div className="utility-readout-grid">
                    <span>DSM</span><strong>{formatNumber(probe.elevation)} m</strong>
                    <span>AGL</span><strong>{formatNumber(probe.agl)} m</strong>
                    <span>Slope</span><strong>{formatNumber(probe.slopeDegrees)}°</strong>
                    <span>Confidence</span><strong>{formatNumber(probe.confidence, 3)}</strong>
                    <span>Uncertainty</span><strong>{formatNumber(probe.uncertainty)} m</strong>
                    <span>Pixel</span><strong>{probe.column}, {probe.row}</strong>
                  </div>
                ) : <p className="utility-empty-copy">No point selected yet.</p>}
              </section>

              <section className="utility-card">
                <div className="utility-card-heading"><Ruler size={15} /><div><strong>Elevation profile</strong><span>Draw a line on the raster with two clicks.</span></div></div>
                <button className={`utility-action ${analysisMode === 'profile' ? 'selected' : ''}`} onClick={() => setAnalysisMode('profile')}>
                  {analysisMode === 'profile' ? <Check size={13} /> : <Ruler size={13} />} {analysisMode === 'profile' ? 'Click two points on raster' : 'Start profile'}
                </button>
                {profilePoints.length > 0 ? <p className="utility-help">{profilePoints.length}/2 points selected.</p> : null}
                {profileLoading ? <p className="utility-help">Sampling DSM…</p> : null}
                {profileError ? <p className="utility-error">{profileError}</p> : null}
                {profile ? (
                  <div className="profile-chart" aria-label="Elevation profile chart">
                    {profile.samples.map((sample, index) => {
                      const value = sample.value_m ?? profile.min_m ?? 0;
                      const range = Math.max(0.01, (profile.max_m ?? 1) - (profile.min_m ?? 0));
                      return <span key={`${sample.column}-${sample.row}-${index}`} style={{ height: `${Math.max(5, ((value - (profile.min_m ?? 0)) / range) * 100)}%` }} title={`${formatNumber(value)} m`} />;
                    })}
                  </div>
                ) : null}
                {profile ? <p className="utility-help">{formatNumber(profile.distance_m)} m line · {formatNumber(profile.min_m)} to {formatNumber(profile.max_m)} m</p> : null}
                <button className="utility-text-button" onClick={clearProfile} disabled={!profilePoints.length && !profile}><Trash2 size={12} /> Clear profile</button>
              </section>

              <section className="utility-card">
                <div className="utility-card-heading"><Bookmark size={15} /><div><strong>Save this view</strong><span>Keep a camera and raster position for later.</span></div></div>
                <button className="utility-action" onClick={saveCurrentView}><Bookmark size={13} /> Save current view</button>
                {bookmarks.length ? <div className="utility-list">{bookmarks.slice(0, 4).map((bookmark) => <div className="utility-list-row" key={bookmark.id}><button onClick={() => restoreBookmark(bookmark)}>{bookmarkLabel(bookmark)}</button><button aria-label={`Delete ${bookmark.name}`} onClick={() => removeBookmark(bookmark.id)}><Trash2 size={12} /></button></div>)}</div> : null}
              </section>
            </>
          ) : null}

          {tab === 'compare' ? (
            <>
              <section className="utility-card utility-card-primary">
                <div className="utility-card-heading"><BarChart3 size={15} /><div><strong>Compare views</strong><span>Open the same run side by side without losing the current view.</span></div></div>
                <div className="utility-segmented">
                  {(['single', 'split-2', 'grid-4'] as const).map((value) => <button key={value} className={layout === value ? 'active' : ''} onClick={() => setLayout(value)}>{value === 'single' ? '1 view' : value === 'split-2' ? '2 views' : '4 views'}</button>)}
                </div>
                <label className="utility-toggle"><input type="checkbox" checked={syncCameras} onChange={(event) => setSyncCameras(event.target.checked)} /><span>Link 3D cameras</span><small>{syncCameras ? 'Orbit, fly, and zoom together' : 'Each 3D pane moves on its own'}</small></label>
              </section>
              <section className="utility-card">
                <div className="utility-card-heading"><Box size={15} /><div><strong>Useful pairings</strong><span>Use the pane selector in each header.</span></div></div>
                <div className="utility-pairing"><strong>Raster + Terrain</strong><span>See the image beside the 3D result.</span></div>
                <div className="utility-pairing"><strong>DSM + Confidence</strong><span>Compare the height surface with risky regions.</span></div>
                <div className="utility-pairing"><strong>Map + Raster</strong><span>Keep the source area beside its downloaded image.</span></div>
              </section>
            </>
          ) : null}

          {tab === 'quality' ? (
            <>
              <section className="utility-card utility-card-primary">
                <div className="utility-card-heading"><ShieldCheck size={15} /><div><strong>Scene quality</strong><span>These are checks for trust and interpretation, not a replacement for reference validation.</span></div></div>
                <div className="quality-summary"><strong>{project.metadata.crs === 'CRS not available' ? 'Relative result' : 'Georeferenced result'}</strong><span>{project.metadata.crs === 'CRS not available' ? 'No metric CRS was found. Use this as relative height.' : 'Metric output is available with CRS and DEM context.'}</span></div>
                {qualityLoading ? <p className="utility-help">Reading quality layers…</p> : null}
                {(['confidence', 'uncertainty', 'sceneRisk'] as const).map((key) => {
                  const stats = qualityStats[key];
                  const label = key === 'sceneRisk' ? 'Scene risk' : key === 'confidence' ? 'Calibration confidence' : 'Calibration uncertainty';
                  const path = project.rawOutputPaths[key];
                  return <div className="quality-row" key={key}><div><strong>{label}</strong><span>{path ? fileName(path) : 'Not generated for this run'}</span></div><b>{stats ? key === 'confidence' ? formatNumber(stats.median, 3) : `${formatNumber(stats.median)} m` : '—'}</b></div>;
                })}
              </section>
              <section className="utility-card">
                <div className="utility-card-heading"><Activity size={15} /><div><strong>Current result</strong><span>{project.metadata.dimensions.width} × {project.metadata.dimensions.height} px · {project.metadata.crs}</span></div></div>
                <div className="utility-readout-grid"><span>DSM range</span><strong>{formatNumber(project.metadata.elevationStats.min)}–{formatNumber(project.metadata.elevationStats.max)} m</strong><span>Mean</span><strong>{formatNumber(project.metadata.elevationStats.mean)} m</strong><span>Model</span><strong>{project.metadata.depthModel.name}</strong></div>
              </section>
            </>
          ) : null}

          {tab === 'export' ? (
            <>
              <section className="utility-card utility-card-primary">
                <div className="utility-card-heading"><FileArchive size={15} /><div><strong>Export this run</strong><span>Package the input, rasters, diagnostics, and scene metadata together.</span></div></div>
                <div className="utility-file-count">{outputFiles.length} files ready</div>
                <button className="utility-action" onClick={downloadBundle} disabled={bundleLoading || !outputFiles.length}><Download size={13} /> {bundleLoading ? 'Preparing bundle…' : 'Create download bundle'}</button>
                <button className="utility-action" onClick={openAllLayersInQgis} disabled={qgisBusy || !outputFiles.length}><Box size={13} /> {qgisBusy ? 'Preparing QGIS project…' : 'Open all layers in QGIS'}</button>
                {bundle ? <a className="utility-download" href={artifactUrl(bundle.path) ?? '#'} download={bundle.filename}><Download size={13} /> Download {bundle.filename}</a> : null}
                {bundleError ? <p className="utility-error">{bundleError}</p> : null}
                {qgisMessage ? <p className="utility-help">{qgisMessage}</p> : null}
              </section>
              <section className="utility-card">
                <div className="utility-card-heading"><Download size={15} /><div><strong>Individual files</strong><span>Use these when you only need one layer.</span></div></div>
                <div className="utility-file-list">{outputFiles.map((item) => <a key={item.name} href={artifactUrl(item.path) ?? '#'} download={item.name}><span>{item.name}</span><Download size={12} /></a>)}</div>
              </section>
            </>
          ) : null}

          {tab === 'history' ? (
            <section className="utility-card utility-card-primary">
              <div className="utility-card-heading"><History size={15} /><div><strong>Recent runs</strong><span>Short local history for this browser. Files stay where the server created them.</span></div></div>
              {!history.length ? <p className="utility-empty-copy">No completed runs recorded yet.</p> : <div className="utility-history-list">{history.map((entry) => <div className="utility-history-row" key={entry.id}><div><strong>{entry.name}</strong><span>{entry.dimensions} · {entry.crs}</span></div><small>{new Date(entry.createdAt).toLocaleString()}</small></div>)}</div>}
              {history.length ? <button className="utility-text-button" onClick={clearHistory}><Trash2 size={12} /> Clear local history</button> : null}
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
};
