import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface StudioPaths {
  root: string;
  config: string;
  database: string;
  imagesOriginals: string;
  imagesThumbnails: string;
  imagesReferences: string;
  brandAssets: string;
  exports: string;
  prompts: string;
  projects: string;
}

const ROOT_DIR = path.join(os.homedir(), '.benana');

export const STUDIO_PATHS: StudioPaths = {
  root: ROOT_DIR,
  config: path.join(ROOT_DIR, 'config.json'),
  database: path.join(ROOT_DIR, 'studio.db'),
  imagesOriginals: path.join(ROOT_DIR, 'images', 'originals'),
  imagesThumbnails: path.join(ROOT_DIR, 'images', 'thumbnails'),
  imagesReferences: path.join(ROOT_DIR, 'images', 'references'),
  brandAssets: path.join(ROOT_DIR, 'projects', 'brand-assets'),
  exports: path.join(ROOT_DIR, 'exports'),
  prompts: path.join(ROOT_DIR, 'prompts'),
  projects: path.join(ROOT_DIR, 'projects')
};

export function ensureStudioDirectories(paths: StudioPaths = STUDIO_PATHS): void {
  const dirs = [
    paths.root,
    path.join(paths.root, 'images'),
    paths.imagesOriginals,
    paths.imagesThumbnails,
    paths.imagesReferences,
    paths.brandAssets,
    paths.exports,
    paths.prompts,
    paths.projects
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function normalizeRelativePath(filePath: string): string {
  return normalizeStudioPath(filePath).replace(/^\/+/, '');
}

export function normalizeStudioPath(filePath: string): string {
  const normalized = filePath.trim().replace(/\\/g, '/');
  if (isAbsoluteStudioPath(normalized)) {
    return normalized;
  }

  return normalized.replace(/^\/+/, '');
}

export function isAbsoluteStudioPath(filePath: string): boolean {
  return (
    path.isAbsolute(filePath) ||
    /^[A-Za-z]:[\\/]/.test(filePath) ||
    filePath.startsWith('\\\\') ||
    filePath.startsWith('//')
  );
}

export function toStudioUrl(filePath: string): string {
  const normalized = normalizeStudioPath(filePath);
  if (isAbsoluteStudioPath(normalized)) {
    const encoded = Buffer.from(normalized, 'utf8').toString('base64url');
    return `studio://local/abs/${encoded}`;
  }

  return `studio://local/${normalized}`;
}
