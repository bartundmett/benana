import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

import type { GenerationRequest, ReferenceImagePayload } from '../../shared/types.js';
import { StudioDatabase, buildRelativePath } from './db.js';
import type { StudioPaths } from './paths.js';

const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;

interface PersistGeneratedImageInput {
  request: GenerationRequest;
  generated: {
    mimeType: string;
    dataBase64: string;
  };
  modelText: string | null;
  generationMs: number;
  costEstimate: number;
}

export class ImageStore {
  constructor(
    private readonly database: StudioDatabase,
    private readonly paths: StudioPaths
  ) {}

  async persistGeneratedImage(input: PersistGeneratedImageInput): Promise<string> {
    const imageId = uuidv4();
    const extension = extensionFromMimeType(input.generated.mimeType);
    const outputDirectory = this.resolveOriginalOutputDirectory(input.request.projectId);
    const absoluteOriginalPath = path.join(outputDirectory, `${imageId}.${extension}`);
    const relativeThumbPath = buildRelativePath('images', 'thumbnails', `${imageId}.webp`);
    const absoluteThumbPath = path.join(this.paths.root, relativeThumbPath);
    const imageBuffer = decodeBase64Payload(input.generated.dataBase64, 'Generiertes Bild');
    let imageInserted = false;

    try {
      await fs.mkdir(path.dirname(absoluteOriginalPath), { recursive: true });
      await fs.mkdir(path.dirname(absoluteThumbPath), { recursive: true });
      await fs.writeFile(absoluteOriginalPath, imageBuffer);

      const metadata = await sharp(imageBuffer).metadata();
      await sharp(imageBuffer)
        .resize({
          width: 400,
          height: 400,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 84 })
        .toFile(absoluteThumbPath);

      this.database.insertImage({
        id: imageId,
        projectId: input.request.projectId ?? null,
        prompt: input.request.prompt,
        model: input.request.model,
        aspectRatio: input.request.aspectRatio ?? null,
        resolution: input.request.resolution ?? null,
        thinkingLevel: input.request.thinkingLevel ?? null,
        usedSearch: Boolean(input.request.useGoogleSearch),
        modelText: input.modelText,
        filePath: absoluteOriginalPath,
        thumbPath: relativeThumbPath,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        fileSize: imageBuffer.byteLength,
        parentId: input.request.parentId ?? null,
        generationMs: input.generationMs,
        costEstimate: input.costEstimate
      });
      imageInserted = true;

      await this.persistReferenceImages(imageId, input.request);

      return imageId;
    } catch (error) {
      if (imageInserted) {
        this.database.deleteReferenceImagesByImageId(imageId);
        this.database.deleteImageHard(imageId);
      }

      await Promise.allSettled([removeFileIfExists(absoluteOriginalPath), removeFileIfExists(absoluteThumbPath)]);
      throw error;
    }
  }

  private resolveOriginalOutputDirectory(projectId?: string | null): string {
    const normalizedProjectId = projectId?.trim();
    if (!normalizedProjectId) {
      return this.paths.imagesOriginals;
    }

    const project = this.database.getProjectById(normalizedProjectId);
    const configuredOutputDir = project?.imageOutputDir?.trim();
    if (!configuredOutputDir || !path.isAbsolute(configuredOutputDir)) {
      return this.paths.imagesOriginals;
    }

    return path.resolve(configuredOutputDir);
  }

  async loadProjectBrandReferences(projectId: string, limit: number): Promise<ReferenceImagePayload[]> {
    if (limit <= 0) {
      return [];
    }

    const assets = this.database.listProjectBrandAssets(projectId).slice(0, limit);
    const references: ReferenceImagePayload[] = [];

    for (const asset of assets) {
      const absolutePath = path.join(this.paths.root, asset.filePath);
      if (!isPathInsideRoot(absolutePath, this.paths.root)) {
        continue;
      }

      try {
        const bytes = await fs.readFile(absolutePath);
        references.push({
          id: asset.id,
          name: asset.name,
          mimeType: asset.mimeType,
          dataBase64: bytes.toString('base64'),
          label: 'style'
        });
      } catch {
        // Ignore missing/corrupt project assets to keep queue execution resilient.
      }
    }

    return references;
  }

  private async persistReferenceImages(imageId: string, request: GenerationRequest): Promise<void> {
    const refs = request.referenceImages ?? [];
    if (refs.length === 0) {
      return;
    }

    const insertedReferenceIds: string[] = [];
    const writtenPaths: string[] = [];

    try {
      for (let index = 0; index < refs.length; index += 1) {
        const ref = refs[index];
        const refId = uuidv4();
        const extension = extensionFromMimeType(ref.mimeType);
        const relativePath = buildRelativePath('images', 'references', `${refId}.${extension}`);
        const absolutePath = path.join(this.paths.root, relativePath);
        if (!isPathInsideRoot(absolutePath, this.paths.root)) {
          throw new Error('Ungueltiger Referenzbild-Pfad.');
        }

        const bytes = decodeBase64Payload(
          ref.dataBase64,
          `Referenzbild ${index + 1}`,
          MAX_REFERENCE_IMAGE_BYTES
        );

        await fs.writeFile(absolutePath, bytes);
        writtenPaths.push(absolutePath);

        this.database.insertReferenceImage({
          id: refId,
          imageId,
          filePath: relativePath,
          label: ref.label ?? null,
          position: index
        });
        insertedReferenceIds.push(refId);
      }
    } catch (error) {
      insertedReferenceIds.forEach((referenceId) => {
        this.database.deleteReferenceImageById(referenceId);
      });

      await Promise.allSettled(writtenPaths.map((writtenPath) => removeFileIfExists(writtenPath)));
      throw error;
    }
  }
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

function decodeBase64Payload(value: string, label: string, maxBytes?: number): Buffer {
  const normalized = value.trim().replace(/\s+/g, '');
  if (!normalized) {
    throw new Error(`${label} ist leer.`);
  }

  if (!isLikelyBase64(normalized)) {
    throw new Error(`${label} hat kein gueltiges Base64-Format.`);
  }

  const estimatedBytes = estimateBase64Bytes(normalized);
  if (maxBytes != null && estimatedBytes > maxBytes) {
    throw new Error(`${label} ist groesser als ${formatBytes(maxBytes)}.`);
  }

  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length === 0) {
    throw new Error(`${label} konnte nicht dekodiert werden.`);
  }

  if (maxBytes != null && bytes.length > maxBytes) {
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

async function removeFileIfExists(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { force: true });
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
