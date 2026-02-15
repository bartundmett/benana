import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Images,
  KeyRound,
  ShieldCheck,
  Sparkles,
  type LucideIcon
} from 'lucide-react';

import type { ModelName } from '../../shared/types';
import { useStudioStore } from '../state/useStudioStore';
import { Button, StatusText } from '../ui';

interface OnboardingSlide {
  title: string;
  body: string;
  eyebrow: string;
  icon: LucideIcon;
}

const SLIDES: OnboardingSlide[] = [
  {
    eyebrow: 'Workspace',
    icon: Sparkles,
    title: 'Willkommen bei Benana',
    body: 'Ein lokaler Desktop-Arbeitsbereich für Gemini-Bildgenerierung und -Bearbeitung.'
  },
  {
    eyebrow: 'Sicherheit',
    icon: KeyRound,
    title: 'Eigenen API-Schlüssel verwenden',
    body: 'Dein Schlüssel wird lokal gespeichert. Dateien und Metadaten bleiben auf deinem Gerät.'
  },
  {
    eyebrow: 'Workflow',
    icon: Images,
    title: 'Galerie-zentrierter Workflow',
    body: 'Generieren, iterieren, versionieren und exportieren in einer persistenten Studio-Galerie.'
  }
];

export function OnboardingFlow() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<ModelName>('gemini-3-pro-image-preview');
  const [validationState, setValidationState] = useState<
    'idle' | 'validating' | 'valid' | 'invalid' | 'saving'
  >('idle');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const setConfig = useStudioStore((state) => state.setConfig);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const activeSlide = SLIDES[slideIndex];
  const ActiveSlideIcon = activeSlide.icon;
  const slideProgress = `${((slideIndex + 1) / SLIDES.length) * 100}%`;

  const canSubmit = useMemo(() => {
    return apiKey.trim().length > 0 && validationState !== 'saving' && validationState !== 'validating';
  }, [apiKey, validationState]);

  const onValidate = async () => {
    setValidationState('validating');
    try {
      const result = await window.studio.validateApiKey(apiKey.trim());
      setValidationState(result.valid ? 'valid' : 'invalid');
      setValidationMessage(result.message);
    } catch (error) {
      setValidationState('invalid');
      setValidationMessage(error instanceof Error ? error.message : 'API-Schluessel konnte nicht geprueft werden.');
    }
  };

  const onStartStudio = async () => {
    if (!apiKey.trim()) {
      setValidationState('invalid');
      setValidationMessage('Bitte zuerst einen Gemini-API-Schlüssel eingeben.');
      return;
    }

    setValidationState('saving');

    try {
      if (validationState !== 'valid') {
        const validated = await window.studio.validateApiKey(apiKey.trim());
        if (!validated.valid) {
          setValidationState('invalid');
          setValidationMessage(validated.message);
          return;
        }
      }

      await window.studio.setApiKey(apiKey.trim());
      const config = await window.studio.updateConfig({
        defaultModel: model,
        onboardingCompleted: true
      });

      setValidationState('valid');
      setValidationMessage('API-Schluessel ist gueltig.');
      setConfig(config);
      setActiveView('create');
    } catch (error) {
      setValidationState('invalid');
      setValidationMessage(error instanceof Error ? error.message : 'Studio konnte nicht gestartet werden.');
    }
  };

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden p-4 max-900:p-3">
      <div className="pointer-events-none absolute inset-0 -z-30 bg-main-surface" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(90%_80%_at_8%_0%,rgba(51,156,255,0.24)_0%,transparent_62%),radial-gradient(86%_78%_at_100%_100%,rgba(64,201,119,0.19)_0%,transparent_60%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:26px_26px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 -top-20 -z-10 h-72 w-72 rounded-full bg-[rgba(51,156,255,0.44)] blur-[85px] motion-safe:animate-pulse"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-28 -right-24 -z-10 h-72 w-72 rounded-full bg-[rgba(64,201,119,0.36)] blur-[90px] motion-safe:animate-pulse"
        aria-hidden
      />

      <div className="relative isolate grid w-full max-w-[1020px] min-h-[min(640px,90vh)] overflow-hidden rounded-[24px] border border-border-light-token bg-surface-primary/60 shadow-[0_36px_88px_-24px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-sat-108-blur-18 [grid-template-columns:minmax(0,1.08fr)_minmax(0,0.92fr)] max-900:grid-cols-1">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(148deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_40%)]"
          aria-hidden
        />
        <section className="flex flex-col gap-5 border-r border-border-light-token bg-surface-secondary/55 p-8 max-900:border-r-0 max-900:border-b max-900:p-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-border-light-token bg-btn-secondary px-2.5 py-1 text-[11px] font-550 tracking-004 text-fg-secondary uppercase">
              {slideIndex + 1} / {SLIDES.length}
            </span>
          </div>

          <div className="grid gap-2.5" key={activeSlide.title}>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-light-token bg-accent-bg text-accent-on shadow-[0_12px_22px_-14px_rgba(51,156,255,0.75)]" aria-hidden>
              <ActiveSlideIcon size={20} />
            </span>
            <p className="text-[11px] font-560 tracking-[0.11em] text-fg-tertiary uppercase">{activeSlide.eyebrow}</p>
            <h1 className="max-w-[18ch] [font-family:'Avenir_Next','SF_Pro_Display','Segoe_UI',sans-serif] text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.06] tracking-[-0.028em]">
              {activeSlide.title}
            </h1>
            <p className="max-w-[48ch] text-[clamp(0.98rem,1.4vw,1.1rem)] leading-relaxed text-fg-secondary">
              {activeSlide.body}
            </p>
          </div>

          <div className="h-2 overflow-hidden rounded-full border border-border-light-token bg-btn-secondary" aria-hidden>
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#339cff_0%,#48d1ff_55%,#40c977_100%)] shadow-[0_0_24px_rgba(51,156,255,0.5)] transition-[width] duration-300 ease-smooth-app"
              style={{ width: slideProgress }}
            />
          </div>

          <div className="mt-auto grid grid-cols-3 gap-2 max-900:grid-cols-1" aria-label="Onboarding-Navigation">
            {SLIDES.map((slide, index) => {
              const SlideIcon = slide.icon;
              return (
                <button
                  key={slide.title}
                  type="button"
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-550 transition-all duration-200 ${
                    index === slideIndex
                      ? 'border-[rgba(51,156,255,0.45)] bg-accent-bg text-accent-on shadow-[0_10px_24px_-16px_rgba(51,156,255,0.9)]'
                      : 'border-border-light-token bg-btn-secondary text-fg-secondary hover:border-border-token hover:bg-btn-secondary-hover hover:text-fg'
                  }`}
                  onClick={() => setSlideIndex(index)}
                  aria-label={`Zu Folie ${index + 1} wechseln`}
                  aria-current={index === slideIndex ? 'step' : undefined}
                >
                  <SlideIcon size={14} aria-hidden />
                  <span>{slide.eyebrow}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3.5 bg-surface-primary/35 p-8 max-900:p-4">
          <div className="grid gap-1">
            <h2 className="[font-family:'Avenir_Next','SF_Pro_Display','Segoe_UI',sans-serif] text-[clamp(1.2rem,2vw,1.6rem)] tracking-[-0.02em]">
              In unter einer Minute startklar
            </h2>
            <p className="text-fg-secondary">Gemini verbinden, Standardmodell setzen, direkt loslegen.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-light-token bg-btn-secondary px-2.25 py-1 text-[11px] text-fg-secondary">
              <ShieldCheck size={14} aria-hidden />
              Lokal gespeichert
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-light-token bg-btn-secondary px-2.25 py-1 text-[11px] text-fg-secondary">
              <KeyRound size={14} aria-hidden />
              Kein Cloud-Sync
            </span>
          </div>

          <div className="grid gap-3.5">
            <label htmlFor="api-key" className="grid gap-1.5">
              Gemini-API-Schlüssel
              <input
                id="api-key"
                type="password"
                placeholder="AIza..."
                className="min-h-[42px] bg-surface-secondary/80"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setValidationState('idle');
                  setValidationMessage(null);
                }}
              />
            </label>

            <label htmlFor="default-model" className="grid gap-1.5">
              Standardmodell
                <select
                  id="default-model"
                className="min-h-[42px] bg-surface-secondary/80"
                value={model}
                onChange={(event) => setModel(event.target.value as ModelName)}
              >
                <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image</option>
                <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5 max-900:grid-cols-1">
            <Button onClick={() => void onValidate()} disabled={!canSubmit} className="justify-center">
              {validationState === 'validating' ? 'Wird geprüft...' : 'Schlüssel prüfen'}
            </Button>
            <Button
              variant="primary"
              onClick={() => void onStartStudio()}
              disabled={!canSubmit}
              className="justify-center gap-1.5"
            >
              {validationState === 'saving' ? (
                'Startet...'
              ) : (
                <>
                  Studio starten
                  <ArrowRight size={14} aria-hidden />
                </>
              )}
            </Button>
          </div>

          <Button
            variant="link"
            className="w-fit gap-1.5 text-fg-secondary hover:text-fg"
            onClick={() => void window.studio.openExternal('https://aistudio.google.com/apikey')}
          >
            <ExternalLink size={14} aria-hidden />
            Google AI Studio öffnen
          </Button>

          <div className="min-h-5" role="status" aria-live="polite">
            {validationMessage ? (
              <StatusText tone={validationState === 'invalid' ? 'error' : 'default'}>{validationMessage}</StatusText>
            ) : (
              <p className="text-sm text-fg-tertiary">Dein API-Schlüssel bleibt ausschließlich auf diesem Gerät.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
