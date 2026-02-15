import { useMemo } from 'react';
import { Pause, Play, X } from 'lucide-react';

import { useProjects, useQueueJobs, useSessionCost } from '../hooks/useStudioData';
import { IconButton, MutedText, PageHeader, StatusText } from '../ui';

function formatStatus(status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'): string {
  switch (status) {
    case 'pending':
      return 'wartend';
    case 'running':
      return 'läuft';
    case 'completed':
      return 'abgeschlossen';
    case 'failed':
      return 'fehlgeschlagen';
    case 'cancelled':
      return 'abgebrochen';
    default:
      return status;
  }
}

export function QueueView() {
  const { data: jobs } = useQueueJobs();
  const { data: projects } = useProjects();
  const { data: sessionCost } = useSessionCost();
  const projectById = useMemo(() => {
    const entries = projects?.map((project) => [project.id, project.name] as const) ?? [];
    return new Map(entries);
  }, [projects]);

  const pending = jobs?.filter((job) => job.status === 'pending').length ?? 0;
  const running = jobs?.filter((job) => job.status === 'running').length ?? 0;
  const failed = jobs?.filter((job) => job.status === 'failed').length ?? 0;

  return (
    <section className="grid gap-3">
      <PageHeader
        className="flex-wrap"
        title="Warteschlange"
        actions={
          <div className="flex gap-1.5 font-mono text-sm text-fg-secondary max-900:flex-wrap">
            <span>Wartend: {pending}</span>
            <span>Laufend: {running}</span>
            <span>Fehlgeschlagen: {failed}</span>
            <span>Sitzungskosten: ${(sessionCost ?? 0).toFixed(3)}</span>
          </div>
        }
      />

      <div className="flex gap-1.25">
        <IconButton
          icon={<Pause size={15} />}
          label="Pausieren"
          className="gap-1"
          onClick={() => void window.studio.pauseQueue()}
        >
          <span>Pausieren</span>
        </IconButton>
        <IconButton
          icon={<Play size={15} />}
          label="Fortsetzen"
          className="gap-1"
          onClick={() => void window.studio.resumeQueue()}
        >
          <span>Fortsetzen</span>
        </IconButton>
      </div>

      <div className="grid gap-1.5">
        {jobs?.length ? null : <MutedText>Noch keine Aufträge in der Warteschlange.</MutedText>}
        {jobs?.map((job) => (
          <article
            key={job.id}
            className="flex items-start justify-between gap-2 rounded-md border border-border-token bg-surface-primary p-2 shadow-sm"
          >
            <div>
              <h3 className="mb-1 text-base">{job.request.prompt}</h3>
              <p className="text-sm">
                {job.request.model} | {job.request.resolution ?? '1K'} | {job.request.aspectRatio ?? '1:1'}
              </p>
              <MutedText>Projekt: {projectById.get(job.request.projectId ?? '') ?? 'Nicht zugewiesen'}</MutedText>
              <MutedText>Status: {formatStatus(job.status)}</MutedText>
              {job.error ? <StatusText tone="error">{job.error}</StatusText> : null}
            </div>
            {job.status === 'pending' ? (
              <IconButton
                icon={<X size={15} />}
                label="Auftrag abbrechen"
                onClick={() => void window.studio.cancelQueueJob(job.id)}
              >
                <span>Abbrechen</span>
              </IconButton>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
