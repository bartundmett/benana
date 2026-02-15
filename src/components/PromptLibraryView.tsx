import { useEffect, useMemo, useState } from 'react';
import { Pencil, Play, Trash2 } from 'lucide-react';

import { useProjectPrompts, useProjects } from '../hooks/useStudioData';
import { useStudioStore } from '../state/useStudioStore';
import { Button, Card, IconButton, MutedText, PageHeader, StatusText } from '../ui';

function parseVariables(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function PromptLibraryView() {
  const activeProjectId = useStudioStore((state) => state.activeProjectId);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const setPendingPromptTemplate = useStudioStore((state) => state.setPendingPromptTemplate);
  const { data: projects } = useProjects();
  const activeProject = projects?.find((project) => project.id === activeProjectId) ?? null;
  const { data: prompts, isLoading } = useProjectPrompts(activeProjectId);

  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [variables, setVariables] = useState('');
  const [folder, setFolder] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const editingPrompt = useMemo(() => {
    if (!editingPromptId) {
      return null;
    }
    return prompts?.find((prompt) => prompt.id === editingPromptId) ?? null;
  }, [editingPromptId, prompts]);

  useEffect(() => {
    if (!editingPrompt) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate form fields when selecting an existing prompt
    setName(editingPrompt.name);
    setTemplate(editingPrompt.template);
    setVariables(editingPrompt.variables.join(', '));
    setFolder(editingPrompt.folder ?? '');
  }, [editingPrompt]);

  useEffect(() => {
    if (activeProjectId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear form state when no active project is selected
    setEditingPromptId(null);
    setName('');
    setTemplate('');
    setVariables('');
    setFolder('');
  }, [activeProjectId]);

  const resetForm = () => {
    setEditingPromptId(null);
    setName('');
    setTemplate('');
    setVariables('');
    setFolder('');
  };

  const onSavePrompt = async () => {
    if (!activeProjectId) {
      setStatus('Bitte zuerst ein Projekt auswählen.');
      return;
    }

    if (!name.trim() || !template.trim()) {
      setStatus('Name und Vorlage sind erforderlich.');
      return;
    }

    try {
      if (editingPromptId) {
        const updated = await window.studio.updatePrompt({
          id: editingPromptId,
          name: name.trim(),
          template: template.trim(),
          variables: parseVariables(variables),
          folder: folder.trim() || null
        });

        if (!updated) {
          setStatus('Prompt existiert nicht mehr.');
          return;
        }

        setStatus(`Prompt "${updated.name}" wurde aktualisiert.`);
      } else {
        const created = await window.studio.createPrompt({
          projectId: activeProjectId,
          name: name.trim(),
          template: template.trim(),
          variables: parseVariables(variables),
          folder: folder.trim() || null
        });

        setStatus(`Prompt "${created.name}" wurde gespeichert.`);
      }

      resetForm();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Prompt konnte nicht gespeichert werden.');
    }
  };

  const onDeletePrompt = async (promptId: string) => {
    const deleted = await window.studio.deletePrompt(promptId);
    if (!deleted) {
      setStatus('Prompt konnte nicht gelöscht werden.');
      return;
    }

    if (editingPromptId === promptId) {
      resetForm();
    }

    setStatus('Prompt wurde gelöscht.');
  };

  return (
    <section className="grid gap-3">
      <PageHeader
        className="flex-wrap"
        title="Prompt-Bibliothek"
        actions={
          <Button
            onClick={() => {
              setActiveView('create');
            }}
          >
            Erstellen öffnen
          </Button>
        }
      />

      <MutedText>
        {activeProject ? `Projekt: ${activeProject.name}` : 'Wähle in der Seitenleiste ein Projekt, um Prompts zu verwalten.'}
      </MutedText>

      {isLoading ? <MutedText>Prompt-Vorlagen werden geladen...</MutedText> : null}

      <div className="grid grid-cols-prompts gap-2 max-1200:grid-cols-1">
        <Card as="section" className="grid gap-1.5 p-2">
          <h3>Gespeicherte Vorlagen</h3>
          {!activeProjectId ? <MutedText>Kein aktives Projekt ausgewählt.</MutedText> : null}
          {activeProjectId && !prompts?.length ? <MutedText>In diesem Projekt gibt es noch keine Vorlagen.</MutedText> : null}

          <div className="grid gap-1">
            {prompts?.map((promptTemplate) => (
              <Card key={promptTemplate.id} className="grid gap-1.2 p-1.5">
                <div className="flex items-start justify-between gap-1">
                  <strong>{promptTemplate.name}</strong>
                  <span className="font-mono text-sm text-fg-tertiary">
                    {promptTemplate.usageCount}x verwendet
                  </span>
                </div>
                <p>{promptTemplate.template}</p>
                <div className="flex items-center gap-1">
                  {promptTemplate.variables.length > 0 ? (
                    <span className="rounded-xs border border-border-light-token bg-surface-secondary px-1 py-0.5 font-mono text-xs">
                      {promptTemplate.variables.join(', ')}
                    </span>
                  ) : null}
                  {promptTemplate.folder ? (
                    <span className="rounded-xs border border-border-light-token bg-surface-secondary px-1 py-0.5 font-mono text-xs">
                      {promptTemplate.folder}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.75 flex flex-wrap items-center gap-1">
                  <IconButton
                    icon={<Play size={15} />}
                    label="Vorlage nutzen"
                    onClick={() => {
                      setPendingPromptTemplate({
                        prompt: promptTemplate.template,
                        templateId: promptTemplate.id
                      });
                      setActiveView('create');
                    }}
                  />
                  <IconButton
                    icon={<Pencil size={15} />}
                    label="Vorlage bearbeiten"
                    onClick={() => {
                      setEditingPromptId(promptTemplate.id);
                    }}
                  />
                  <IconButton
                    icon={<Trash2 size={15} />}
                    label="Vorlage löschen"
                    onClick={() => void onDeletePrompt(promptTemplate.id)}
                  />
                </div>
              </Card>
            ))}
          </div>
        </Card>

        <Card as="section" className="grid gap-1.5 p-2">
          <h3>{editingPromptId ? 'Prompt-Vorlage bearbeiten' : 'Neue Prompt-Vorlage'}</h3>

          <div className="grid gap-1.2">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Produkt-Hero-Shot" />
            </label>
            <label>
              Vorlage
              <textarea
                rows={5}
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                placeholder="A {style} photo of {subject} ..."
              />
            </label>
            <label>
              Variablen (kommagetrennt)
              <input
                value={variables}
                onChange={(event) => setVariables(event.target.value)}
                placeholder="subject, style, color_palette"
              />
            </label>
            <label>
              Ordner
              <input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="Kampagne / Marke" />
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Button variant="primary" onClick={() => void onSavePrompt()} disabled={!activeProjectId}>
                {editingPromptId ? 'Änderungen speichern' : 'Prompt speichern'}
              </Button>
              <Button
                onClick={() => {
                  resetForm();
                }}
              >
                Zurücksetzen
              </Button>
            </div>
          </div>

          {status ? <StatusText>{status}</StatusText> : null}
        </Card>
      </div>
    </section>
  );
}
