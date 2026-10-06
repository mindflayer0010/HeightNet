import React from 'react';
import { CalendarDays, CheckCircle2, Download, ExternalLink, FileUp, LoaderCircle, MapPinned, Search, Satellite, X } from 'lucide-react';
import { useAppStore } from '../../state/appStore';
import { API_BASE, artifactUrl, openInQgis } from '../../integration/api';
import { useMapStore } from '../../state/mapStore';

export const MapInspector: React.FC = () => {
  const setActiveView = useAppStore((state) => state.setActiveView);
  const {
    searchQuery,
    searchResults,
    searchMessage,
    selectedBbox,
    selectionMessage,
    selectionMode,
    cloudCover,
    dateFrom,
    dateTo,
    scenes,
    selectedScene,
    selectedScenes,
    imagery,
    referenceAvailability,
    referenceAvailabilityStatus,
    status,
    statusMessage,
    result,
    setSearchQuery,
    search,
    focusPlace,
    setSelectionMode,
    clearSelection,
    setCloudCover,
    setDateFrom,
    setDateTo,
    searchScenes,
    selectScene,
    toggleSceneSelection,
    download,
    buildTerrain,
    buildTemporal,
  } = useMapStore();
  const notify = useAppStore((state) => state.notify);
  const [openingQgis, setOpeningQgis] = React.useState(false);
  const [qgisProjectUrl, setQgisProjectUrl] = React.useState<string | null>(null);

  const busy = status === 'searching' || status === 'downloading' || status === 'running';
  const statusLabel = status === 'searching'
    ? 'Searching'
    : status === 'downloading'
      ? 'Getting satellite image'
      : status === 'running'
        ? 'Building terrain'
        : status === 'complete'
          ? 'Terrain ready'
          : status === 'error'
            ? 'Build needs attention'
            : 'Waiting for an area';
  const startLocalUpload = () => {
    setActiveView('2D');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('heightnet:open-upload')), 0);
  };

  const formatCaptureDate = (value: string | null) => {
    if (!value) return 'Unknown date';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
  };

  const toDateInput = (value: Date) => value.toISOString().slice(0, 10);
  const searchRelativeRange = (days: number | null) => {
    if (days === null) {
      setDateFrom('');
      setDateTo('');
    } else {
      const end = new Date();
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - days);
      setDateFrom(toDateInput(start));
      setDateTo(toDateInput(end));
    }
    window.setTimeout(() => void searchScenes(), 0);
  };

  const openCurrentResultInQgis = async () => {
    if (!result) return;
    const candidates = [
      { path: result.input ?? imagery?.file, label: 'RGB input', visible: true, opacity: 1 },
      { path: result.dsm, label: 'Estimated DSM', visible: true, opacity: 0.55 },
      { path: result.agl, label: 'Predicted AGL', visible: false, opacity: 0.75 },
      { path: result.relative, label: 'Relative depth', visible: false, opacity: 0.75 },
      { path: result.confidence, label: 'Calibration confidence', visible: false, opacity: 0.7 },
      { path: result.uncertainty, label: 'Calibration uncertainty', visible: false, opacity: 0.7 },
      { path: result.scene_risk, label: 'Scene risk flags', visible: false, opacity: 0.65 },
    ].filter((layer): layer is { path: string; label: string; visible: boolean; opacity: number } => Boolean(layer.path));
    setOpeningQgis(true);
    try {
      const opened = await openInQgis(candidates);
      setQgisProjectUrl(opened.project_url);
      notify(opened.qgis_launched ? 'QGIS opened with the result layers' : 'QGIS project created. Open it from the download link.', opened.qgis_launched ? 'success' : 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create the QGIS project', 'warning');
    } finally {
      setOpeningQgis(false);
    }
  };

  return (
    <div className="inspector-content map-inspector-content">
      <div className="map-inspector-intro">
        <strong>Select an area of interest</strong>
        <span>Search for a place, draw a rectangle, choose a real satellite capture, then build the terrain from that date.</span>
      </div>

      {selectedBbox ? (
        <details className="map-source-check" open={referenceAvailabilityStatus === 'ready'}>
          <summary>
            <span>Data sources for this area</span>
            <small>
              {referenceAvailabilityStatus === 'checking'
                ? 'checking'
                : referenceAvailability?.summary.reference_available
                  ? `${referenceAvailability.summary.reference_count} reference found`
                  : 'coarse ground ready'}
            </small>
          </summary>
          {referenceAvailabilityStatus === 'checking' ? (
            <div className="map-source-check-line muted">Checking local, Indian and public reference catalogs…</div>
          ) : referenceAvailabilityStatus === 'error' ? (
            <div className="map-source-check-line muted">Source check failed. You can still continue with the coarse DEM fallback.</div>
          ) : referenceAvailability ? (
            <div className="map-source-check-body">
              <div className="map-source-check-line"><span>Ground baseline</span><strong>Automatic fallback ready</strong></div>
              <div className="map-source-check-line"><span>Independent validation</span><strong className={referenceAvailability.summary.reference_available ? 'ready' : 'muted'}>{referenceAvailability.summary.reference_available ? 'Available' : 'Not found for this AOI'}</strong></div>
              <div className="map-source-check-line"><span>Surveyed GCPs</span><strong>Upload supported</strong></div>
              {referenceAvailability.sources.filter((source) => source.status === 'available').slice(0, 3).map((source) => (
                <div className="map-source-check-source" key={source.id}>{source.name}</div>
              ))}
              <div className="map-help-text">A coarse DEM helps create the metric estimate. Only LiDAR, a matching DSM or held-out GCPs produce independent accuracy metrics.</div>
            </div>
          ) : null}
        </details>
      ) : null}

      <div className="map-workflow-step">
        <div className="map-step-heading"><span>01</span><strong>Find a location</strong></div>
        <div className="map-search-row">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void search(); }}
            placeholder="Dehradun, London, Alps..."
            aria-label="Search for a place"
          />
          <button className="map-compact-button" onClick={() => void search()} disabled={status === 'searching'}>
            {status === 'searching' ? <LoaderCircle size={13} className="live-pipeline-spin" /> : <Search size={13} />}
            Search
          </button>
        </div>
        {searchMessage ? <div className="map-help-text">{searchMessage}</div> : null}
        {searchResults.length ? (
          <div className="map-search-results">
            {searchResults.slice(0, 5).map((place) => (
              <button className="map-place-result" key={`${place.lat}-${place.lon}-${place.display_name}`} onClick={() => focusPlace(place)}>
                <MapPinned size={12} />
                <span>{place.display_name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="map-workflow-step">
        <div className="map-step-heading"><span>02</span><strong>Draw a rectangular area</strong></div>
        <button className={`map-full-button ${selectionMode ? 'selected' : ''}`} onClick={() => setSelectionMode(!selectionMode)}>
          <MapPinned size={13} /> {selectionMode ? 'Drag on the map' : 'Select rectangular area'}
        </button>
        <button className="map-full-button secondary" onClick={clearSelection} disabled={!selectedBbox && !selectionMode}>
          <X size={13} /> Clear area
        </button>
        <div className="map-help-text">Keep the live rectangle roughly 10 km across or less so Sentinel-2 downloads and terrain builds stay manageable.</div>
        <div className="map-status-box">{selectionMessage}</div>
      </div>

      <div className="map-workflow-step">
        <div className="map-step-heading"><span>03</span><strong>Choose a satellite capture</strong></div>
        <div className="map-timeline-heading"><CalendarDays size={14} /><span>Capture timeline</span><small>newest first</small></div>
        <div className="map-date-row">
          <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
        <div className="map-timeline-presets">
          <button onClick={() => searchRelativeRange(null)} disabled={!selectedBbox || busy}>Latest</button>
          <button onClick={() => searchRelativeRange(7)} disabled={!selectedBbox || busy}>Past 7 days</button>
          <button onClick={() => searchRelativeRange(30)} disabled={!selectedBbox || busy}>Past 30 days</button>
        </div>
        <details className="map-advanced-options">
          <summary>Advanced: cloud limit</summary>
          <div className="map-cloud-row">
            <input id="map-cloud-cover" type="number" min="0" max="100" value={cloudCover} onChange={(event) => setCloudCover(Number(event.target.value))} aria-label="Maximum cloud cover" />
            <span>%</span>
          </div>
        </details>
        <button className="map-full-button primary" onClick={() => void searchScenes()} disabled={!selectedBbox || busy}>
          {status === 'searching' ? <LoaderCircle size={13} className="live-pipeline-spin" /> : <Satellite size={13} />}
          Find captures
        </button>
        {scenes.length ? (
          <div className="map-scene-list" aria-label="Sentinel-2 capture timeline">
            {scenes.map((scene) => (
              <div
                key={scene.scene_id}
                className={`map-scene-card ${selectedScene?.scene_id === scene.scene_id ? 'selected' : ''} ${selectedScenes.some((item) => item.scene_id === scene.scene_id) ? 'compare-selected' : ''}`}
                onClick={() => selectScene(scene)}
              >
                <label className="map-scene-compare-check" title="Add this capture to the comparison">
                  <input
                    type="checkbox"
                    checked={selectedScenes.some((item) => item.scene_id === scene.scene_id)}
                    onChange={() => toggleSceneSelection(scene)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Compare capture from ${formatCaptureDate(scene.capture_date)}`}
                  />
                  <span>Compare</span>
                </label>
                <span className="map-scene-card-main">
                  <strong>{formatCaptureDate(scene.capture_date)}</strong>
                  <small>{scene.scene_id}</small>
                </span>
                <span className="map-scene-card-meta">{scene.cloud_cover == null ? 'Cloud n/a' : `${Number(scene.cloud_cover).toFixed(1)}% cloud`}</span>
              </div>
            ))}
          </div>
        ) : null}
        {selectedScenes.length >= 2 ? (
          <div className="map-temporal-build">
            <div className="map-status-box map-selected-scene">
              <CalendarDays size={13} />
              <span><strong>{selectedScenes.length} dates selected</strong><br />The same AOI will be processed once for each selected capture.</span>
            </div>
            <button className="map-full-button primary" onClick={() => void buildTemporal()} disabled={busy}>
              <Satellite size={13} /> Build temporal comparison
            </button>
          </div>
        ) : null}
        {selectedScene ? (
          <div className="map-status-box map-selected-scene">
            <Satellite size={13} />
            <span><strong>Selected capture</strong><br />{formatCaptureDate(selectedScene.capture_date)} - {selectedScene.scene_id}</span>
          </div>
        ) : null}
      </div>

      <div className="map-workflow-step">
        <div className="map-step-heading"><span>04</span><strong>Download or build</strong></div>
        <div className="map-action-row">
          <button className="map-full-button secondary" onClick={() => void download()} disabled={!selectedScene || busy}>
            <Download size={13} /> Download RGB only
          </button>
          <button className="map-full-button primary" onClick={() => void buildTerrain()} disabled={!selectedScene || busy}>
            <Satellite size={13} /> Build selected terrain
          </button>
        </div>
        <div className={`map-status-box map-build-status ${status === 'error' ? 'error' : status === 'complete' ? 'success' : ''}`}>
          {busy ? <LoaderCircle size={13} className="live-pipeline-spin" /> : status === 'complete' ? <CheckCircle2 size={13} /> : null}
          <span><strong>{statusLabel}</strong><br />{statusMessage}</span>
        </div>
        {status === 'error' && selectedBbox ? (
          <button className="map-full-button primary" onClick={() => void buildTerrain()} disabled={busy}>
            Retry selected capture
          </button>
        ) : null}
        {imagery ? (
          <div className="map-status-box success">
            <CheckCircle2 size={13} />
            <span>{imagery.source.scene_id}<br />CRS: {imagery.crs ?? 'not available'}<br /><a href={artifactUrl(imagery.file) ?? '#'} target="_blank" rel="noreferrer">Open downloaded GeoTIFF</a></span>
          </div>
        ) : null}
        {result?.dsm ? (
          <div className="map-export-list">
            <strong><Download size={12} /> Exports</strong>
            <button className="map-qgis-button" onClick={() => void openCurrentResultInQgis()} disabled={openingQgis}>
              <ExternalLink size={12} /> {openingQgis ? 'Preparing QGIS project...' : 'Open all layers in QGIS'}
            </button>
            {qgisProjectUrl ? <a className="map-qgis-download" href={`${API_BASE}${qgisProjectUrl}`} download>Download QGIS project file</a> : null}
            {([
              ['dsm', 'DSM GeoTIFF'],
              ['agl', 'AGL GeoTIFF'],
              ['relative', 'Relative depth'],
              ['confidence', 'Confidence map'],
              ['texture', 'RGB texture'],
              ['mesh', 'Terrain OBJ'],
              ['source_manifest', 'Run provenance'],
            ] as const).map(([key, label]) => result[key] ? (
              <a key={key} href={artifactUrl(result[key]) ?? '#'} target="_blank" rel="noreferrer">{label}</a>
            ) : null)}
          </div>
        ) : null}
      </div>

      <div className="map-local-upload">
        <FileUp size={13} />
        <span>Already have an image?</span>
        <button onClick={startLocalUpload}>Upload PNG, JPG, or GeoTIFF</button>
      </div>
    </div>
  );
};
