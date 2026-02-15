import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Download, Sparkles, Star, StarOff, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import { useSelectedImage } from '../hooks/useStudioData';
import { useStudioStore } from '../state/useStudioStore';
import { Button, IconButton, StatusText } from '../ui';

export function InspectorPanel() {
  const selectedImageId = useStudioStore((state) => state.selectedImageId);
  const setSelectedImageId = useStudioStore((state) => state.setSelectedImageId);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const setPendingRemix = useStudioStore((state) => state.setPendingRemix);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: selectedImage } = useSelectedImage(selectedImageId);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['studio', 'images'] });
    await queryClient.invalidateQueries({ queryKey: ['studio', 'image'] });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close stale preview when selection changes
    setPreviewOpen(false);
  }, [selectedImageId]);

  useEffect(() => {
    if (!previewOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [previewOpen]);

  if (!selectedImageId || !selectedImage) {
    return (
      <aside className="grid min-h-full content-start gap-2 overflow-auto rounded-lg border border-border-token bg-surface-secondary p-2.25 text-fg-secondary shadow-sm backdrop-sat-108-blur-10">
        <h2>Inspektor</h2>
        <p>Wähle ein Bild aus der Galerie, um Metadaten und Aktionen zu sehen.</p>
      </aside>
    );
  }

  const previewModal =
    previewOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-160 grid place-items-center bg-overlay-68 p-4 backdrop-blur-5"
            role="dialog"
            aria-modal="true"
            aria-label="Bildvorschau"
            onClick={() => setPreviewOpen(false)}
          >
            <div className="relative grid max-h-90vh w-inspector-preview" onClick={(event) => event.stopPropagation()}>
              <IconButton
                icon={<X size={16} />}
                label="Vorschau schließen"
                className="absolute right-1.5 top-1.5 min-h-8 min-w-8 rounded-lg border-border-token bg-overlay-45"
                onClick={() => setPreviewOpen(false)}
                title="Schließen"
              />
              <img
                src={selectedImage.fileUrl}
                alt={selectedImage.prompt}
                className="max-h-90vh w-full rounded-lg border border-border-token bg-overlay-35 object-contain"
              />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <aside className="grid content-start gap-2 overflow-auto rounded-lg border border-border-token bg-surface-secondary p-2.25 shadow-sm backdrop-sat-108-blur-10">
      <h2>Inspektor</h2>
      <Button
        variant="ghost"
        className="w-full cursor-zoom-in overflow-hidden rounded-md border-0 bg-transparent p-0 hover:border-0 hover:bg-transparent focus-visible:border-0 focus-visible:bg-transparent"
        onClick={() => setPreviewOpen(true)}
        aria-label="Bild vergrößern"
        title="Bild vergrößern"
      >
        <img
          src={selectedImage.thumbUrl ?? selectedImage.fileUrl}
          alt={selectedImage.prompt}
          className="w-full rounded-md border border-border-token"
        />
      </Button>

      <dl className="grid gap-1.25">
        <div className="grid gap-0.5">
          <dt className="text-xs uppercase tracking-wider text-fg-secondary">
            Modell
          </dt>
          <dd className="m-0 text-base">{selectedImage.model}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs uppercase tracking-wider text-fg-secondary">
            Auflösung
          </dt>
          <dd className="m-0 text-base">{selectedImage.resolution ?? '1K'}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs uppercase tracking-wider text-fg-secondary">
            Seitenverhältnis
          </dt>
          <dd className="m-0 text-base">{selectedImage.aspectRatio ?? '1:1'}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs uppercase tracking-wider text-fg-secondary">
            Kosten
          </dt>
          <dd className="m-0 text-base">${(selectedImage.costEstimate ?? 0).toFixed(3)}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs uppercase tracking-wider text-fg-secondary">
            Prompt
          </dt>
          <dd className="m-0 text-base">{selectedImage.prompt}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-1">
        <IconButton
          icon={<Download size={15} />}
          label="Bild herunterladen"
          onClick={async () => {
            const result = await window.studio.downloadImage(selectedImage.id);
            if (result.cancelled) {
              return;
            }

            if (result.success && result.filePath) {
              setStatus(`Gespeichert unter ${result.filePath}`);
              return;
            }

            setStatus(result.error ?? 'Bild konnte nicht gespeichert werden.');
          }}
        />

        <IconButton
          icon={selectedImage.isFavorite ? <StarOff size={15} /> : <Star size={15} />}
          label={selectedImage.isFavorite ? 'Favorit entfernen' : 'Favorisieren'}
          title={selectedImage.isFavorite ? 'Favorit entfernen' : 'Favorisieren'}
          onClick={async () => {
            await window.studio.toggleFavorite(selectedImage.id);
            await refresh();
          }}
        />

        <IconButton
          icon={<Trash2 size={15} />}
          label="Bild löschen"
          onClick={async () => {
            const shouldDelete = window.confirm(
              'Bild wirklich loeschen? Dieser Eintrag wird aus der Galerie ausgeblendet.'
            );
            if (!shouldDelete) {
              return;
            }

            await window.studio.deleteImage(selectedImage.id);
            setSelectedImageId(null);
            await refresh();
          }}
        />

        <IconButton
          icon={<Sparkles size={15} />}
          label="Prompt remixen"
          onClick={() => {
            const sourceImageName =
              selectedImage.filePath.split('/').filter(Boolean).at(-1) ?? `${selectedImage.id}.png`;
            setPendingRemix({
              prompt: selectedImage.prompt,
              sourceImageId: selectedImage.id,
              sourceImageUrl: selectedImage.fileUrl,
              sourceImageName
            });
            setActiveView('create');
          }}
        />
      </div>
      {status ? <StatusText>{status}</StatusText> : null}
      {previewModal}
    </aside>
  );
}
