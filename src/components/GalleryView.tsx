import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Grid2x2, ListTree, Star, StarOff, Trash2 } from 'lucide-react';

import type { StudioImage } from '../../shared/types';
import { useGalleryImages, useProjects } from '../hooks/useStudioData';
import { useStudioStore } from '../state/useStudioStore';
import { Button, Card, EmptyState, IconButton, MutedText, PageHeader, StatusText } from '../ui';

type GalleryMode = 'threads' | 'flat';
type GalleryTab = 'latest' | 'variations' | 'remixTree' | 'all';

interface GalleryTreeNode {
  image: StudioImage;
  depth: number;
  rootId: string;
  isSeed: boolean;
}

interface PromptThread {
  id: string;
  prompt: string;
  latestPromptImage: StudioImage;
  latestActivityImage: StudioImage;
  variations: StudioImage[];
  remixNodes: GalleryTreeNode[];
  remixes: StudioImage[];
  allImages: StudioImage[];
  totalCost: number;
}

const BASE_DETAIL_TABS: Array<{ id: GalleryTab; label: string }> = [
  { id: 'latest', label: 'Neueste' },
  { id: 'variations', label: 'Runs' },
  { id: 'remixTree', label: 'Remixes' },
  { id: 'all', label: 'Alle' }
];

export function GalleryView() {
  const search = useStudioStore((state) => state.gallerySearch);
  const activeProjectId = useStudioStore((state) => state.activeProjectId);
  const setSearch = useStudioStore((state) => state.setGallerySearch);
  const selectedImageId = useStudioStore((state) => state.selectedImageId);
  const setSelectedImageId = useStudioStore((state) => state.setSelectedImageId);
  const setInspectorCollapsed = useStudioStore((state) => state.setInspectorCollapsed);

  const queryClient = useQueryClient();
  const { data: projects } = useProjects();
  const activeProject = projects?.find((project) => project.id === activeProjectId) ?? null;
  const { data: images, isLoading } = useGalleryImages(search, activeProjectId);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [galleryMode, setGalleryMode] = useState<GalleryMode>('threads');
  const [detailTab, setDetailTab] = useState<GalleryTab>('latest');
  const [status, setStatus] = useState<string | null>(null);

  const sortedImages = useMemo(() => sortByNewest(images ?? []), [images]);
  const threads = useMemo(() => buildPromptThreads(images ?? []), [images]);

  const activeThread = useMemo(() => {
    if (!threads.length) {
      return null;
    }

    if (!activeThreadId) {
      return threads[0];
    }

    return threads.find((thread) => thread.id === activeThreadId) ?? threads[0];
  }, [activeThreadId, threads]);
  const showThreadList = threads.length > 1;

  const activeVariationIdSet = useMemo(() => {
    return new Set(activeThread?.variations.map((image) => image.id) ?? []);
  }, [activeThread]);
  const detailTabCounts = useMemo(() => {
    if (!activeThread) {
      return {
        latest: 0,
        variations: 0,
        remixTree: 0,
        all: 0
      };
    }

    return {
      latest: 1,
      variations: activeThread.variations.length,
      remixTree: activeThread.remixes.length,
      all: activeThread.allImages.length
    };
  }, [activeThread]);
  const detailTabs = useMemo(() => {
    return BASE_DETAIL_TABS.filter((tab) => {
      if (tab.id === 'remixTree') {
        return detailTabCounts.remixTree > 0;
      }
      return true;
    });
  }, [detailTabCounts.remixTree]);

  useEffect(() => {
    if (!threads.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keep thread selection valid when list empties
      setActiveThreadId(null);
      return;
    }

    const exists = activeThreadId ? threads.some((thread) => thread.id === activeThreadId) : false;
    if (!exists) {
      setActiveThreadId(threads[0].id);
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    if (!activeThread || galleryMode !== 'threads') {
      return;
    }

    if (selectedImageId && !activeThread.allImages.some((image) => image.id === selectedImageId)) {
      setSelectedImageId(activeThread.latestPromptImage.id);
      setInspectorCollapsed(false);
    }
  }, [activeThread, galleryMode, selectedImageId, setInspectorCollapsed, setSelectedImageId]);

  useEffect(() => {
    if (!detailTabs.some((tab) => tab.id === detailTab)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset invalid tab when available tabs change
      setDetailTab('latest');
    }
  }, [detailTab, detailTabs]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['studio', 'images'] });
    await queryClient.invalidateQueries({ queryKey: ['studio', 'image'] });
    await queryClient.invalidateQueries({ queryKey: ['studio', 'projects'] });
  };

  const onToggleFavorite = async (imageId: string) => {
    await window.studio.toggleFavorite(imageId);
    await refresh();
  };

  const onDelete = async (imageId: string) => {
    const shouldDelete = window.confirm('Bild wirklich loeschen? Dieser Eintrag wird aus der Galerie ausgeblendet.');
    if (!shouldDelete) {
      return;
    }

    await window.studio.deleteImage(imageId);
    if (selectedImageId === imageId) {
      setSelectedImageId(null);
      setInspectorCollapsed(true);
    }
    await refresh();
  };

  const onDownload = async (imageId: string) => {
    const result = await window.studio.downloadImage(imageId);
    if (result.cancelled) {
      return;
    }

    if (result.success && result.filePath) {
      setStatus(`Gespeichert unter ${result.filePath}`);
      return;
    }

    setStatus(result.error ?? 'Bild konnte nicht gespeichert werden.');
  };

  const formatCost = (value: number | null) => `$${(value ?? 0).toFixed(3)}`;
  const formatCount = (value: number, singular: string, plural: string) =>
    `${value} ${value === 1 ? singular : plural}`;

  const openImageInInspector = (imageId: string) => {
    setSelectedImageId(imageId);
    setInspectorCollapsed(false);
  };

  const toggleImageSelection = (imageId: string) => {
    if (selectedImageId === imageId) {
      setSelectedImageId(null);
      setInspectorCollapsed(true);
      return;
    }

    openImageInInspector(imageId);
  };

  const renderImageCard = (image: StudioImage, options?: { hidePrompt?: boolean }) => {
    const isSelected = selectedImageId === image.id;

    return (
      <Card
        key={image.id}
        className={`mb-2 break-inside-avoid overflow-hidden rounded-md border bg-surface-primary shadow-sm ${
          isSelected ? 'border-border-focus-token' : 'border-border-token hover:border-border-heavy-token'
        }`}
      >
        <Button
          className="block w-full rounded-none border-0 bg-transparent p-0 text-left hover:border-0 hover:bg-transparent active:border-0 active:bg-transparent focus-visible:outline focus-visible:outline-1 focus-visible:outline-border-focus-token focus-visible-outline-offset-neg1"
          variant="ghost"
          onClick={() => toggleImageSelection(image.id)}
          aria-pressed={isSelected}
          aria-label={isSelected ? 'Bildauswahl aufheben' : 'Bild im Inspektor anzeigen'}
        >
          <img
            src={image.thumbUrl ?? image.fileUrl}
            alt={image.prompt}
            loading="lazy"
            className="block w-full bg-surface-secondary"
          />
          <div className={`grid p-1.75 ${options?.hidePrompt ? 'gap-1' : 'gap-1.5'}`}>
            {options?.hidePrompt ? null : <p title={image.prompt}>{image.prompt}</p>}
            <div className="flex items-center gap-1">
              <span className="rounded-xs border border-border-light-token bg-surface-secondary px-1 py-0.5 font-mono text-xs">
                {image.resolution ?? '1K'}
              </span>
              <span className="rounded-xs border border-border-light-token bg-surface-secondary px-1 py-0.5 font-mono text-xs">
                {image.aspectRatio ?? '1:1'}
              </span>
              <span className="rounded-xs border border-border-light-token bg-surface-secondary px-1 py-0.5 font-mono text-xs">
                {formatCost(image.costEstimate)}
              </span>
            </div>
          </div>
        </Button>
        <div className="flex items-center justify-end gap-1 px-1.75 pb-1.75">
          <IconButton
            icon={<Download size={15} />}
            label="Bild herunterladen"
            className="min-h-7 min-w-7 p-0.8 text-sm"
            onClick={() => void onDownload(image.id)}
          />
          <IconButton
            icon={image.isFavorite ? <StarOff size={15} /> : <Star size={15} />}
            label={image.isFavorite ? 'Favorit entfernen' : 'Favorisieren'}
            title={image.isFavorite ? 'Favorit entfernen' : 'Favorisieren'}
            className="min-h-7 min-w-7 p-0.8 text-sm"
            onClick={() => void onToggleFavorite(image.id)}
          />
          <IconButton
            icon={<Trash2 size={15} />}
            label="Bild löschen"
            className="min-h-7 min-w-7 p-0.8 text-sm"
            onClick={() => void onDelete(image.id)}
          />
        </div>
      </Card>
    );
  };

  return (
    <section className="grid min-h-0 gap-3">
      <PageHeader
        className="flex-wrap items-start"
        title={activeProject ? `${activeProject.name} Galerie` : 'Galerie'}
        actions={
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border-token" role="tablist" aria-label="Galerie-Ansicht">
              <Button
                variant="ghost"
                size="sm"
                icon
                className={`min-h-8 min-w-8.5 rounded-none border-0 border-r border-border-light-token px-1.2 py-0.9 ${
                  galleryMode === 'threads' ? 'active bg-btn-secondary' : ''
                }`}
                onClick={() => setGalleryMode('threads')}
                aria-label="Gruppierte Ansicht"
                title="Gruppierte Ansicht"
              >
                <ListTree size={15} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon
                className={`min-h-8 min-w-8.5 rounded-none border-0 px-1.2 py-0.9 ${
                  galleryMode === 'flat' ? 'active bg-btn-secondary' : ''
                }`}
                onClick={() => setGalleryMode('flat')}
                aria-label="Flache Ansicht"
                title="Flache Ansicht"
              >
                <Grid2x2 size={15} />
              </Button>
            </div>
            <input
              type="search"
              value={search}
              className="w-gallery-search min-w-0 max-w-420px"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Suche in Prompts und Text..."
            />
          </div>
        }
      />

      {isLoading ? <MutedText>Galerie wird geladen...</MutedText> : null}
      {status ? <StatusText>{status}</StatusText> : null}
      {!activeProjectId ? <MutedText>Wähle ein Projekt, um dessen Galerie zu sehen.</MutedText> : null}

      {!isLoading && activeProjectId && sortedImages.length === 0 ? (
        <EmptyState title="Noch keine Prompts" description="Wechsle zu Erstellen und sende deinen ersten Prompt." />
      ) : null}

      {!isLoading && activeProjectId && sortedImages.length > 0 && galleryMode === 'flat' ? (
        <div className="cols-gap-2 cols-3-240">{sortedImages.map((image) => renderImageCard(image))}</div>
      ) : null}

      {!isLoading && activeProjectId && threads.length > 0 && galleryMode === 'threads' ? (
        <div
          className={`grid min-h-0 gap-2 ${
            showThreadList ? 'grid-cols-thread-layout' : 'grid-cols-1'
          }`}
        >
          {showThreadList ? (
            <aside className="grid min-h-0 content-start gap-1.25 rounded-md border border-border-token bg-surface-primary p-1.5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3>Prompts</h3>
                <span className="font-mono text-sm text-fg-tertiary">
                  {threads.length}
                </span>
              </div>

              <div className="grid min-h-0 content-start gap-0.9 overflow-auto pr-0.4">
                {threads.map((thread) => {
                  const remixCount = thread.remixes.length;
                  return (
                    <Button
                      variant="ghost"
                      key={thread.id}
                      className={`grid grid-cols-thumb-content items-center gap-1.2 rounded-md border px-1 py-1 text-left ${
                        activeThread?.id === thread.id
                          ? 'active border-border-token bg-btn-secondary'
                          : 'border-transparent bg-transparent hover:border-border-light-token hover:bg-btn-secondary-hover'
                      }`}
                      onClick={() => {
                        setActiveThreadId(thread.id);
                        setDetailTab('latest');
                        openImageInInspector(thread.latestPromptImage.id);
                      }}
                    >
                      <img
                        src={thread.latestPromptImage.thumbUrl ?? thread.latestPromptImage.fileUrl}
                        alt={thread.prompt}
                        loading="lazy"
                        className="h-18 w-full rounded-sm border border-border-light-token object-cover"
                      />
                      <div className="grid gap-0.75">
                        <div className="flex items-start justify-between gap-1">
                          <p className="line-clamp-2 text-sm text-fg" title={thread.prompt}>
                            {thread.prompt}
                          </p>
                          <span className="shrink-0 text-xs text-fg-tertiary">
                            {formatDateTime(thread.latestActivityImage.createdAt)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                          <span className="rounded-full border border-border-light-token bg-btn-tertiary px-0.75 text-xs text-fg-secondary">
                            {formatCount(thread.variations.length, 'Run', 'Runs')}
                          </span>
                          <span className="rounded-full border border-border-light-token bg-btn-tertiary px-0.75 text-xs text-fg-secondary">
                            {formatCount(remixCount, 'Remix', 'Remixe')}
                          </span>
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </aside>
          ) : null}

          <section className="grid min-h-0 content-start gap-1.5 rounded-md border border-border-token bg-surface-primary p-1.75 shadow-sm">
            {activeThread ? (
              <>
                <div className="grid gap-1">
                  <h3 title={activeThread.prompt}>{activeThread.prompt}</h3>
                  <div className="grid grid-cols-4 gap-0.9 max-1000:grid-cols-2">
                    <span className="grid gap-0.5 rounded-sm border border-border-light-token bg-surface-secondary px-0.9 py-0.7">
                      <small>Aktivität</small>
                      <strong>{formatDateTime(activeThread.latestActivityImage.createdAt)}</strong>
                    </span>
                    <span className="grid gap-0.5 rounded-sm border border-border-light-token bg-surface-secondary px-0.9 py-0.7">
                      <small>Runs</small>
                      <strong>{activeThread.variations.length}</strong>
                    </span>
                    <span className="grid gap-0.5 rounded-sm border border-border-light-token bg-surface-secondary px-0.9 py-0.7">
                      <small>Remixes</small>
                      <strong>{activeThread.remixes.length}</strong>
                    </span>
                    <span className="grid gap-0.5 rounded-sm border border-border-light-token bg-surface-secondary px-0.9 py-0.7">
                      <small>Kosten</small>
                      <strong>{formatCost(activeThread.totalCost)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-0.75" role="tablist" aria-label="Thread-Ansichten">
                  {detailTabs.map((tab) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      key={tab.id}
                      className={`flex items-center gap-0.6 rounded-md border px-1.2 py-0.8 ${
                        detailTab === tab.id
                          ? 'active border-border-token bg-btn-secondary'
                          : 'border-transparent bg-transparent'
                      }`}
                      onClick={() => setDetailTab(tab.id)}
                    >
                      <span>{tab.label}</span>
                      <span className="rounded-full border border-border-light-token bg-surface-secondary px-0.7 text-xs">
                        {tab.id === 'latest'
                          ? detailTabCounts.latest
                          : tab.id === 'variations'
                            ? detailTabCounts.variations
                            : tab.id === 'remixTree'
                            ? detailTabCounts.remixTree
                              : detailTabCounts.all}
                      </span>
                    </Button>
                  ))}
                </div>

                {detailTab === 'latest' ? (
                  <div>{renderImageCard(activeThread.latestPromptImage, { hidePrompt: true })}</div>
                ) : null}

                {detailTab === 'variations' ? (
                  <div className="cols-gap-2 cols-3-240">
                    {activeThread.variations.map((image) => renderImageCard(image))}
                  </div>
                ) : null}

                {detailTab === 'all' ? (
                  <div className="cols-gap-2 cols-3-240">
                    {activeThread.allImages.map((image) => renderImageCard(image))}
                  </div>
                ) : null}

                {detailTab === 'remixTree' ? (
                  <div className="grid content-start gap-1.25 pb-1">
                    {activeThread.remixNodes.length === 0 ? (
                      <MutedText>In diesem Thread gibt es noch keine Remixes.</MutedText>
                    ) : (
                      activeThread.remixNodes.map((node) => {
                        const image = node.image;
                        const isPromptRun = activeVariationIdSet.has(image.id);

                        return (
                          <Button
                            variant="ghost"
                            key={`${node.rootId}-${image.id}`}
                            className={`grid w-minus-2px grid-cols-thumb-content-sm items-center gap-1.25 rounded-md border px-1.1 py-1.1 text-left ${
                              selectedImageId === image.id
                                ? 'active border-border-focus-token bg-surface-secondary'
                                : 'border-border-light-token bg-surface-secondary'
                            }`}
                            style={{ marginInlineStart: `${node.depth * 16}px` }}
                            onClick={() => toggleImageSelection(image.id)}
                          >
                            <img
                              src={image.thumbUrl ?? image.fileUrl}
                              alt={image.prompt}
                              loading="lazy"
                              className="h-18 w-full rounded-sm border border-border-light-token object-cover"
                            />
                            <div className="grid gap-0.8">
                              <div className="flex items-center justify-between gap-1.25">
                                <span className="text-xs text-fg-secondary">
                                  {isPromptRun ? 'Run' : `Remix-Tiefe ${node.depth}`}
                                </span>
                                <span className="font-mono text-sm text-fg-tertiary">
                                  {formatDateTime(image.createdAt)}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-sm text-fg-secondary" title={image.prompt}>
                                {image.prompt}
                              </p>
                              <div className="flex items-center gap-1">
                                <span className="rounded-xs border border-border-light-token bg-surface-secondary px-1 py-0.5 font-mono text-xs">
                                  {image.resolution ?? '1K'}
                                </span>
                                <span className="rounded-xs border border-border-light-token bg-surface-secondary px-1 py-0.5 font-mono text-xs">
                                  {image.aspectRatio ?? '1:1'}
                                </span>
                                <span className="rounded-xs border border-border-light-token bg-surface-secondary px-1 py-0.5 font-mono text-xs">
                                  {formatCost(image.costEstimate)}
                                </span>
                              </div>
                            </div>
                          </Button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <MutedText>Wähle einen Prompt, um Variationen und Remixes zu prüfen.</MutedText>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildPromptThreads(images: StudioImage[]): PromptThread[] {
  if (images.length === 0) {
    return [];
  }

  const imageById = new Map(images.map((image) => [image.id, image] as const));
  const childrenByParentId = new Map<string, StudioImage[]>();
  const promptMap = new Map<string, StudioImage[]>();

  images.forEach((image) => {
    const promptKey = normalizePrompt(image.prompt);
    const promptImages = promptMap.get(promptKey) ?? [];
    promptImages.push(image);
    promptMap.set(promptKey, promptImages);

    if (image.parentId) {
      const children = childrenByParentId.get(image.parentId) ?? [];
      children.push(image);
      childrenByParentId.set(image.parentId, children);
    }
  });

  const threads: PromptThread[] = [];

  promptMap.forEach((promptImages, promptKey) => {
    const variations = sortByNewest(promptImages);
    const variationIdSet = new Set(variations.map((image) => image.id));
    const remixTree = buildRemixTree(variations, childrenByParentId);

    const remixes = uniqById(
      remixTree
        .map((node) => node.image)
        .filter((image) => !variationIdSet.has(image.id) && imageById.has(image.id))
    );

    const allImages = sortByNewest(uniqById([...variations, ...remixes]));
    const latestPromptImage = variations[0];
    const latestActivityImage = allImages[0] ?? latestPromptImage;

    if (!latestPromptImage) {
      return;
    }

    threads.push({
      id: promptKey,
      prompt: latestPromptImage.prompt,
      latestPromptImage,
      latestActivityImage,
      variations,
      remixNodes: remixTree,
      remixes,
      allImages,
      totalCost: allImages.reduce((sum, image) => sum + (image.costEstimate ?? 0), 0)
    });
  });

  return threads.sort(
    (a, b) => Date.parse(b.latestActivityImage.createdAt) - Date.parse(a.latestActivityImage.createdAt)
  );
}

function buildRemixTree(
  seedImages: StudioImage[],
  childrenByParentId: Map<string, StudioImage[]>
): GalleryTreeNode[] {
  const nodes: GalleryTreeNode[] = [];
  const visited = new Set<string>();

  const walk = (image: StudioImage, depth: number, rootId: string) => {
    if (visited.has(image.id)) {
      return;
    }

    visited.add(image.id);
    nodes.push({
      image,
      depth,
      rootId,
      isSeed: depth === 0
    });

    const children = sortByNewest(childrenByParentId.get(image.id) ?? []);
    children.forEach((child) => {
      walk(child, depth + 1, rootId);
    });
  };

  sortByNewest(seedImages).forEach((seed) => {
    walk(seed, 0, seed.id);
  });

  return nodes;
}

function sortByNewest(images: StudioImage[]): StudioImage[] {
  return [...images].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function uniqById(images: StudioImage[]): StudioImage[] {
  const map = new Map<string, StudioImage>();
  images.forEach((image) => {
    map.set(image.id, image);
  });
  return Array.from(map.values());
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ').toLowerCase();
}

function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat('de-DE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
