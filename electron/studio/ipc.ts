import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import type {
  EnqueueResult,
  GenerationRequest,
  ProjectBrandAsset,
  PromptTemplate,
  SaveImageResult,
  StudioConfigPublic,
  StudioInitialState,
  StudioImage,
  StudioProject
} from '../../shared/types.js';
import { ConfigStore } from './config.js';
import { buildRelativePath, StudioDatabase } from './db.js';
import { GeminiClient } from './gemini-client.js';
import { isAbsoluteStudioPath, STUDIO_PATHS } from './paths.js';
import { estimateCost, GenerationQueue } from './queue.js';

interface StudioIpcServices {
  database: StudioDatabase;
  configStore: ConfigStore;
  queue: GenerationQueue;
  geminiClient: GeminiClient;
  onConfigChanged?: (config: StudioConfigPublic) => void;
}

const MAX_BRAND_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_BRAND_ASSET_UPLOAD_COUNT = 40;
const MAX_REFERENCE_IMAGES = 14;

const ALLOWED_CONFIG_PATCH_KEYS = new Set([
  'defaultModel',
  'theme',
  'onboardingCompleted',
  'queueConcurrency',
  'monthlySpendLimitUsd',
  'totalSpendLimitUsd'
]);

const ALLOWED_MODELS = new Set([
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview'
]);

const ALLOWED_ASPECT_RATIOS = new Set([
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '1:4',
  '1:8',
  '4:1',
  '8:1',
  '9:16',
  '16:9',
  '21:9'
]);

const ALLOWED_RESOLUTIONS = new Set(['512px', '1K', '2K', '4K']);
const ALLOWED_THINKING_LEVELS = new Set(['none', 'low', 'medium', 'high']);
const ALLOWED_REFERENCE_LABELS = new Set(['person', 'object', 'style']);
const ALLOWED_RESPONSE_MODALITIES = new Set(['TEXT', 'IMAGE']);

export function registerStudioIpcHandlers(services: StudioIpcServices): void {
  const { database, configStore, queue, geminiClient, onConfigChanged } = services;

  const emitToRenderers = (channel: string): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) {
        continue;
      }
      window.webContents.send(channel);
    }
  };

  ipcMain.handle('studio:get-initial-state', (): StudioInitialState => {
    return {
      config: configStore.getPublicConfig(),
      images: database.listImages({ limit: 400 }),
      queue: queue.listJobs(200),
      projects: database.listProjects()
    };
  });

  ipcMain.handle('studio:config:get', (): StudioConfigPublic => {
    return configStore.getPublicConfig();
  });

  ipcMain.handle(
    'studio:config:update',
    (
      _,
      patch: unknown
    ): StudioConfigPublic => {
      const validatedPatch = parseConfigPatch(patch);
      const updated = configStore.updateConfig(validatedPatch);
      queue.setConcurrency(updated.queueConcurrency);
      onConfigChanged?.(updated);
      return updated;
    }
  );

  ipcMain.handle('studio:config:set-api-key', (_, apiKey: unknown): StudioConfigPublic => {
    if (typeof apiKey !== 'string') {
      throw new Error('API-Schluessel muss ein String sein.');
    }
    configStore.setApiKey(apiKey);
    const updated = configStore.getPublicConfig();
    onConfigChanged?.(updated);
    return updated;
  });

  ipcMain.handle('studio:config:clear-api-key', (): StudioConfigPublic => {
    configStore.clearApiKey();
    const updated = configStore.getPublicConfig();
    onConfigChanged?.(updated);
    return updated;
  });

  ipcMain.handle('studio:config:validate-api-key', async (_, apiKey: unknown) => {
    if (typeof apiKey !== 'string') {
      throw new Error('API-Schluessel muss ein String sein.');
    }
    return geminiClient.validateApiKey(apiKey);
  });

  ipcMain.handle(
    'studio:images:list',
    (_, options?: { search?: string; limit?: number; offset?: number; projectId?: string }) => {
      return database.listImages({
        search: options?.search,
        limit: options?.limit,
        offset: options?.offset,
        projectId: options?.projectId
      });
    }
  );

  ipcMain.handle('studio:images:get', (_, imageId: string): StudioImage | null => {
    return database.getImageById(imageId);
  });

  ipcMain.handle('studio:images:toggle-favorite', (_, imageId: string): StudioImage | null => {
    const updated = database.toggleFavorite(imageId);
    if (updated) {
      emitToRenderers('studio:images-updated');
    }
    return updated;
  });

  ipcMain.handle('studio:images:delete', (_, imageId: string): boolean => {
    database.softDeleteImage(imageId);
    emitToRenderers('studio:images-updated');
    emitToRenderers('studio:projects-updated');
    return true;
  });

  ipcMain.handle('studio:images:download', async (_, imageId: string): Promise<SaveImageResult> => {
    const image = database.getImageById(imageId);
    if (!image) {
      return {
        success: false,
        cancelled: false,
        error: 'Bild nicht gefunden.'
      };
    }

    let sourcePath = '';
    try {
      sourcePath = resolveStoredImagePath(image.filePath);
    } catch {
      return {
        success: false,
        cancelled: false,
        error: 'Ungueltiger Bildpfad.'
      };
    }

    if (!isPathInsideAllowedRoots(sourcePath, collectImageRoots(database))) {
      return {
        success: false,
        cancelled: false,
        error: 'Ungueltiger Bildpfad.'
      };
    }

    try {
      await fs.access(sourcePath);
    } catch {
      return {
        success: false,
        cancelled: false,
        error: 'Bilddatei existiert nicht auf dem Datentraeger.'
      };
    }

    const extension = path.extname(image.filePath) || '.png';
    const defaultFilename = createDefaultFilename(image.prompt, image.id, extension);
    const dialogResult = await dialog.showSaveDialog({
      title: 'Bild herunterladen',
      defaultPath: path.join(app.getPath('downloads'), defaultFilename),
      filters: [
        { name: 'PNG-Bild', extensions: ['png'] },
        { name: 'JPEG-Bild', extensions: ['jpg', 'jpeg'] },
        { name: 'WebP-Bild', extensions: ['webp'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    });

    if (dialogResult.canceled || !dialogResult.filePath) {
      return {
        success: false,
        cancelled: true
      };
    }

    try {
      await fs.copyFile(sourcePath, dialogResult.filePath);
      return {
        success: true,
        cancelled: false,
        filePath: dialogResult.filePath
      };
    } catch (error) {
      return {
        success: false,
        cancelled: false,
        error: error instanceof Error ? error.message : 'Bild konnte nicht gespeichert werden.'
      };
    }
  });

  ipcMain.handle('studio:queue:list', (): ReturnType<GenerationQueue['listJobs']> => {
    return queue.listJobs(200);
  });

  ipcMain.handle('studio:queue:enqueue', (_, request: unknown): EnqueueResult => {
    return queue.enqueue(parseGenerationRequestInput(request));
  });

  ipcMain.handle('studio:queue:pause', (): boolean => {
    queue.pause();
    return true;
  });

  ipcMain.handle('studio:queue:resume', (): boolean => {
    queue.resume();
    return true;
  });

  ipcMain.handle('studio:queue:cancel', (_, jobId: string): boolean => {
    return queue.cancel(jobId);
  });

  ipcMain.handle('studio:projects:list', (): StudioProject[] => {
    return database.listProjects();
  });

  ipcMain.handle(
    'studio:projects:pick-image-output-dir',
    async (_, currentPath?: string | null): Promise<string | null> => {
      const normalizedCurrentPath = typeof currentPath === 'string' ? currentPath.trim() : '';
      const fallbackPath =
        normalizedCurrentPath && isAbsoluteStudioPath(normalizedCurrentPath)
          ? path.resolve(normalizedCurrentPath)
          : STUDIO_PATHS.imagesOriginals;
      const dialogResult = await dialog.showOpenDialog({
        title: 'Bildordner wählen',
        defaultPath: fallbackPath,
        buttonLabel: 'Ordner auswählen',
        properties: ['openDirectory', 'createDirectory']
      });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return null;
      }

      return path.resolve(dialogResult.filePaths[0]);
    }
  );

  ipcMain.handle(
    'studio:projects:create',
    (
      _,
      input: {
        name: string;
        description?: string | null;
        systemPrompt?: string | null;
        brandGuidelines?: string | null;
        brandStrictMode?: boolean;
        imageOutputDir?: string | null;
      }
    ): StudioProject => {
      const name = input.name.trim();
      if (!name) {
        throw new Error('Projektname ist erforderlich.');
      }

      const created = database.createProject({
        id: randomUUID(),
        name,
        description: input.description?.trim() || null,
        systemPrompt: input.systemPrompt?.trim() || null,
        brandGuidelines: input.brandGuidelines?.trim() || null,
        brandStrictMode: Boolean(input.brandStrictMode),
        imageOutputDir: parseProjectImageOutputDir(input.imageOutputDir ?? null)
      });

      emitToRenderers('studio:projects-updated');
      return created;
    }
  );

  ipcMain.handle(
    'studio:projects:update',
    (
      _,
      input: {
        id: string;
        name: string;
        description?: string | null;
        systemPrompt?: string | null;
        brandGuidelines?: string | null;
        brandStrictMode?: boolean;
        imageOutputDir?: string | null;
      }
    ): StudioProject | null => {
      const name = input.name.trim();
      if (!name) {
        throw new Error('Projektname ist erforderlich.');
      }

      const updated = database.updateProject({
        id: input.id,
        name,
        description: input.description?.trim() || null,
        systemPrompt: input.systemPrompt?.trim() || null,
        brandGuidelines: input.brandGuidelines?.trim() || null,
        brandStrictMode: Boolean(input.brandStrictMode),
        imageOutputDir: parseProjectImageOutputDir(input.imageOutputDir ?? null)
      });

      if (updated) {
        emitToRenderers('studio:projects-updated');
      }

      return updated;
    }
  );

  ipcMain.handle('studio:projects:delete', (_, projectId: string): boolean => {
    const deleted = database.deleteProject(projectId);
    if (deleted) {
      emitToRenderers('studio:projects-updated');
      emitToRenderers('studio:brand-assets-updated');
      emitToRenderers('studio:prompts-updated');
      emitToRenderers('studio:images-updated');
    }
    return deleted;
  });

  ipcMain.handle('studio:project-brand-assets:list', (_, projectId: string): ProjectBrandAsset[] => {
    return database.listProjectBrandAssets(projectId);
  });

  ipcMain.handle(
    'studio:project-brand-assets:create',
    async (
      _,
      input: unknown
    ): Promise<ProjectBrandAsset[]> => {
      const parsedInput = parseProjectBrandAssetsCreateInput(input);
      const projectId = parsedInput.projectId.trim();
      if (!projectId) {
        throw new Error('Projekt-ID ist erforderlich.');
      }

      const project = database.getProjectById(projectId);
      if (!project) {
        throw new Error('Projekt wurde nicht gefunden.');
      }

      const uploads = parsedInput.assets;
      const created: ProjectBrandAsset[] = [];
      const createdAssetIds: string[] = [];
      const writtenPaths: string[] = [];

      try {
        for (const asset of uploads) {
          const mimeType = asset.mimeType.trim() || 'image/png';
          const dataBase64 = asset.dataBase64.trim();
          if (!dataBase64) {
            continue;
          }

          const id = randomUUID();
          const extension = extensionFromMimeType(mimeType);
          const relativePath = buildRelativePath(
            'projects',
            'brand-assets',
            `${projectId}-${id}.${extension}`
          );
          const absolutePath = path.join(STUDIO_PATHS.root, relativePath);
          if (!isPathInsideRoot(absolutePath, STUDIO_PATHS.root)) {
            throw new Error('Ungueltiger Brand-Asset-Pfad.');
          }

          const bytes = decodeBase64Payload(
            dataBase64,
            `Brand-Asset ${created.length + 1}`,
            MAX_BRAND_ASSET_BYTES
          );
          await fs.writeFile(absolutePath, bytes);
          writtenPaths.push(absolutePath);

          const createdAsset = database.insertProjectBrandAsset({
            id,
            projectId,
            name: asset.name.trim() || `Brand-Asset ${created.length + 1}`,
            mimeType,
            filePath: relativePath
          });
          created.push(createdAsset);
          createdAssetIds.push(createdAsset.id);
        }
      } catch (error) {
        for (const assetId of createdAssetIds) {
          database.deleteProjectBrandAsset(assetId);
        }
        await Promise.allSettled(writtenPaths.map((filePath) => fs.rm(filePath, { force: true })));
        throw error;
      }

      if (created.length > 0) {
        emitToRenderers('studio:projects-updated');
        emitToRenderers('studio:brand-assets-updated');
      }

      return created;
    }
  );

  ipcMain.handle('studio:project-brand-assets:delete', async (_, assetId: string): Promise<boolean> => {
    const deletedAsset = database.deleteProjectBrandAsset(assetId);
    if (!deletedAsset) {
      return false;
    }

    const absolutePath = path.join(STUDIO_PATHS.root, deletedAsset.filePath);
    if (isPathInsideRoot(absolutePath, STUDIO_PATHS.root)) {
      await fs.rm(absolutePath, { force: true });
    }

    emitToRenderers('studio:projects-updated');
    emitToRenderers('studio:brand-assets-updated');
    return true;
  });

  ipcMain.handle('studio:prompts:list', (_, projectId: string): PromptTemplate[] => {
    return database.listPrompts(projectId);
  });

  ipcMain.handle(
    'studio:prompts:create',
    (
      _,
      input: {
        projectId: string;
        name: string;
        template: string;
        variables?: string[];
        folder?: string | null;
      }
    ): PromptTemplate => {
      const name = input.name.trim();
      const template = input.template.trim();
      if (!name || !template) {
        throw new Error('Prompt-Name und Vorlage sind erforderlich.');
      }

      const created = database.createPrompt({
        id: randomUUID(),
        projectId: input.projectId,
        name,
        template,
        variables: input.variables?.filter((item) => item.trim().length > 0).map((item) => item.trim()) ?? [],
        folder: input.folder?.trim() || null
      });

      emitToRenderers('studio:prompts-updated');
      emitToRenderers('studio:projects-updated');
      return created;
    }
  );

  ipcMain.handle(
    'studio:prompts:update',
    (
      _,
      input: {
        id: string;
        name: string;
        template: string;
        variables?: string[];
        folder?: string | null;
      }
    ): PromptTemplate | null => {
      const name = input.name.trim();
      const template = input.template.trim();
      if (!name || !template) {
        throw new Error('Prompt-Name und Vorlage sind erforderlich.');
      }

      const updated = database.updatePrompt({
        id: input.id,
        name,
        template,
        variables: input.variables?.filter((item) => item.trim().length > 0).map((item) => item.trim()) ?? [],
        folder: input.folder?.trim() || null
      });

      if (updated) {
        emitToRenderers('studio:prompts-updated');
      }

      return updated;
    }
  );

  ipcMain.handle('studio:prompts:delete', (_, promptId: string): boolean => {
    const deleted = database.deletePrompt(promptId);
    if (deleted) {
      emitToRenderers('studio:prompts-updated');
      emitToRenderers('studio:projects-updated');
    }
    return deleted;
  });

  ipcMain.handle('studio:prompts:mark-used', (_, promptId: string): boolean => {
    database.markPromptUsed(promptId);
    emitToRenderers('studio:prompts-updated');
    return true;
  });

  ipcMain.handle('studio:usage:session-cost', (_, window: 'day' | 'month' | 'all' = 'day'): number => {
    return database.getSessionCost(window);
  });

  ipcMain.handle('studio:estimate-cost', (_, resolution?: GenerationRequest['resolution'], model?: GenerationRequest['model']): number => {
    return estimateCost(resolution, model);
  });

  ipcMain.handle('studio:shell:open-external', (_, url: string): Promise<void> => {
    const allowedUrl = parseAllowedExternalUrl(url);
    if (!allowedUrl) {
      throw new Error('Nur http(s)-Links sind erlaubt.');
    }

    return shell.openExternal(allowedUrl);
  });

  ipcMain.handle('studio:shell:show-item', (_, filePath: string): boolean => {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      return false;
    }

    const resolvedPath = path.resolve(filePath);
    const allowedRoots = new Set([...collectImageRoots(database), app.getPath('downloads')]);
    const isAllowed = Array.from(allowedRoots).some((root) => isPathInsideRoot(resolvedPath, root));
    if (!isAllowed) {
      return false;
    }

    shell.showItemInFolder(resolvedPath);
    return true;
  });
}

function createDefaultFilename(prompt: string, imageId: string, extension: string): string {
  const promptPrefix = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  const fallbackPrefix = promptPrefix.length > 0 ? promptPrefix : 'benana-image';
  return `${fallbackPrefix}-${imageId.slice(0, 8)}${extension}`;
}

function extensionFromMimeType(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('jpeg') || lower.includes('jpg')) {
    return 'jpg';
  }

  if (lower.includes('webp')) {
    return 'webp';
  }

  if (lower.includes('gif')) {
    return 'gif';
  }

  return 'png';
}

function parseConfigPatch(
  value: unknown
): Partial<
  Pick<
    StudioConfigPublic,
    'defaultModel' | 'theme' | 'onboardingCompleted' | 'queueConcurrency' | 'monthlySpendLimitUsd' | 'totalSpendLimitUsd'
  >
> {
  if (!isRecord(value)) {
    throw new Error('Konfigurations-Patch muss ein Objekt sein.');
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_CONFIG_PATCH_KEYS.has(key)) {
      throw new Error(`Unbekanntes Konfigurationsfeld: ${key}`);
    }
  }

  const patch: Partial<
    Pick<
      StudioConfigPublic,
      'defaultModel' | 'theme' | 'onboardingCompleted' | 'queueConcurrency' | 'monthlySpendLimitUsd' | 'totalSpendLimitUsd'
    >
  > = {};

  if (Object.prototype.hasOwnProperty.call(value, 'defaultModel')) {
    if (typeof value.defaultModel !== 'string' || !ALLOWED_MODELS.has(value.defaultModel)) {
      throw new Error('Ungueltiges Standardmodell.');
    }
    patch.defaultModel = value.defaultModel as StudioConfigPublic['defaultModel'];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'theme')) {
    if (value.theme !== 'dark' && value.theme !== 'light' && value.theme !== 'system') {
      throw new Error('Ungueltiges Theme.');
    }
    patch.theme = value.theme;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'onboardingCompleted')) {
    if (typeof value.onboardingCompleted !== 'boolean') {
      throw new Error('Ungueltiger Wert fuer onboardingCompleted.');
    }
    patch.onboardingCompleted = value.onboardingCompleted;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'queueConcurrency')) {
    if (
      typeof value.queueConcurrency !== 'number' ||
      !Number.isFinite(value.queueConcurrency) ||
      !Number.isInteger(value.queueConcurrency)
    ) {
      throw new Error('Ungueltiger Wert fuer queueConcurrency.');
    }
    patch.queueConcurrency = value.queueConcurrency;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'monthlySpendLimitUsd')) {
    if (
      value.monthlySpendLimitUsd !== null &&
      (typeof value.monthlySpendLimitUsd !== 'number' || !Number.isFinite(value.monthlySpendLimitUsd))
    ) {
      throw new Error('Ungueltiger Wert fuer monthlySpendLimitUsd.');
    }
    patch.monthlySpendLimitUsd = value.monthlySpendLimitUsd;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'totalSpendLimitUsd')) {
    if (
      value.totalSpendLimitUsd !== null &&
      (typeof value.totalSpendLimitUsd !== 'number' || !Number.isFinite(value.totalSpendLimitUsd))
    ) {
      throw new Error('Ungueltiger Wert fuer totalSpendLimitUsd.');
    }
    patch.totalSpendLimitUsd = value.totalSpendLimitUsd;
  }

  return patch;
}

function parseGenerationRequestInput(value: unknown): GenerationRequest {
  if (!isRecord(value)) {
    throw new Error('Generierungsanfrage muss ein Objekt sein.');
  }

  if (typeof value.model !== 'string' || !ALLOWED_MODELS.has(value.model)) {
    throw new Error('Ungueltiges Modell.');
  }

  if (typeof value.prompt !== 'string' || value.prompt.trim().length === 0) {
    throw new Error('Prompt ist erforderlich.');
  }

  const parsed: GenerationRequest = {
    model: value.model as GenerationRequest['model'],
    prompt: value.prompt
  };

  if (Object.prototype.hasOwnProperty.call(value, 'systemPrompt')) {
    if (value.systemPrompt != null && typeof value.systemPrompt !== 'string') {
      throw new Error('Ungueltiger System-Prompt.');
    }
    parsed.systemPrompt = value.systemPrompt as string | undefined;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'referenceImages')) {
    if (!Array.isArray(value.referenceImages)) {
      throw new Error('referenceImages muss ein Array sein.');
    }

    if (value.referenceImages.length > MAX_REFERENCE_IMAGES) {
      throw new Error(`Maximal ${MAX_REFERENCE_IMAGES} Referenzbilder erlaubt.`);
    }

    parsed.referenceImages = value.referenceImages.map((item, index) =>
      parseReferenceImagePayload(item, index)
    );
  }

  if (Object.prototype.hasOwnProperty.call(value, 'aspectRatio')) {
    if (value.aspectRatio != null && (typeof value.aspectRatio !== 'string' || !ALLOWED_ASPECT_RATIOS.has(value.aspectRatio))) {
      throw new Error('Ungueltiges Seitenverhaeltnis.');
    }
    parsed.aspectRatio = value.aspectRatio as GenerationRequest['aspectRatio'];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'resolution')) {
    if (value.resolution != null && (typeof value.resolution !== 'string' || !ALLOWED_RESOLUTIONS.has(value.resolution))) {
      throw new Error('Ungueltige Aufloesung.');
    }
    parsed.resolution = value.resolution as GenerationRequest['resolution'];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'thinkingLevel')) {
    if (
      value.thinkingLevel != null &&
      (typeof value.thinkingLevel !== 'string' || !ALLOWED_THINKING_LEVELS.has(value.thinkingLevel))
    ) {
      throw new Error('Ungueltiges Thinking-Level.');
    }
    parsed.thinkingLevel = value.thinkingLevel as GenerationRequest['thinkingLevel'];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'useGoogleSearch')) {
    if (value.useGoogleSearch != null && typeof value.useGoogleSearch !== 'boolean') {
      throw new Error('Ungueltiger useGoogleSearch-Wert.');
    }
    parsed.useGoogleSearch = value.useGoogleSearch as GenerationRequest['useGoogleSearch'];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'responseModalities')) {
    if (!Array.isArray(value.responseModalities) || value.responseModalities.length === 0) {
      throw new Error('responseModalities muss ein nicht-leeres Array sein.');
    }

    const modalities = value.responseModalities.map((item) => {
      if (typeof item !== 'string' || !ALLOWED_RESPONSE_MODALITIES.has(item)) {
        throw new Error('Ungueltige responseModalities.');
      }
      return item as 'TEXT' | 'IMAGE';
    });

    parsed.responseModalities = Array.from(new Set(modalities));
  }

  if (Object.prototype.hasOwnProperty.call(value, 'batchCount')) {
    if (
      value.batchCount != null &&
      (typeof value.batchCount !== 'number' ||
        !Number.isFinite(value.batchCount) ||
        !Number.isInteger(value.batchCount) ||
        value.batchCount < 1 ||
        value.batchCount > 4)
    ) {
      throw new Error('batchCount muss zwischen 1 und 4 liegen.');
    }
    parsed.batchCount = value.batchCount as GenerationRequest['batchCount'];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'parentId')) {
    if (value.parentId != null && typeof value.parentId !== 'string') {
      throw new Error('Ungueltiger parentId-Wert.');
    }
    parsed.parentId = value.parentId as GenerationRequest['parentId'];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'projectId')) {
    if (value.projectId != null && typeof value.projectId !== 'string') {
      throw new Error('Ungueltiger projectId-Wert.');
    }
    parsed.projectId = value.projectId as GenerationRequest['projectId'];
  }

  return parsed;
}

function parseReferenceImagePayload(
  value: unknown,
  index: number
): NonNullable<GenerationRequest['referenceImages']>[number] {
  if (!isRecord(value)) {
    throw new Error(`Referenzbild ${index + 1} ist ungueltig.`);
  }

  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new Error(`Referenzbild ${index + 1} braucht einen Namen.`);
  }

  if (typeof value.mimeType !== 'string' || value.mimeType.trim().length === 0) {
    throw new Error(`Referenzbild ${index + 1} hat keinen gueltigen MIME-Typ.`);
  }

  if (typeof value.dataBase64 !== 'string' || value.dataBase64.trim().length === 0) {
    throw new Error(`Referenzbild ${index + 1} enthaelt keine Daten.`);
  }

  if (
    Object.prototype.hasOwnProperty.call(value, 'label') &&
    value.label != null &&
    (typeof value.label !== 'string' || !ALLOWED_REFERENCE_LABELS.has(value.label))
  ) {
    throw new Error(`Referenzbild ${index + 1} hat ein ungueltiges Label.`);
  }

  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    name: value.name,
    mimeType: value.mimeType,
    dataBase64: value.dataBase64,
    label: value.label as NonNullable<GenerationRequest['referenceImages']>[number]['label']
  };
}

function parseProjectBrandAssetsCreateInput(value: unknown): {
  projectId: string;
  assets: Array<{
    name: string;
    mimeType: string;
    dataBase64: string;
  }>;
} {
  if (!isRecord(value)) {
    throw new Error('Upload-Payload muss ein Objekt sein.');
  }

  if (typeof value.projectId !== 'string') {
    throw new Error('Projekt-ID ist erforderlich.');
  }

  if (!Array.isArray(value.assets)) {
    throw new Error('assets muss ein Array sein.');
  }

  if (value.assets.length > MAX_BRAND_ASSET_UPLOAD_COUNT) {
    throw new Error(`Maximal ${MAX_BRAND_ASSET_UPLOAD_COUNT} Brand-Assets pro Upload erlaubt.`);
  }

  const assets = value.assets.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Brand-Asset ${index + 1} ist ungueltig.`);
    }

    if (typeof item.name !== 'string' || typeof item.mimeType !== 'string' || typeof item.dataBase64 !== 'string') {
      throw new Error(`Brand-Asset ${index + 1} hat ungueltige Felder.`);
    }

    return {
      name: item.name,
      mimeType: item.mimeType,
      dataBase64: item.dataBase64
    };
  });

  return {
    projectId: value.projectId,
    assets
  };
}

function parseProjectImageOutputDir(value: string | null): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!isAbsoluteStudioPath(trimmed)) {
    throw new Error('Der Bildordner muss ein absoluter Pfad sein.');
  }

  return path.resolve(trimmed);
}

function collectImageRoots(database: StudioDatabase): string[] {
  const roots = new Set<string>([path.resolve(STUDIO_PATHS.root)]);

  for (const project of database.listProjects()) {
    const outputDir = project.imageOutputDir?.trim();
    if (!outputDir || !isAbsoluteStudioPath(outputDir)) {
      continue;
    }

    roots.add(path.resolve(outputDir));
  }

  return Array.from(roots);
}

function resolveStoredImagePath(filePath: string): string {
  const normalized = filePath.trim();
  if (!normalized) {
    throw new Error('Ungueltiger Bildpfad.');
  }

  if (isAbsoluteStudioPath(normalized)) {
    return path.resolve(normalized);
  }

  return path.resolve(STUDIO_PATHS.root, normalized);
}

function isPathInsideAllowedRoots(targetPath: string, roots: string[]): boolean {
  return roots.some((root) => isPathInsideRoot(targetPath, root));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAllowedExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function decodeBase64Payload(value: string, label: string, maxBytes: number): Buffer {
  const normalized = value.trim().replace(/\s+/g, '');
  if (!normalized) {
    throw new Error(`${label} ist leer.`);
  }

  if (!isLikelyBase64(normalized)) {
    throw new Error(`${label} hat kein gueltiges Base64-Format.`);
  }

  const estimatedBytes = estimateBase64Bytes(normalized);
  if (estimatedBytes > maxBytes) {
    throw new Error(`${label} ist groesser als ${formatBytes(maxBytes)}.`);
  }

  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length === 0) {
    throw new Error(`${label} konnte nicht dekodiert werden.`);
  }

  if (bytes.length > maxBytes) {
    throw new Error(`${label} ist groesser als ${formatBytes(maxBytes)}.`);
  }

  return bytes;
}

function isLikelyBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function estimateBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function formatBytes(value: number): string {
  const megabytes = value / (1024 * 1024);
  return `${megabytes.toFixed(1)} MB`;
}
