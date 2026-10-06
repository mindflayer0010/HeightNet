import { useEffect } from 'react';
import { AppShell } from './components/shell/AppShell';
import { useAppStore } from './state/appStore';
import { getJob } from './integration/api';
import { useProjectStore } from './state/projectStore';

export function App() {
  const setCurrentScreen = useAppStore((state) => state.setCurrentScreen);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const notify = useAppStore((state) => state.notify);
  const setLiveResult = useProjectStore((state) => state.setLiveResult);
  const hydrateProject = useProjectStore((state) => state.hydrateProject);

  useEffect(() => {
    hydrateProject();
    if (useProjectStore.getState().project?.has3DReady) {
      setActiveView('3D');
    }
  }, [hydrateProject, setActiveView]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname.startsWith('/viewer/3d')) {
        setActiveView('3D');
      }
      setCurrentScreen('workspace');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setCurrentScreen, setActiveView]);

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get('job');
    if (!jobId) return;

    let cancelled = false;
    void getJob(jobId)
      .then((job) => {
        if (cancelled) return;
        if (job.status === 'complete' && job.result) {
          setLiveResult(job.result, null);
          setActiveView('3D');
          notify('Map job loaded into the HeightNet workspace', 'success');
        } else if (job.status === 'failed') {
          notify(`Map job failed: ${job.message}`, 'warning');
        } else {
          notify('That map job is still running. Open it again when it finishes.', 'info');
        }
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch((error) => {
        if (!cancelled) notify(error instanceof Error ? error.message : 'Could not load map job', 'warning');
      });

    return () => {
      cancelled = true;
    };
  }, [notify, setActiveView, setLiveResult]);

  return <AppShell />;
}

export default App;
