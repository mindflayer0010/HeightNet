import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, FileCheck2, UploadCloud } from 'lucide-react';
import {
  artifactUrl,
  evaluateReference,
  uploadReference,
  waitForJob,
  type EvaluationReport,
  type JobResponse,
} from '../../integration/api';
import { useAppStore } from '../../state/appStore';
import { useProjectStore } from '../../state/projectStore';

type ReferenceKind = 'raster' | 'gcp';
type ValidationState = 'idle' | 'uploading' | 'running' | 'complete' | 'error';

interface UploadedReference {
  path: string;
  filename: string;
  kind: ReferenceKind;
}

const metric = (value: number | null | undefined, suffix = ' m') =>
  value === null || value === undefined || !Number.isFinite(value) ? 'n/a' : `${value.toFixed(2)}${suffix}`;

/**
 * Small, self-contained validation control for the generated DSM.
 * The prediction is always the current project DSM. The uploaded file is
 * used only as an evaluation reference and is never fed back into inference.
 */
export const ValidationPanel: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dsmPath = useProjectStore((state) => state.project.rawOutputPaths.dsm);
  const notify = useAppStore((state) => state.notify);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReferenceKind>('raster');
  const [state, setState] = useState<ValidationState>('idle');
  const [message, setMessage] = useState('Upload a reference to check the current DSM.');
  const [uploaded, setUploaded] = useState<UploadedReference | null>(null);
  const [report, setReport] = useState<EvaluationReport | null>(null);

  useEffect(() => {
    setUploaded(null);
    setReport(null);
    setState('idle');
    setMessage(dsmPath ? 'Upload a reference to check the current DSM.' : 'Generate a DSM first.');
  }, [dsmPath]);

  const handleReferenceChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setState('uploading');
    setReport(null);
    setMessage('Uploading reference...');
    try {
      const result = await uploadReference(file);
      const uploadedKind: ReferenceKind = result.reference.kind === 'gcp_csv' ? 'gcp' : 'raster';
      setKind(uploadedKind);
      setUploaded({ path: result.path, filename: result.filename, kind: uploadedKind });
      setState('idle');
      setMessage(uploadedKind === 'gcp' ? 'GCP file ready. Run the holdout check.' : 'Reference raster ready. Run the comparison.');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Reference upload failed.';
      setState('error');
      setMessage(nextMessage);
      notify(nextMessage, 'warning');
    } finally {
      event.target.value = '';
    }
  };

  const runValidation = async () => {
    if (!dsmPath || !uploaded) return;
    setState('running');
    setReport(null);
    setMessage('Comparing the generated DSM with the reference...');
    try {
      const started = await evaluateReference(
        dsmPath,
        uploaded.kind === 'raster' ? uploaded.path : null,
        uploaded.kind === 'gcp' ? uploaded.path : null,
      );
      const finished = await waitForJob<EvaluationReport>(started.id, (job: JobResponse<EvaluationReport>) => {
        setMessage(job.message);
      });
      if (finished.status === 'failed') throw new Error(finished.message);
      setReport(finished.result);
      setState('complete');
      setMessage('Validation report ready.');
      notify('DSM validation complete', 'success');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Validation failed.';
      setState('error');
      setMessage(nextMessage);
      notify(nextMessage, 'warning');
    }
  };

  const metrics = report?.raster_metrics ?? report?.gcp_raw_metrics;
  const holdout = report?.gcp_calibration?.holdout_metrics;
  const changeKind = (nextKind: ReferenceKind) => {
    setKind(nextKind);
    setUploaded(null);
    setReport(null);
    setState('idle');
    setMessage(dsmPath ? 'Choose a reference file.' : 'Generate a DSM first.');
  };

  return (
    <div className="rollout-section validation-panel">
      <div className="rollout-header" onClick={() => setOpen((value) => !value)}>
        <div className="rollout-title">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <FileCheck2 size={12} />
          <span>Validate this DSM</span>
        </div>
        {report ? <CheckCircle2 size={13} className="validation-ok" /> : null}
      </div>

      {open && (
        <div className="rollout-body validation-body">
          <span className="validation-copy">
            Compare the current DSM with a reference raster or surveyed points. The reference is used only for checking accuracy.
          </span>

          <div className="desktop-segmented validation-kind-switch" role="tablist" aria-label="Reference type">
            <button className={`desktop-segmented-btn ${kind === 'raster' ? 'active' : ''}`} onClick={() => changeKind('raster')}>
              LiDAR / DSM raster
            </button>
            <button className={`desktop-segmented-btn ${kind === 'gcp' ? 'active' : ''}`} onClick={() => changeKind('gcp')}>
              Surveyed GCP CSV
            </button>
          </div>

          <input ref={inputRef} type="file" hidden accept={kind === 'gcp' ? '.csv' : '.tif,.tiff'} onChange={handleReferenceChange} />
          <button className="desktop-action-btn validation-upload" onClick={() => inputRef.current?.click()} disabled={!dsmPath || state === 'uploading' || state === 'running'}>
            <UploadCloud size={12} />
            {uploaded ? 'Replace reference file' : 'Choose reference file'}
          </button>

          {uploaded ? <div className="validation-file">{uploaded.filename}</div> : null}
          {!dsmPath ? <div className="validation-note">Generate a georeferenced DSM before validating.</div> : null}
          {kind === 'gcp' && !uploaded ? <div className="validation-note">CSV columns: x, y, reference_m in the prediction CRS.</div> : null}

          <button className="desktop-action-btn active validation-run" onClick={() => void runValidation()} disabled={!dsmPath || !uploaded || state === 'uploading' || state === 'running'}>
            {state === 'running' ? 'Checking...' : 'Run validation'}
          </button>
          <div className={`validation-status ${state === 'error' ? 'error' : ''}`}>{message}</div>

          {report && metrics ? (
            <div className="validation-results">
              <strong>{holdout ? 'GCP holdout result' : 'Reference comparison'}</strong>
              <div className="validation-metrics">
                <span><small>MAE</small>{metric(holdout?.mae_m ?? metrics.mae_m)}</span>
                <span><small>RMSE</small>{metric(holdout?.rmse_m ?? metrics.rmse_m)}</span>
                <span><small>Bias</small>{metric(holdout?.bias_m ?? metrics.bias_m)}</span>
                <span><small>Correlation</small>{metric(holdout?.correlation ?? metrics.correlation, '')}</span>
              </div>
              <div className="validation-samples">
                Samples: {holdout?.sample_count ?? metrics.sample_count}
                {holdout ? ` holdout of ${report.gcp_calibration?.holdout_count ?? '?'}` : ''}
              </div>
              {report.report_path ? (
                <a className="validation-report-link" href={artifactUrl(report.report_path) ?? undefined} target="_blank" rel="noreferrer">
                  Open validation report
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
