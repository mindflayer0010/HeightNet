export interface InputInfo {
  kind: string;
  width: number;
  height: number;
  crs: string | null;
}

export interface PipelineResult {
  input?: string;
  relative?: string;
  agl?: string;
  dsm?: string;
  uncertainty?: string;
  confidence?: string;
  scene_risk?: string;
  scene_quality?: string;
  source_manifest?: string;
  metadata?: string;
  mesh?: string;
  material?: string;
  texture?: string;
  mesh_metadata?: string;
  mesh_rgb?: string;
  mesh_warning?: string;
  stats?: Record<string, RasterStats>;
}

export interface QgisLayerSpec {
  path: string;
  label: string;
  visible?: boolean;
  opacity?: number;
}

export interface QgisOpenResponse {
  project_path: string;
  project_url: string;
  layers: Array<{ label: string; visible: boolean; opacity: number }>;
  qgis_found: boolean;
  qgis_launched: boolean;
  message: string;
}

export interface RasterStats {
  path: string;
  shape: [number, number];
  count: number;
  dtype: string;
  crs: string | null;
  valid_fraction: number;
  min: number;
  p01: number;
  median: number;
  p99: number;
  max: number;
  mean: number;
  std: number;
}

export interface InspectionResult {
  row: number;
  column: number;
  value_m: number;
  slope_degrees: number | null;
  map_x: number;
  map_y: number;
  crs: string | null;
}

export interface ProfileSample {
  distance_m: number;
  column: number;
  row: number;
  value_m: number | null;
  map_x: number;
  map_y: number;
}

export interface ProfileResult {
  path: string;
  crs: string | null;
  distance_m: number;
  samples: ProfileSample[];
  min_m: number | null;
  max_m: number | null;
}

export interface ExportBundleResult {
  path: string;
  url: string;
  filename: string;
  files: string[];
}

export interface EvaluationReport {
  prediction: string;
  report_path?: string;
  raster_metrics?: {
    sample_count: number;
    mae_m: number;
    rmse_m: number;
    bias_m: number;
    correlation: number | null;
    r2: number | null;
  };
  gcp_raw_metrics?: EvaluationReport['raster_metrics'];
  gcp_calibration?: {
    calibration_metrics: NonNullable<EvaluationReport['raster_metrics']>;
    holdout_metrics: NonNullable<EvaluationReport['raster_metrics']>;
    calibration_count: number;
    holdout_count: number;
  };
}

export interface JobResponse<T = PipelineResult> {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | string;
  message: string;
  result: T;
}

export interface GeocodePlace {
  display_name: string;
  lat: number;
  lon: number;
  type?: string;
}

export interface SentinelScene {
  scene_id: string;
  capture_date: string | null;
  cloud_cover: number | null;
  platform?: string | null;
  bbox?: number[] | null;
  item_url?: string;
  rgb_assets?: string[];
  feature: Record<string, unknown>;
}

export interface AcquiredImagery {
  success: boolean;
  bbox: [number, number, number, number];
  crs: string | null;
  resolution_m: number;
  filename: string;
  download_url: string;
  file: string;
  visual_file?: string | null;
  dimensions?: [number, number];
  valid_fraction?: number;
  source: {
    collection: string;
    scene_id: string;
    acquisition_date: string;
    cloud_cover: number | null;
  };
}

export interface SourceRecord {
  id: string;
  name: string;
  role: 'optical_input' | 'coarse_ground' | 'validation_reference' | 'calibration_reference' | string;
  status: 'available' | 'downloadable' | 'catalog_match' | 'request_required' | 'manual_upload' | 'unavailable' | string;
  access: string;
  provider: string;
  detail: string;
  url?: string | null;
  path?: string | null;
  resolution_m?: number | null;
  coverage?: boolean | null;
}

export interface SourceAvailability {
  bbox: [number, number, number, number];
  sources: SourceRecord[];
  summary: {
    reference_available: boolean;
    reference_count: number;
    independent_validation_possible: boolean;
    gcp_upload_supported: boolean;
    coarse_ground_fallback: boolean;
  };
  rules: {
    reference_not_used_as_prediction_input_by_default: boolean;
    coarse_dem_is_not_lidar_truth: boolean;
    no_reference_means_metrics_are_not_reported: boolean;
  };
}

export const API_BASE = window.location.origin.startsWith('http')
  ? window.location.origin
  : 'http://127.0.0.1:8000';

export function artifactUrl(path: string | undefined): string | null {
  if (!path) return null;
  return `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
}

export function rasterPreviewUrl(path: string | null | undefined, palette = 'elevation'): string | null {
  if (!path) return null;
  return `${API_BASE}/api/raster-preview?path=${encodeURIComponent(path)}&palette=${encodeURIComponent(palette)}`;
}

export function viewerUrl(result: PipelineResult): string | null {
  if (!result.mesh) return null;
  const params = new URLSearchParams({
    obj: artifactUrl(result.mesh) ?? '',
    mtl: artifactUrl(result.material) ?? '',
    texture: artifactUrl(result.texture) ?? '',
    metadata: artifactUrl(result.mesh_metadata) ?? '',
  });
  return `${API_BASE}/viewer/?${params.toString()}`;
}

export async function uploadReference(file: File): Promise<{ path: string; filename: string; reference: { kind: string } }> {
  const response = await fetch(`${API_BASE}/api/upload-reference`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Filename': file.name,
    },
    body: file,
  });
  return readJson(response);
}

export async function inspectRaster(
  path: string,
  x: number,
  y: number,
): Promise<InspectionResult> {
  const query = new URLSearchParams({ path, x: String(x), y: String(y), mode: 'pixel' });
  const response = await fetch(`${API_BASE}/api/inspect?${query.toString()}`);
  return readJson(response);
}

export async function getRasterStats(path: string): Promise<RasterStats> {
  const query = new URLSearchParams({ path });
  const response = await fetch(`${API_BASE}/api/raster-stats?${query.toString()}`);
  return readJson(response);
}

export async function getReferenceAvailability(
  bbox: [number, number, number, number],
  options: { remoteCatalog?: boolean } = {},
): Promise<SourceAvailability> {
  const query = new URLSearchParams({
    bbox: bbox.join(','),
    remote: options.remoteCatalog === false ? '0' : '1',
  });
  const response = await fetch(`${API_BASE}/api/reference-availability?${query.toString()}`);
  return readJson(response);
}

export async function profileRaster(
  path: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  samples = 64,
): Promise<ProfileResult> {
  const query = new URLSearchParams({
    path,
    start_x: String(start.x),
    start_y: String(start.y),
    end_x: String(end.x),
    end_y: String(end.y),
    samples: String(samples),
  });
  const response = await fetch(`${API_BASE}/api/profile?${query.toString()}`);
  return readJson(response);
}

export async function createExportBundle(
  files: Array<{ path: string; name: string }>,
): Promise<ExportBundleResult> {
  const response = await fetch(`${API_BASE}/api/export-bundle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  return readJson(response);
}

export async function evaluateReference(
  predictionPath: string,
  referencePath: string | null,
  gcpPath: string | null,
): Promise<JobResponse<EvaluationReport>> {
  const response = await fetch(`${API_BASE}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prediction_path: predictionPath,
      reference_path: referencePath,
      gcp_csv: gcpPath,
    }),
  });
  return readJson(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload && typeof payload === 'object' && 'error' in payload)) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String(payload.error)
      : `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function uploadInput(file: File): Promise<{ path: string; filename: string; input: InputInfo }> {
  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Filename': file.name,
    },
    body: file,
  });
  return readJson(response);
}

export async function startPipeline(inputPath: string, texturePath?: string | null): Promise<JobResponse<PipelineResult>> {
  const response = await fetch(`${API_BASE}/api/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_path: inputPath, texture_path: texturePath ?? null }),
  });
  return readJson(response);
}

export async function openInQgis(layers: QgisLayerSpec[]): Promise<QgisOpenResponse> {
  const response = await fetch(`${API_BASE}/api/open-qgis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layers }),
  });
  return readJson(response);
}

export async function geocodePlace(query: string): Promise<{ results: GeocodePlace[] }> {
  const response = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(query)}`);
  return readJson(response);
}

export async function acquireSentinelImagery(
  bbox: [number, number, number, number],
  maxCloudCover: number,
  scene?: SentinelScene | null,
): Promise<AcquiredImagery> {
  const response = await fetch(`${API_BASE}/api/imagery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bbox, format: 'geotiff', max_cloud_cover: maxCloudCover, scene: scene ?? undefined }),
  });
  return readJson(response);
}

export async function searchSentinelScenes(
  bbox: [number, number, number, number],
  maxCloudCover: number,
  dateFrom: string,
  dateTo: string,
  limit = 20,
): Promise<{ bbox: [number, number, number, number]; scenes: SentinelScene[] }> {
  const query = new URLSearchParams({
    bbox: bbox.join(','),
    cloud: String(maxCloudCover),
    limit: String(limit),
  });
  if (dateFrom) query.set('from', dateFrom);
  if (dateTo) query.set('to', dateTo);
  const response = await fetch(`${API_BASE}/api/scenes?${query.toString()}`);
  return readJson(response);
}

export async function getJob<T = PipelineResult>(jobId: string): Promise<JobResponse<T>> {
  const response = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`);
  return readJson(response);
}

export async function waitForJob<T = PipelineResult>(
  jobId: string,
  onUpdate: (job: JobResponse<T>) => void,
): Promise<JobResponse<T>> {
  for (;;) {
    const job = await getJob<T>(jobId);
    onUpdate(job);
    if (job.status === 'complete' || job.status === 'failed') return job;
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
}
