import type { LucideIcon } from 'lucide-react';
import { BookText, Clock3, FolderKanban, Images, ListTodo, Play, PlusSquare, Settings2 } from 'lucide-react';

import { useProjects, useQueueJobs } from '../hooks/useStudioData';
import { type StudioView, useStudioStore } from '../state/useStudioStore';
import { Button, MutedText } from '../ui';

const PRIMARY_NAV_ITEMS: Array<{ view: StudioView; label: string; shortcut: string; icon: LucideIcon }> = [
  { view: 'gallery', label: 'Galerie', shortcut: 'Cmd+1', icon: Images },
  { view: 'create', label: 'Erstellen', shortcut: 'Cmd+N', icon: PlusSquare },
  { view: 'projects', label: 'Projekte', shortcut: 'Cmd+4', icon: FolderKanban },
  { view: 'prompts', label: 'Prompt-Bibliothek', shortcut: 'Cmd+3', icon: BookText },
  { view: 'queue', label: 'Warteschlange', shortcut: 'Cmd+2', icon: ListTodo }
];

export function Sidebar() {
  const activeView = useStudioStore((state) => state.activeView);
  const activeProjectId = useStudioStore((state) => state.activeProjectId);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const setActiveProjectId = useStudioStore((state) => state.setActiveProjectId);
  const setSelectedImageId = useStudioStore((state) => state.setSelectedImageId);
  const { data: projects } = useProjects();
  const { data: jobs } = useQueueJobs();

  const runningCount = jobs?.filter((job) => job.status === 'running').length ?? 0;
  const pendingCount = jobs?.filter((job) => job.status === 'pending').length ?? 0;
  const formatCost = (value: number) => `$${value.toFixed(3)}`;
  const activeProject = projects?.find((project) => project.id === activeProjectId) ?? null;

  return (
    <aside className="flex min-h-full flex-col gap-1.75 rounded-lg border border-border-token bg-surface-secondary p-2 shadow-sm backdrop-sat-108-blur-10">
      <section className="grid gap-1.1 rounded-md border border-border-light-token bg-surface-secondary p-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-004 text-fg-tertiary">
            Projektkontext
          </span>
          <Button
            variant="ghost"
            className="border-0 bg-transparent p-0 text-sm text-fg-secondary hover:bg-transparent hover:text-fg"
            onClick={() => {
              setActiveView('projects');
            }}
          >
            Verwalten
          </Button>
        </div>

        {projects?.length ? (
          <>
            <label className="grid gap-0.75" htmlFor="sidebar-project-select">
              <MutedText as="span" className="text-xs tracking-001">
                Aktives Projekt
              </MutedText>
              <select
                id="sidebar-project-select"
                value={activeProjectId ?? projects[0].id}
                onChange={(event) => {
                  setActiveProjectId(event.target.value);
                  setSelectedImageId(null);
                }}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            {activeProject ? (
              <div className="mt-0.75 grid grid-cols-2 gap-1.25">
                <span className="grid gap-0.6 rounded-md border border-border-light-token bg-btn-tertiary px-1.5 py-1">
                  <span className="text-xs text-fg-tertiary">Bilder</span>
                  <strong>{activeProject.imageCount}</strong>
                </span>
                <span className="grid gap-0.6 rounded-md border border-border-light-token bg-btn-tertiary px-1.5 py-1">
                  <span className="text-xs text-fg-tertiary">Kosten</span>
                  <strong className="font-mono text-sm text-fg">
                    {formatCost(activeProject.totalCost)}
                  </strong>
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <MutedText>Noch keine Projekte.</MutedText>
        )}
      </section>

      <nav className="mt-0.25 grid gap-1">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <Button
            variant="ghost"
            key={item.view}
            className={`w-full justify-between rounded-md border border-transparent px-1.5 py-1.25 text-base ${
              activeView === item.view
                ? 'active border-border-token bg-btn-secondary text-fg'
                : 'text-fg-secondary hover:bg-btn-tertiary-hover'
            }`}
            onClick={() => setActiveView(item.view)}
          >
            <span className="inline-flex items-center gap-1.25">
              <item.icon size={16} />
              <span>{item.label}</span>
            </span>
            <span className="font-mono text-sm text-fg-tertiary">
              {item.shortcut}
            </span>
          </Button>
        ))}
      </nav>

      <footer className="mt-auto grid gap-1.25">
        <Button
          variant="ghost"
          className={`w-full justify-between rounded-md border border-transparent px-1.5 py-1.25 text-base ${
            activeView === 'settings'
              ? 'active border-border-token bg-btn-secondary text-fg'
              : 'text-fg-secondary hover:bg-btn-tertiary-hover'
          }`}
          onClick={() => setActiveView('settings')}
        >
          <span className="inline-flex items-center gap-1.25">
            <Settings2 size={16} />
            <span>Einstellungen</span>
          </span>
          <span className="font-mono text-sm text-fg-tertiary">
            Cmd+,
          </span>
        </Button>

        <Button
          variant="ghost"
          aria-label="Zur Warteschlange wechseln"
          className="flex items-center justify-between gap-1 rounded-md border border-border-light-token bg-surface-secondary p-1"
          onClick={() => setActiveView('queue')}
          title="Zur Warteschlange wechseln"
        >
          <span className="inline-flex min-w-0 flex-1 items-center justify-between gap-0.85 rounded-md-minus-2 border border-border-light-token bg-btn-tertiary px-1.05 py-0.85 text-sm text-fg-secondary">
            <Play size={13} />
            <span className="whitespace-nowrap">Laufend</span>
            <strong className="font-mono text-sm leading-none text-fg">
              {runningCount}
            </strong>
          </span>
          <span className="inline-flex min-w-0 flex-1 items-center justify-between gap-0.85 rounded-md-minus-2 border border-border-light-token bg-btn-tertiary px-1.05 py-0.85 text-sm text-fg-secondary">
            <Clock3 size={13} />
            <span className="whitespace-nowrap">Wartend</span>
            <strong className="font-mono text-sm leading-none text-fg">
              {pendingCount}
            </strong>
          </span>
        </Button>
      </footer>
    </aside>
  );
}
