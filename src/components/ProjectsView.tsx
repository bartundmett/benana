import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { useProjectBrandAssets, useProjects } from '../hooks/useStudioData';
import { useStudioStore } from '../state/useStudioStore';
import { Button, Card, FileUploadButton, IconButton, MutedText, PageHeader, StatusText } from '../ui';

export function ProjectsView() {
  const activeProjectId = useStudioStore((state) => state.activeProjectId);
  const setActiveProjectId = useStudioStore((state) => state.setActiveProjectId);
  const setSelectedImageId = useStudioStore((state) => state.setSelectedImageId);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const { data: projects, isLoading } = useProjects();

  const activeProject = useMemo(() => {
    if (!projects?.length) {
      return null;
    }

    return projects.find((project) => project.id === activeProjectId) ?? projects[0];
  }, [activeProjectId, projects]);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSystemPrompt, setNewSystemPrompt] = useState('');
  const [newBrandGuidelines, setNewBrandGuidelines] = useState('');
  const [newBrandStrictMode, setNewBrandStrictMode] = useState(true);
  const [newImageOutputDir, setNewImageOutputDir] = useState('');
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSystemPrompt, setEditSystemPrompt] = useState('');
  const [editBrandGuidelines, setEditBrandGuidelines] = useState('');
  const [editBrandStrictMode, setEditBrandStrictMode] = useState(true);
  const [editImageOutputDir, setEditImageOutputDir] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isUploadingBrandAssets, setIsUploadingBrandAssets] = useState(false);
  const { data: brandAssets, isLoading: isLoadingBrandAssets } = useProjectBrandAssets(activeProject?.id ?? null);
  const formatCost = (value: number) => `$${value.toFixed(3)}`;

  useEffect(() => {
    if (!activeProject) {
      setEditName('');
      setEditDescription('');
      setEditSystemPrompt('');
      setEditBrandGuidelines('');
      setEditBrandStrictMode(true);
      setEditImageOutputDir('');
      return;
    }

    setEditName(activeProject.name);
    setEditDescription(activeProject.description ?? '');
    setEditSystemPrompt(activeProject.systemPrompt ?? '');
    setEditBrandGuidelines(activeProject.brandGuidelines ?? '');
    setEditBrandStrictMode(activeProject.brandStrictMode);
    setEditImageOutputDir(activeProject.imageOutputDir ?? '');
  }, [activeProject]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCreateModalOpen(false);
        setCreateStatus(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isCreateModalOpen]);

  const resetCreateForm = useCallback(() => {
    setNewName('');
    setNewDescription('');
    setNewSystemPrompt('');
    setNewBrandGuidelines('');
    setNewBrandStrictMode(true);
    setNewImageOutputDir('');
    setCreateStatus(null);
  }, []);

  const openCreateModal = useCallback(() => {
    resetCreateForm();
    setIsCreateModalOpen(true);
  }, [resetCreateForm]);

  const closeCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setCreateStatus(null);
  }, []);

  useEffect(() => {
    const onShortcut = () => {
      openCreateModal();
    };

    window.addEventListener('studio:shortcut-new-project', onShortcut);
    return () => {
      window.removeEventListener('studio:shortcut-new-project', onShortcut);
    };
  }, [openCreateModal]);

  const onPickCreateImageOutputDir = async () => {
    try {
      const selectedPath = await window.studio.pickProjectImageOutputDir(newImageOutputDir || null);
      if (selectedPath) {
        setNewImageOutputDir(selectedPath);
      }
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : 'Bildordner konnte nicht ausgewählt werden.');
    }
  };

  const onPickEditImageOutputDir = async () => {
    try {
      const selectedPath = await window.studio.pickProjectImageOutputDir(editImageOutputDir || null);
      if (selectedPath) {
        setEditImageOutputDir(selectedPath);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Bildordner konnte nicht ausgewählt werden.');
    }
  };

  const onCreateProject = async () => {
    const name = newName.trim();
    if (!name) {
      setCreateStatus('Ein Projektname ist erforderlich.');
      return;
    }

    try {
      const created = await window.studio.createProject({
        name,
        description: newDescription.trim() || null,
        systemPrompt: newSystemPrompt.trim() || null,
        brandGuidelines: newBrandGuidelines.trim() || null,
        brandStrictMode: newBrandStrictMode,
        imageOutputDir: newImageOutputDir.trim() || null
      });
      setActiveProjectId(created.id);
      setSelectedImageId(null);
      closeCreateModal();
      setStatus(`Projekt "${created.name}" wurde erstellt.`);
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : 'Projekt konnte nicht erstellt werden.');
    }
  };

  const onUpdateProject = async () => {
    if (!activeProject) {
      return;
    }

    const name = editName.trim();
    if (!name) {
      setStatus('Der Projektname darf nicht leer sein.');
      return;
    }

    try {
      const updated = await window.studio.updateProject({
        id: activeProject.id,
        name,
        description: editDescription.trim() || null,
        systemPrompt: editSystemPrompt.trim() || null,
        brandGuidelines: editBrandGuidelines.trim() || null,
        brandStrictMode: editBrandStrictMode,
        imageOutputDir: editImageOutputDir.trim() || null
      });
      if (!updated) {
        setStatus('Projekt existiert nicht mehr.');
        return;
      }

      setStatus(`Projekt "${updated.name}" wurde aktualisiert.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Projekt konnte nicht aktualisiert werden.');
    }
  };

  const onDeleteProject = async () => {
    if (!activeProject) {
      return;
    }

    const shouldDelete = window.confirm(
      `Projekt "${activeProject.name}" löschen? Bilder, Prompts und Brand-Assets werden einem anderen Projekt zugewiesen.`
    );
    if (!shouldDelete) {
      return;
    }

    const deleted = await window.studio.deleteProject(activeProject.id);
    if (!deleted) {
      setStatus('Dieses Projekt konnte nicht gelöscht werden (mindestens ein Projekt muss bestehen bleiben).');
      return;
    }

    setSelectedImageId(null);
    setStatus(`Projekt "${activeProject.name}" wurde gelöscht.`);
  };

  const onUploadBrandAssets = async (files: FileList | null) => {
    if (!activeProject || !files) {
      return;
    }

    const selectedFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (selectedFiles.length === 0) {
      setStatus('Bitte nur Bilddateien für Brand-Assets auswählen.');
      return;
    }

    setIsUploadingBrandAssets(true);

    try {
      const payloads = await Promise.all(selectedFiles.map(fileToBrandAssetPayload));
      const created = await window.studio.addProjectBrandAssets({
        projectId: activeProject.id,
        assets: payloads
      });

      setStatus(
        `${created.length} ${created.length === 1 ? 'Brand-Asset' : 'Brand-Assets'} hinzugefügt.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Brand-Assets konnten nicht hochgeladen werden.');
    } finally {
      setIsUploadingBrandAssets(false);
    }
  };

  const onDeleteBrandAsset = async (assetId: string) => {
    const deleted = await window.studio.deleteProjectBrandAsset(assetId);
    if (!deleted) {
      setStatus('Brand-Asset konnte nicht gelöscht werden.');
      return;
    }

    setStatus('Brand-Asset gelöscht.');
  };

  return (
    <section className="mx-auto grid w-full max-w-1240px content-start gap-3">
      <PageHeader
        className="items-end max-900:items-start max-900:flex-col"
        title="Projekte"
        description="Verwalte Projektkontext, Brand-Richtlinien und Assets pro Arbeitsbereich."
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <IconButton icon={<Plus size={15} />} label="Neues Projekt" onClick={openCreateModal}>
              <span>Neues Projekt</span>
            </IconButton>
            <Button
              onClick={() => {
                setActiveView('gallery');
              }}
            >
              Galerie öffnen
            </Button>
          </div>
        }
      />

      {isLoading ? <MutedText>Projekte werden geladen...</MutedText> : null}

      <div className="grid grid-cols-projects items-start gap-2 max-1200:grid-cols-1">
        <Card as="section" className="grid content-start gap-1.5 p-2">
          <div className="flex items-center justify-between gap-1">
            <h3>Arbeitsbereiche</h3>
            <IconButton icon={<Plus size={14} />} label="Neues Projekt" onClick={openCreateModal} />
          </div>

          <div className="grid max-h-project-list content-start gap-1 overflow-auto pr-0.4">
            {projects?.map((project) => (
              <Button
                variant="ghost"
                key={project.id}
                className={`flex w-full flex-col items-start justify-start gap-0.75 rounded-md border px-1.5 py-1.15 text-left ${
                  project.id === activeProject?.id
                    ? 'active border-border-token bg-btn-secondary text-fg'
                    : 'border-transparent bg-transparent text-fg-secondary hover:border-border-light-token hover:bg-btn-secondary-hover'
                }`}
                onClick={() => {
                  setActiveProjectId(project.id);
                  setSelectedImageId(null);
                }}
              >
                <div className="flex w-full items-center justify-between gap-1.25">
                  <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-base">
                    {project.name}
                  </strong>
                  <span className="font-mono text-xs text-fg-secondary">
                    {formatCost(project.totalCost)}
                  </span>
                </div>
                <div className="mt-0.25 flex flex-wrap gap-0.75">
                  <span className="rounded-full border border-border-light-token bg-btn-tertiary px-1 py-0.25 text-xs text-fg-secondary">
                    {project.imageCount} Bilder
                  </span>
                  <span className="rounded-full border border-border-light-token bg-btn-tertiary px-1 py-0.25 text-xs text-fg-secondary">
                    {project.brandAssetCount} Assets
                  </span>
                  <span className="rounded-full border border-border-light-token bg-btn-tertiary px-1 py-0.25 text-xs text-fg-secondary">
                    {project.promptCount} Prompts
                  </span>
                </div>
              </Button>
            ))}
          </div>

          {activeProject ? (
            <div className="grid grid-cols-2 gap-1.5 border-t border-border-light-token pt-1.25">
              <span className="grid gap-0.6 rounded-sm border border-border-light-token bg-surface-secondary px-1.5 py-0.8">
                <small className="text-xs text-fg-tertiary">Bilder</small>
                <strong>{activeProject.imageCount}</strong>
              </span>
              <span className="grid gap-0.6 rounded-sm border border-border-light-token bg-surface-secondary px-1.5 py-0.8">
                <small className="text-xs text-fg-tertiary">Prompts</small>
                <strong>{activeProject.promptCount}</strong>
              </span>
              <span className="grid gap-0.6 rounded-sm border border-border-light-token bg-surface-secondary px-1.5 py-0.8">
                <small className="text-xs text-fg-tertiary">Assets</small>
                <strong>{activeProject.brandAssetCount}</strong>
              </span>
              <span className="grid gap-0.6 rounded-sm border border-border-light-token bg-surface-secondary px-1.5 py-0.8">
                <small className="text-xs text-fg-tertiary">Kosten</small>
                <strong className="font-mono">
                  {formatCost(activeProject.totalCost)}
                </strong>
              </span>
            </div>
          ) : null}
        </Card>

        <Card as="section" className="grid content-start gap-1.5 p-2">
          {activeProject ? (
            <div className="grid gap-1.35">
              <Card className="grid gap-1.35 border-border-light-token bg-surface-secondary p-1.5">
                <div className="flex items-center justify-between gap-1.25">
                  <h3>Basis</h3>
                </div>

                <div className="grid gap-1.35">
                  <label>
                    Name
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} />
                  </label>
                  <label>
                    Beschreibung
                    <textarea rows={2} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                  </label>
                  <label>
                    Bildordner (optional)
                    <input
                      value={editImageOutputDir}
                      onChange={(event) => setEditImageOutputDir(event.target.value)}
                      placeholder="Standard: ~/.benana/images/originals"
                    />
                  </label>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <Button onClick={() => void onPickEditImageOutputDir()}>
                      Ordner wählen
                    </Button>
                    <Button onClick={() => setEditImageOutputDir('')}>
                      Standard nutzen
                    </Button>
                  </div>
                </div>

                <div className="mt-0.75 flex flex-wrap items-center gap-1">
                  <Button variant="primary" onClick={() => void onUpdateProject()}>
                    Änderungen speichern
                  </Button>
                  <Button onClick={() => void onDeleteProject()}>
                    Projekt löschen
                  </Button>
                </div>
              </Card>

              <Card className="grid gap-1.35 border-border-light-token bg-surface-secondary p-1.5">
                <div className="flex items-center justify-between gap-1.25">
                  <h3>Brand-Richtlinien</h3>
                </div>

                <div className="grid gap-1.2">
                  <label>
                    System-Prompt
                    <textarea
                      rows={3}
                      value={editSystemPrompt}
                      onChange={(event) => setEditSystemPrompt(event.target.value)}
                    />
                  </label>
                  <label>
                    Markenidentität
                    <textarea
                      rows={4}
                      value={editBrandGuidelines}
                      onChange={(event) => setEditBrandGuidelines(event.target.value)}
                      placeholder="Farben, Logo-Regeln, Typografie, Bildsprache, Tone-of-Voice, No-Gos ..."
                    />
                  </label>
                  <label className="flex items-center gap-1.25 text-fg">
                    <input
                      type="checkbox"
                      className="w-auto"
                      checked={editBrandStrictMode}
                      onChange={(event) => setEditBrandStrictMode(event.target.checked)}
                    />
                    Strikten On-Brand-Modus aktivieren
                  </label>
                </div>
              </Card>

              <Card className="grid gap-1.35 border-border-light-token bg-surface-secondary p-1.5">
                <div className="flex items-center justify-between gap-1.25">
                  <h3>Brand-Assets ({brandAssets?.length ?? 0})</h3>
                  <FileUploadButton
                    label={isUploadingBrandAssets ? 'Lädt...' : 'Dateien hinzufügen'}
                    accept="image/*"
                    multiple
                    disabled={isUploadingBrandAssets}
                    className="inline-flex items-center gap-1 rounded-md border border-border-token bg-btn-secondary px-1.5 py-1 text-sm"
                    onFilesSelected={(files) => void onUploadBrandAssets(files)}
                  />
                </div>

                <div>
                  {isLoadingBrandAssets ? <MutedText>Brand-Assets werden geladen...</MutedText> : null}
                  {!isLoadingBrandAssets && (brandAssets?.length ?? 0) === 0 ? (
                    <MutedText>Noch keine Brand-Assets. Lade Logo, Key Visuals oder Stilreferenzen hoch.</MutedText>
                  ) : null}

                  <div className="grid grid-cols-auto-fill-180 gap-1.5">
                    {brandAssets?.map((asset) => (
                      <Card key={asset.id} className="grid gap-1.25 p-1.25">
                        <img
                          src={asset.fileUrl}
                          alt={asset.name}
                          loading="lazy"
                          className="h-21.5 w-full rounded-sm border border-border-light-token bg-surface-secondary object-contain object-center"
                        />
                        <div>
                          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm" title={asset.name}>
                            {asset.name}
                          </p>
                        </div>
                        <Button size="sm" onClick={() => void onDeleteBrandAsset(asset.id)}>
                          Entfernen
                        </Button>
                      </Card>
                    ))}
                  </div>
                </div>
              </Card>

              {status ? <StatusText>{status}</StatusText> : null}
            </div>
          ) : (
            <MutedText>Wähle ein Projekt zum Bearbeiten.</MutedText>
          )}

          {!activeProject ? null : (
            <div>
              <Button
                onClick={() => {
                  setActiveView('gallery');
                }}
              >
                Galerie dieses Projekts öffnen
              </Button>
            </div>
          )}
        </Card>
      </div>

      {isCreateModalOpen ? (
        <div
          className="fixed inset-0 z-140 grid place-items-center bg-overlay-45 p-3 backdrop-blur-4"
          role="dialog"
          aria-modal="true"
          onClick={closeCreateModal}
        >
          <Card
            as="div"
            className="grid w-full max-w-680px gap-1.75 rounded-lg bg-surface-primary p-2 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-1.5">
              <h3>Neues Projekt erstellen</h3>
              <IconButton icon={<X size={15} />} label="Schließen" onClick={closeCreateModal} />
            </div>

            <div className="grid gap-1.2">
              <label>
                Name
                <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Kundenkampagne" />
              </label>
              <label>
                Beschreibung
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  placeholder="Optionale Notizen zu diesem Arbeitsbereich"
                />
              </label>
              <label>
                Bildordner (optional)
                <input
                  value={newImageOutputDir}
                  onChange={(event) => setNewImageOutputDir(event.target.value)}
                  placeholder="Standard: ~/.benana/images/originals"
                />
              </label>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <Button onClick={() => void onPickCreateImageOutputDir()}>
                  Ordner wählen
                </Button>
                <Button onClick={() => setNewImageOutputDir('')}>
                  Standard nutzen
                </Button>
              </div>
              <label>
                System-Prompt
                <textarea
                  rows={3}
                  value={newSystemPrompt}
                  onChange={(event) => setNewSystemPrompt(event.target.value)}
                  placeholder="Globale Vorgaben für dieses Projekt"
                />
              </label>
              <label>
                Markenidentität
                <textarea
                  rows={4}
                  value={newBrandGuidelines}
                  onChange={(event) => setNewBrandGuidelines(event.target.value)}
                  placeholder="Farben, Logo-Regeln, Typografie, Bildsprache, Tone-of-Voice, No-Gos ..."
                />
              </label>
              <label className="flex items-center gap-1.25 text-fg">
                <input
                  type="checkbox"
                  className="w-auto"
                  checked={newBrandStrictMode}
                  onChange={(event) => setNewBrandStrictMode(event.target.checked)}
                />
                Strikten On-Brand-Modus aktivieren
              </label>
            </div>

            {createStatus ? <StatusText>{createStatus}</StatusText> : null}

            <div className="mt-0.5 flex flex-wrap justify-end gap-1">
              <Button onClick={closeCreateModal}>
                Abbrechen
              </Button>
              <Button variant="primary" onClick={() => void onCreateProject()}>
                Projekt erstellen
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

async function fileToBrandAssetPayload(file: File): Promise<{
  name: string;
  mimeType: string;
  dataBase64: string;
}> {
  const dataUrl = await readAsDataUrl(file);
  const [prefix, payload] = dataUrl.split(',');
  const mimeTypeMatch = /^data:(.+);base64$/.exec(prefix);
  const mimeType = mimeTypeMatch?.[1] ?? file.type ?? 'image/png';

  return {
    name: file.name,
    mimeType,
    dataBase64: payload
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}
