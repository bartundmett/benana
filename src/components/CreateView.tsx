import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  AspectRatio,
  ModelName,
  ReferenceImagePayload,
  Resolution
} from '../../shared/types';
import { useProjectBrandAssets, useProjectPrompts, useProjects } from '../hooks/useStudioData';
import { useStudioStore, type RemixDraft } from '../state/useStudioStore';
import { Button, Card, FileUploadButton, MutedText, PageHeader, StatusText } from '../ui';

interface LocalReference extends ReferenceImagePayload {
  previewUrl: string;
  sourceImageId?: string;
}

type ResponseMode = 'imageText' | 'imageOnly';

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const BATCH_OPTIONS = [1, 2, 4] as const;

export function CreateView() {
  const config = useStudioStore((state) => state.config);
  const activeProjectId = useStudioStore((state) => state.activeProjectId);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const pendingRemix = useStudioStore((state) => state.pendingRemix);
  const pendingPromptTemplate = useStudioStore((state) => state.pendingPromptTemplate);
  const setPendingRemix = useStudioStore((state) => state.setPendingRemix);
  const setPendingPromptTemplate = useStudioStore((state) => state.setPendingPromptTemplate);
  const { data: projects } = useProjects();
  const activeProject = projects?.find((project) => project.id === activeProjectId) ?? null;
  const { data: promptTemplates } = useProjectPrompts(activeProjectId);
  const { data: projectBrandAssets } = useProjectBrandAssets(activeProjectId);

  const [prompt, setPrompt] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [model, setModel] = useState<ModelName>(config?.defaultModel ?? 'gemini-3-pro-image-preview');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [responseMode, setResponseMode] = useState<ResponseMode>('imageText');
  const [useGoogleSearch, setUseGoogleSearch] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [referenceImages, setReferenceImages] = useState<LocalReference[]>([]);
  const [remixParentId, setRemixParentId] = useState<string | null>(null);
  const [remixSourceName, setRemixSourceName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number>(0.134);

  useEffect(() => {
    setModel(config?.defaultModel ?? 'gemini-3-pro-image-preview');
  }, [config?.defaultModel]);

  useEffect(() => {
    void window.studio.estimateCost(resolution).then((cost) => setEstimatedCost(cost));
  }, [resolution]);

  useEffect(() => {
    if (!selectedTemplateId) {
      return;
    }

    const exists = promptTemplates?.some((template) => template.id === selectedTemplateId) ?? false;
    if (!exists) {
      setSelectedTemplateId('');
    }
  }, [promptTemplates, selectedTemplateId]);

  const isProImageModel = model === 'gemini-3-pro-image-preview';
  const isFlashImageModel = model === 'gemini-2.5-flash-image' || model === 'gemini-2.5-flash-image-preview';
  const resolutionOptions = useMemo(
    () => (isProImageModel ? (['1K', '2K', '4K'] as Resolution[]) : (['1K'] as Resolution[])),
    [isProImageModel]
  );

  useEffect(() => {
    if (resolutionOptions.includes(resolution)) {
      return;
    }

    setResolution(resolutionOptions[0]);
  }, [resolution, resolutionOptions]);

  useEffect(() => {
    if (!isFlashImageModel || !useGoogleSearch) {
      return;
    }

    setUseGoogleSearch(false);
  }, [isFlashImageModel, useGoogleSearch]);

  const canGenerate = useMemo(() => {
    return prompt.trim().length > 0 && !isSubmitting && Boolean(activeProjectId);
  }, [activeProjectId, isSubmitting, prompt]);

  const onGenerate = useCallback(async () => {
    if (!canGenerate) {
      if (!activeProjectId) {
        setStatus('Wähle vor der Generierung ein Projekt in der Seitenleiste aus.');
      }
      return;
    }

    setIsSubmitting(true);
    setStatus('Generierungsauftrag wird eingereiht...');

    try {
      const result = await window.studio.enqueueGeneration({
        model,
        prompt,
        referenceImages,
        aspectRatio,
        resolution,
        useGoogleSearch: isProImageModel ? useGoogleSearch : false,
        responseModalities: responseMode === 'imageOnly' ? ['IMAGE'] : ['TEXT', 'IMAGE'],
        batchCount,
        parentId: remixParentId,
        projectId: activeProjectId
      });

      const count = result.queuedJobIds.length;
      setStatus(`${count} ${count === 1 ? 'Auftrag' : 'Aufträge'} eingereiht. Öffne die Warteschlange zur Überwachung.`);
      setActiveView('queue');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Generierungsauftrag konnte nicht eingereiht werden.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeProjectId,
    aspectRatio,
    batchCount,
    canGenerate,
    model,
    prompt,
    referenceImages,
    remixParentId,
    resolution,
    responseMode,
    setActiveView,
    isProImageModel,
    useGoogleSearch
  ]);

  useEffect(() => {
    const onShortcut = () => {
      void onGenerate();
    };

    window.addEventListener('studio:shortcut-generate', onShortcut);
    return () => {
      window.removeEventListener('studio:shortcut-generate', onShortcut);
    };
  }, [onGenerate]);

  useEffect(() => {
    if (!pendingRemix || typeof pendingRemix.prompt !== 'string') {
      return;
    }

    setPrompt(pendingRemix.prompt);
    setRemixParentId(pendingRemix.sourceImageId ?? null);
    setRemixSourceName(pendingRemix.sourceImageName ?? pendingRemix.sourceImageId ?? null);

    if (!pendingRemix.sourceImageUrl || !pendingRemix.sourceImageId) {
      setPendingRemix(null);
      return;
    }

    void studioImageToReference(pendingRemix)
      .then((reference) => {
        setReferenceImages((current) => {
          const withoutCurrentSource = current.filter((item) => item.sourceImageId !== pendingRemix.sourceImageId);
          return [reference, ...withoutCurrentSource].slice(0, 14);
        });
      })
      .catch((error) => {
        setStatus(
          error instanceof Error
            ? `Remix-Quellbild konnte nicht angehängt werden: ${error.message}`
            : 'Remix-Quellbild konnte nicht angehängt werden.'
        );
      })
      .finally(() => {
        setPendingRemix(null);
      });
  }, [pendingRemix, setPendingRemix]);

  useEffect(() => {
    if (!pendingPromptTemplate || typeof pendingPromptTemplate.prompt !== 'string') {
      return;
    }

    setPrompt(pendingPromptTemplate.prompt);
    if (pendingPromptTemplate.templateId) {
      setSelectedTemplateId(pendingPromptTemplate.templateId);
      void window.studio.markPromptUsed(pendingPromptTemplate.templateId);
    }
    setPendingPromptTemplate(null);
  }, [pendingPromptTemplate, setPendingPromptTemplate]);

  const onReferenceUpload = async (files: FileList | null) => {
    if (!files) {
      return;
    }

    const remainingSlots = 14 - referenceImages.length;
    if (remainingSlots <= 0) {
      setStatus('Maximal 14 Referenzbilder erlaubt.');
      return;
    }

    const selectedFiles = Array.from(files).slice(0, Math.max(0, remainingSlots));
    try {
      const parsed = await Promise.all(selectedFiles.map(fileToReference));
      setReferenceImages((current) => [...current, ...parsed]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Referenzbilder konnten nicht geladen werden.');
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-1240px content-start gap-3">
      <PageHeader
        className="items-end max-900:items-start max-900:flex-col"
        title="Erstellen"
        description="Komponiere einen Prompt, wähle Modell-Optionen und starte Varianten in die Warteschlange."
      />

      <div className="grid grid-cols-create items-start gap-2 max-1200:grid-cols-1">
        <div className="grid gap-1.5">
          <Card className="grid gap-1.5 p-2">
            <div className="flex flex-wrap items-center gap-1.25 rounded-md border border-border-light-token bg-surface-secondary px-1.5 py-1.25 text-sm">
              <strong>Projekt:</strong>
              <span>{activeProject?.name ?? 'Kein aktives Projekt ausgewählt'}</span>
              <span className="h-3.5 w-px bg-border-light-token" />
              {activeProject ? (
                <span>
                  Brand-Kontext: {projectBrandAssets?.length ?? 0} Asset
                  {(projectBrandAssets?.length ?? 0) === 1 ? '' : 's'} · {activeProject.brandStrictMode ? 'strikt' : 'flexibel'}
                </span>
              ) : (
                <span>Wähle zuerst ein Projekt in der Seitenleiste.</span>
              )}
            </div>

            <label>
              Prompt-Vorlage
              <select
                value={selectedTemplateId}
                onChange={(event) => {
                  const templateId = event.target.value;
                  setSelectedTemplateId(templateId);
                  if (!templateId) {
                    return;
                  }

                  const template = promptTemplates?.find((entry) => entry.id === templateId);
                  if (!template) {
                    return;
                  }

                  setPrompt(template.template);
                  setStatus(`Vorlage "${template.name}" geladen.`);
                  void window.studio.markPromptUsed(template.id);
                }}
              >
                <option value="">Gespeicherte Vorlage auswählen...</option>
                {promptTemplates?.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>

            {remixParentId ? (
              <div className="flex items-center justify-between gap-1.5 rounded-md border border-border-warning-token bg-status-warning-bg px-1.75 py-1.25 text-sm text-warning-token">
                <span>Remix-Quelle verknüpft: {remixSourceName ?? remixParentId}</span>
                <Button
                  size="sm"
                  className="px-1.25 py-0.75 text-sm"
                  onClick={() => {
                    setRemixParentId(null);
                    setRemixSourceName(null);
                    setReferenceImages((current) => current.filter((item) => item.sourceImageId !== remixParentId));
                  }}
                >
                  Quelle lösen
                </Button>
              </div>
            ) : null}

            <label htmlFor="prompt">Prompt</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={8}
              className="min-h-180px"
              placeholder="Beschreibe Motiv, Stil, Bildsprache und gewünschte Varianten..."
            />
          </Card>

          <Card className="grid gap-1.5 p-2">
            <div className="flex items-center justify-between gap-1.5">
              <h3>Referenzbilder ({referenceImages.length}/14)</h3>
              <FileUploadButton
                label="Dateien hinzufügen"
                accept="image/*"
                multiple
                className="inline-flex items-center gap-1 rounded-md border border-border-token bg-btn-secondary px-1.5 py-1 text-sm"
                onFilesSelected={(files) => void onReferenceUpload(files)}
              />
            </div>

            {referenceImages.length === 0 ? <MutedText>Keine Referenzen angehängt.</MutedText> : null}

            <div className="grid grid-cols-auto-fill-180 gap-1.5">
              {referenceImages.map((ref, index) => (
                <Card key={ref.id ?? `${ref.name}-${index}`} className="grid gap-1.25 p-1.25">
                  <img
                    src={ref.previewUrl}
                    alt={ref.name}
                    className="h-21.5 w-full rounded-sm border border-border-light-token bg-surface-secondary object-contain object-center"
                  />
                  <div>
                    <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm" title={ref.name}>
                      {ref.name}
                    </p>
                    <select
                      value={ref.label ?? 'object'}
                      onChange={(event) => {
                        const label = event.target.value as 'person' | 'object' | 'style';
                        setReferenceImages((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  label
                                }
                              : item
                          )
                        );
                      }}
                    >
                      <option value="person">Person</option>
                      <option value="object">Objekt</option>
                      <option value="style">Stil</option>
                    </select>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setReferenceImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Entfernen
                  </Button>
                </Card>
              ))}
            </div>
          </Card>
        </div>

        <aside className="grid gap-1.5">
          <Card className="grid gap-1.5 p-2">
            <h3 className="text-lg font-550">Generierungs-Optionen</h3>

            <div className="grid gap-1.25">
              <label>
                Modell
                <select value={model} onChange={(event) => setModel(event.target.value as ModelName)}>
                  <option value="gemini-3-pro-image-preview">Gemini 3 Pro (Qualität, 1K/2K/4K)</option>
                  <option value="gemini-2.5-flash-image">Gemini 2.5 Flash (Geschwindigkeit, 1K)</option>
                </select>
              </label>

              <label>
                Auflösung
                <select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}>
                  {resolutionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {!isProImageModel ? <MutedText as="span">Für Flash Image ist aktuell nur 1K verfügbar.</MutedText> : null}
              </label>

              <label>
                Seitenverhältnis
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatio)}>
                  {ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Antwortmodus
                <div className="inline-flex overflow-hidden rounded-md border border-border-token" role="tablist" aria-label="Antwortmodus">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`min-w-23 rounded-none border-0 border-r border-border-light-token ${responseMode === 'imageText' ? 'active bg-btn-secondary' : ''}`}
                    onClick={() => setResponseMode('imageText')}
                  >
                    Bild + Text
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`min-w-23 rounded-none border-0 ${responseMode === 'imageOnly' ? 'active bg-btn-secondary' : ''}`}
                    onClick={() => setResponseMode('imageOnly')}
                  >
                    Nur Bild
                  </Button>
                </div>
              </label>

              <label>
                Variationen
                <div className="inline-flex overflow-hidden rounded-md border border-border-token" role="tablist" aria-label="Anzahl Varianten">
                  {BATCH_OPTIONS.map((value) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      key={value}
                      className={`min-w-18 rounded-none border-0 border-r border-border-light-token last:border-r-0 ${batchCount === value ? 'active bg-btn-secondary' : ''}`}
                      onClick={() => setBatchCount(value)}
                      aria-label={`${value} Variante${value > 1 ? 'n' : ''}`}
                      title={`${value} Variante${value > 1 ? 'n' : ''}`}
                    >
                      {value}x
                    </Button>
                  ))}
                </div>
              </label>

              <div className="grid gap-0.4 rounded-md border border-dashed border-border-light-token px-1.2 py-1">
                <span className="text-sm text-fg-secondary">Thinking</span>
                <MutedText>
                  {isProImageModel
                    ? 'Für Gemini 3 Pro Image wird Thinking automatisch vom Modell gesteuert.'
                    : 'Für Gemini 2.5 Flash Image nicht verfügbar.'}
                </MutedText>
              </div>

              <label className="mt-0.5 flex items-center gap-1.25 text-fg">
                <input
                  type="checkbox"
                  className="w-auto"
                  checked={useGoogleSearch}
                  onChange={(event) => setUseGoogleSearch(event.target.checked)}
                  disabled={!isProImageModel}
                />
                Google-Suche als Grounding nutzen
              </label>
              {!isProImageModel ? <MutedText>Grounding mit Google Search wird von Flash Image nicht unterstützt.</MutedText> : null}
            </div>
          </Card>

          <Card className="grid gap-1 p-2">
            <div className="flex items-center justify-between gap-1.25">
              <span className="text-sm text-fg-secondary">Geschätzte Kosten</span>
              <strong className="font-mono text-lg text-fg">
                ${(estimatedCost * batchCount).toFixed(3)}
              </strong>
            </div>
            <MutedText>
              {batchCount} Variante{batchCount > 1 ? 'n' : ''} · {responseMode === 'imageOnly' ? 'Nur Bild' : 'Bild + Text'} ·{' '}
              {resolution}
            </MutedText>
            <Button variant="primary" className="w-full" onClick={() => void onGenerate()} disabled={!canGenerate}>
              {isSubmitting ? 'Wird eingereiht...' : 'Generieren (Cmd+Enter)'}
            </Button>
          </Card>
        </aside>
      </div>

      {status ? <StatusText>{status}</StatusText> : null}
    </section>
  );
}

async function studioImageToReference(payload: RemixDraft): Promise<LocalReference> {
  if (!payload.sourceImageUrl) {
    throw new Error('URL des Quellbilds fehlt.');
  }

  const response = await fetch(payload.sourceImageUrl);
  if (!response.ok) {
    throw new Error(`Quellbild konnte nicht geladen werden (${response.status}).`);
  }

  const blob = await response.blob();
  const dataUrl = await readBlobAsDataUrl(blob);
  const [prefix, dataBase64] = dataUrl.split(',');
  const mimeTypeMatch = /^data:(.+);base64$/.exec(prefix);
  const mimeType = mimeTypeMatch?.[1] ?? blob.type ?? 'image/png';
  if (!dataBase64) {
    throw new Error('Quellbild-Daten sind leer.');
  }

  return {
    name: payload.sourceImageName ?? `remix-${payload.sourceImageId ?? 'source'}.png`,
    mimeType,
    dataBase64,
    previewUrl: dataUrl,
    label: 'object',
    sourceImageId: payload.sourceImageId
  };
}

async function fileToReference(file: File): Promise<LocalReference> {
  const dataUrl = await readAsDataUrl(file);
  const [prefix, payload] = dataUrl.split(',');
  const mimeTypeMatch = /^data:(.+);base64$/.exec(prefix);
  const mimeType = mimeTypeMatch?.[1] ?? file.type ?? 'image/png';

  return {
    name: file.name,
    mimeType,
    dataBase64: payload,
    previewUrl: dataUrl,
    label: 'object'
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

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Blob konnte nicht gelesen werden.'));
    reader.readAsDataURL(blob);
  });
}
