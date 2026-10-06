import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/appStore';
import { useProjectStore } from '../../state/projectStore';
import { startPipeline, uploadInput, waitForJob } from '../../integration/api';

type UploadStatus = 'idle' | 'uploading' | 'running' | 'complete' | 'error';

/**
 * Global upload controller.
 *
 * Upload is a single action in the top bar. Keeping the file input and the
 * pipeline request here means Map, 2D, and 3D all use the same path. There is
 * deliberately no floating upload card covering the workspace.
 */
export const LivePipelinePanel: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [, setMessage] = useState('Choose an image to begin.');
  const notify = useAppStore((state) => state.notify);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setInput = useProjectStore((state) => state.setInputInfo);
  const setLiveResult = useProjectStore((state) => state.setLiveResult);

  useEffect(() => {
    const openUpload = () => {
      if (status !== 'uploading' && status !== 'running') inputRef.current?.click();
    };
    window.addEventListener('heightnet:open-upload', openUpload);
    return () => window.removeEventListener('heightnet:open-upload', openUpload);
  }, [status]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setMessage('Uploading and checking the image...');
    try {
      const uploaded = await uploadInput(file);
      setInput(uploaded.filename, uploaded.input);
      setStatus('running');
      setMessage('Running depth inference, calibration, DEM fusion, and mesh export...');

      const started = await startPipeline(uploaded.path);
      const finished = await waitForJob(started.id, (job) => setMessage(job.message));
      if (finished.status === 'failed') throw new Error(finished.message);

      setLiveResult(finished.result, null);
      setStatus('complete');
      setMessage('Terrain is ready.');
      setActiveView('3D');
      notify('Terrain generation complete', 'success');
    } catch (error) {
      setStatus('error');
      const message = error instanceof Error ? error.message : 'HeightNet pipeline failed.';
      setMessage(message);
      notify(message, 'warning');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept=".png,.jpg,.jpeg,.tif,.tiff"
      hidden
      onChange={handleUpload}
      aria-label="Upload a PNG, JPG, or GeoTIFF"
    />
  );
};
