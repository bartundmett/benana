import { useMemo, useState } from 'react';

import { useStudioStore } from '../state/useStudioStore';
import { Button, MutedText } from '../ui';

interface CommandAction {
  id: string;
  title: string;
  run: () => void;
}

export function CommandPalette() {
  const [query, setQuery] = useState('');
  const commandPaletteOpen = useStudioStore((state) => state.commandPaletteOpen);
  const setCommandPaletteOpen = useStudioStore((state) => state.setCommandPaletteOpen);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const toggleSidebar = useStudioStore((state) => state.toggleSidebar);
  const toggleInspector = useStudioStore((state) => state.toggleInspector);
  const config = useStudioStore((state) => state.config);
  const setConfig = useStudioStore((state) => state.setConfig);

  const actions = useMemo<CommandAction[]>(
    () => [
      { id: 'open-gallery', title: 'Galerie öffnen', run: () => setActiveView('gallery') },
      { id: 'open-create', title: 'Neue Generierung', run: () => setActiveView('create') },
      { id: 'open-projects', title: 'Projekte öffnen', run: () => setActiveView('projects') },
      { id: 'open-prompts', title: 'Prompt-Bibliothek öffnen', run: () => setActiveView('prompts') },
      { id: 'open-queue', title: 'Warteschlange öffnen', run: () => setActiveView('queue') },
      { id: 'open-settings', title: 'Einstellungen öffnen', run: () => setActiveView('settings') },
      { id: 'toggle-sidebar', title: 'Seitenleiste ein-/ausblenden', run: () => toggleSidebar() },
      { id: 'toggle-inspector', title: 'Inspektor ein-/ausblenden', run: () => toggleInspector() },
      {
        id: 'toggle-theme',
        title: 'Hell/Dunkel umschalten',
        run: () => {
          if (!config) {
            return;
          }

          const nextTheme = config.theme === 'dark' ? 'light' : 'dark';
          void window.studio.updateConfig({ theme: nextTheme }).then((updated) => setConfig(updated));
        }
      }
    ],
    [config, setActiveView, setConfig, toggleInspector, toggleSidebar]
  );

  const filteredActions = actions.filter((action) =>
    action.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  if (!commandPaletteOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-120 grid place-items-start bg-overlay-24 pt-10vh backdrop-blur-2"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-command-dialog overflow-hidden rounded-xl border border-border-token bg-surface-primary shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          type="search"
          className="border-x-0 border-t-0 border-b-border-token rounded-none bg-surface-secondary px-2.5 py-2 text-base"
          placeholder="Befehl eingeben..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setCommandPaletteOpen(false);
            }
            if (event.key === 'Enter' && filteredActions[0]) {
              filteredActions[0].run();
              setCommandPaletteOpen(false);
              setQuery('');
            }
          }}
        />

        <div className="grid max-h-75 gap-1 overflow-auto p-1.5">
          {filteredActions.map((action) => (
            <Button
              variant="ghost"
              key={action.id}
              className="justify-start rounded-md px-1.75 py-1.5 text-left"
              onClick={() => {
                action.run();
                setCommandPaletteOpen(false);
                setQuery('');
              }}
            >
              {action.title}
            </Button>
          ))}

          {filteredActions.length === 0 ? <MutedText>Keine passenden Befehle.</MutedText> : null}
        </div>
      </div>
    </div>
  );
}
