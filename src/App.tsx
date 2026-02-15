import { useCallback, useEffect, useMemo } from 'react';
import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, Search, Settings2 } from 'lucide-react';

import type { StudioMenuCommand } from '../shared/types';
import { useInitialStudioState, useProjects, useStudioLiveEvents } from './hooks/useStudioData';
import { CommandPalette } from './components/CommandPalette';
import { CreateView } from './components/CreateView';
import { GalleryView } from './components/GalleryView';
import { InspectorPanel } from './components/InspectorPanel';
import { OnboardingFlow } from './components/OnboardingFlow';
import { PromptLibraryView } from './components/PromptLibraryView';
import { ProjectsView } from './components/ProjectsView';
import { QueueView } from './components/QueueView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { useStudioStore } from './state/useStudioStore';
import { Card, IconButton } from './ui';

function App() {
  const hasStudioBridge =
    typeof window !== 'undefined' &&
    typeof (window as Window & { studio?: unknown }).studio === 'object' &&
    (window as Window & { studio?: { getInitialState?: unknown } }).studio?.getInitialState instanceof
      Function;

  if (!hasStudioBridge) {
    return (
      <div className="grid h-full w-full place-items-center p-6">
        <Card as="div" className="grid w-full max-w-420px gap-2 p-5">
          <h1>Startfehler</h1>
          <p>Die Renderer-Bridge ist nicht verfügbar (`window.studio` fehlt).</p>
          <p>Starte die App neu oder führe `npm run build` aus und öffne sie erneut.</p>
        </Card>
      </div>
    );
  }

  return <StudioApp />;
}

function StudioApp() {
  useStudioLiveEvents();
  const isDarwin = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

  const { data, isLoading, isError, error } = useInitialStudioState();
  const activeView = useStudioStore((state) => state.activeView);
  const activeProjectId = useStudioStore((state) => state.activeProjectId);
  const selectedImageId = useStudioStore((state) => state.selectedImageId);
  const config = useStudioStore((state) => state.config);
  const sidebarCollapsed = useStudioStore((state) => state.sidebarCollapsed);
  const inspectorCollapsed = useStudioStore((state) => state.inspectorCollapsed);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const setActiveProjectId = useStudioStore((state) => state.setActiveProjectId);
  const setSelectedImageId = useStudioStore((state) => state.setSelectedImageId);
  const setInspectorCollapsed = useStudioStore((state) => state.setInspectorCollapsed);
  const toggleSidebar = useStudioStore((state) => state.toggleSidebar);
  const toggleInspector = useStudioStore((state) => state.toggleInspector);
  const setCommandPaletteOpen = useStudioStore((state) => state.setCommandPaletteOpen);
  const setConfig = useStudioStore((state) => state.setConfig);
  const { data: projectData } = useProjects();

  const projects = useMemo(() => {
    return projectData ?? data?.projects ?? [];
  }, [data?.projects, projectData]);

  const activeViewTitle = useMemo(() => {
    switch (activeView) {
      case 'gallery':
        return 'Galerie';
      case 'create':
        return 'Erstellen';
      case 'projects':
        return 'Projekte';
      case 'prompts':
        return 'Prompt-Bibliothek';
      case 'queue':
        return 'Warteschlange';
      case 'settings':
        return 'Einstellungen';
      default:
        return 'Benana';
    }
  }, [activeView]);

  const runStudioCommand = useCallback(
    (command: StudioMenuCommand) => {
      switch (command) {
        case 'new-image':
          setActiveView('create');
          return;
        case 'new-project':
          setActiveView('projects');
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('studio:shortcut-new-project'));
          }, 0);
          return;
        case 'open-gallery':
          setActiveView('gallery');
          return;
        case 'open-queue':
          setActiveView('queue');
          return;
        case 'open-prompts':
          setActiveView('prompts');
          return;
        case 'open-projects':
          setActiveView('projects');
          return;
        case 'open-settings':
          setActiveView('settings');
          return;
        case 'open-command-palette':
          setCommandPaletteOpen(true);
          return;
        case 'toggle-sidebar':
          toggleSidebar();
          return;
        case 'toggle-inspector':
          toggleInspector();
          return;
        default:
      }
    },
    [setActiveView, setCommandPaletteOpen, toggleInspector, toggleSidebar]
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-codex-window-type', 'electron');

    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) {
      document.documentElement.setAttribute('data-platform', 'darwin');
      return;
    }

    if (platform.includes('win')) {
      document.documentElement.setAttribute('data-platform', 'win32');
      return;
    }

    document.documentElement.setAttribute('data-platform', 'linux');
  }, []);

  useEffect(() => {
    if (!config) {
      return;
    }

    const effectiveTheme =
      config.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : config.theme;

    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.documentElement.classList.remove('electron-light', 'electron-dark');
    document.documentElement.classList.add(effectiveTheme === 'dark' ? 'electron-dark' : 'electron-light');
  }, [config]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCmd = event.metaKey || event.ctrlKey;
      if (!isCmd) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'k') {
        event.preventDefault();
        runStudioCommand('open-command-palette');
        return;
      }

      if (key === '1') {
        event.preventDefault();
        runStudioCommand('open-gallery');
        return;
      }

      if (key === '2') {
        event.preventDefault();
        runStudioCommand('open-queue');
        return;
      }

      if (key === '3') {
        event.preventDefault();
        runStudioCommand('open-prompts');
        return;
      }

      if (key === '4') {
        event.preventDefault();
        runStudioCommand('open-projects');
        return;
      }

      if (key === 'n' && event.shiftKey) {
        event.preventDefault();
        runStudioCommand('new-project');
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        runStudioCommand('new-image');
        return;
      }

      if (key === ',') {
        event.preventDefault();
        runStudioCommand('open-settings');
        return;
      }

      if (key === 'b') {
        event.preventDefault();
        runStudioCommand('toggle-sidebar');
        return;
      }

      if (key === 'i') {
        event.preventDefault();
        runStudioCommand('toggle-inspector');
        return;
      }

      if (key === 'enter' && !event.shiftKey) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('studio:shortcut-generate'));
        return;
      }

      if (key === 't' && event.shiftKey && config) {
        event.preventDefault();
        const nextTheme = config.theme === 'dark' ? 'light' : 'dark';
        void window.studio.updateConfig({ theme: nextTheme }).then(setConfig);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [config, runStudioCommand, setConfig]);

  useEffect(() => {
    if (typeof window.studio.onMenuCommand !== 'function') {
      return;
    }

    return window.studio.onMenuCommand((command) => {
      runStudioCommand(command);
    });
  }, [runStudioCommand]);

  useEffect(() => {
    if (!projects.length) {
      return;
    }

    const hasProject = activeProjectId ? projects.some((project) => project.id === activeProjectId) : false;
    if (!hasProject) {
      setActiveProjectId(projects[0].id);
      setSelectedImageId(null);
    }
  }, [activeProjectId, projects, setActiveProjectId, setSelectedImageId]);

  useEffect(() => {
    if (!selectedImageId) {
      return;
    }

    setInspectorCollapsed(false);
  }, [selectedImageId, setInspectorCollapsed]);

  if (isLoading) {
    return (
      <div className="grid h-full w-full place-items-center p-6">
        <Card as="div" className="grid w-full max-w-420px gap-2 p-5">
          <h1>Benana</h1>
          <p>Lokaler Arbeitsbereich wird geladen...</p>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid h-full w-full place-items-center p-6">
        <Card as="div" className="grid w-full max-w-420px gap-2 p-5">
          <h1>Benana konnte nicht gestartet werden</h1>
          <p>{error instanceof Error ? error.message : 'Unbekannter Startfehler.'}</p>
        </Card>
      </div>
    );
  }

  const resolvedConfig = config ?? data?.config;

  if (!resolvedConfig || !resolvedConfig.onboardingCompleted || !resolvedConfig.hasApiKey) {
    return <OnboardingFlow />;
  }

  return (
    <div className="grid h-full w-full grid-rows-toolbar-main overflow-hidden bg-transparent">
      <header
        className={`min-h-toolbar flex items-center justify-between gap-2 border-b border-border-light-token bg-surface-secondary px-2.5 app-region-drag backdrop-sat-108-blur-18 ${
          isDarwin ? 'pl-23' : ''
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <IconButton
            icon={sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
            label={sidebarCollapsed ? 'Seitenleiste einblenden' : 'Seitenleiste ausblenden'}
            className="min-h-8 min-w-8 rounded-lg border-border-light-token bg-btn-secondary p-1 app-region-no-drag"
            onClick={() => toggleSidebar()}
            title={sidebarCollapsed ? 'Seitenleiste einblenden' : 'Seitenleiste ausblenden'}
          />
          <div
            className={`min-w-0 truncate whitespace-nowrap px-1 text-lg text-fg-secondary ${
              isDarwin ? 'pl-2' : ''
            }`}
          >
            <strong>{activeViewTitle}</strong>
          </div>
        </div>
        <div className="flex gap-1.5 app-region-no-drag">
          <IconButton
            icon={inspectorCollapsed ? <PanelRight size={16} /> : <PanelRightClose size={16} />}
            label={inspectorCollapsed ? 'Inspektor einblenden' : 'Inspektor ausblenden'}
            className="min-h-8 min-w-8 rounded-lg border-border-light-token bg-btn-secondary py-1.05 px-1.45"
            onClick={() => toggleInspector()}
            title={inspectorCollapsed ? 'Inspektor einblenden' : 'Inspektor ausblenden'}
          />
          <IconButton
            icon={<Search size={16} />}
            label="Befehlspalette öffnen"
            className="min-h-8 min-w-8 rounded-lg border-border-light-token bg-btn-secondary py-1.05 px-1.45"
            onClick={() => setCommandPaletteOpen(true)}
            title="Befehlspalette (Cmd+K)"
          />
          <IconButton
            icon={<Settings2 size={16} />}
            label="Einstellungen öffnen"
            className="min-h-8 min-w-8 rounded-lg border-border-light-token bg-btn-secondary py-1.05 px-1.45"
            onClick={() => setActiveView('settings')}
            title="Einstellungen"
          />
        </div>
      </header>

      <div
        className="grid min-h-0 gap-0 p-2 transition-grid-cols duration-220 ease-smooth-app grid-cols-shell-layout max-1080:grid-cols-1"
        style={{
          ['--left-column-width' as string]: sidebarCollapsed ? '0px' : 'var(--spacing-token-sidebar)',
          ['--right-column-width' as string]: inspectorCollapsed ? '0px' : 'clamp(280px,24vw,340px)'
        }}
      >
        <div
          className={`min-w-0 overflow-hidden transition-padding-token duration-220 ease-smooth-app max-1080:hidden ${
            sidebarCollapsed ? 'pointer-events-none pr-0' : 'pr-1.5'
          }`}
        >
          <Sidebar />
        </div>

        <main className="min-h-0 min-w-0 overflow-auto rounded-lg border border-border-light-token bg-main-surface p-3 shadow-md">
          {activeView === 'gallery' ? <GalleryView /> : null}
          {activeView === 'create' ? <CreateView /> : null}
          {activeView === 'queue' ? <QueueView /> : null}
          {activeView === 'settings' ? <SettingsView /> : null}
          {activeView === 'projects' ? <ProjectsView /> : null}
          {activeView === 'prompts' ? <PromptLibraryView /> : null}
        </main>

        <div
          className={`min-w-0 overflow-hidden transition-padding-token duration-220 ease-smooth-app max-1080:hidden ${
            inspectorCollapsed ? 'pointer-events-none pl-0' : 'pl-1.5'
          }`}
        >
          <InspectorPanel />
        </div>
      </div>

      <CommandPalette />
    </div>
  );
}

export default App;
