import path from 'node:path';

import Database from 'better-sqlite3';

import type {
  GenerationRequest,
  ProjectBrandAsset,
  PromptTemplate,
  QueueJob,
  QueueStatus,
  StudioImage,
  StudioProject
} from '../../shared/types.js';
import { normalizeRelativePath, normalizeStudioPath, toStudioUrl } from './paths.js';

interface ImageInsertInput {
  id: string;
  projectId: string | null;
  prompt: string;
  model: string;
  aspectRatio: string | null;
  resolution: string | null;
  thinkingLevel: string | null;
  usedSearch: boolean;
  modelText: string | null;
  filePath: string;
  thumbPath: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  parentId: string | null;
  generationMs: number | null;
  costEstimate: number | null;
}

interface ReferenceImageInsertInput {
  id: string;
  imageId: string;
  filePath: string;
  label: string | null;
  position: number;
}

interface ProjectBrandAssetInsertInput {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  filePath: string;
}

interface UsageLogInsertInput {
  id: string;
  model: string;
  resolution: string | null;
  costEstimate: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

interface QueueJobRow {
  id: string;
  status: QueueStatus;
  request: string;
  result_id: string | null;
  error: string | null;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ImageRow {
  id: string;
  project_id: string | null;
  prompt: string;
  model: string;
  aspect_ratio: string | null;
  resolution: string | null;
  thinking_level: string | null;
  used_search: number;
  model_text: string | null;
  file_path: string;
  thumb_path: string | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  parent_id: string | null;
  generation_ms: number | null;
  cost_estimate: number | null;
  is_favorite: number;
  created_at: string;
  deleted_at: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  brand_guidelines: string | null;
  brand_strict_mode: number;
  image_output_dir: string | null;
  created_at: string;
  image_count: number;
  prompt_count: number;
  brand_asset_count: number;
  total_cost: number;
  last_activity_at: string | null;
}

interface PromptRow {
  id: string;
  project_id: string;
  name: string;
  template: string;
  variables: string | null;
  folder: string | null;
  usage_count: number;
  created_at: string;
}

interface ProjectBrandAssetRow {
  id: string;
  project_id: string;
  name: string;
  mime_type: string;
  file_path: string;
  created_at: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS images (
  id             TEXT PRIMARY KEY,
  project_id     TEXT,
  prompt         TEXT NOT NULL,
  model          TEXT NOT NULL,
  aspect_ratio   TEXT,
  resolution     TEXT,
  thinking_level TEXT,
  used_search    INTEGER DEFAULT 0,
  model_text     TEXT,
  file_path      TEXT NOT NULL,
  thumb_path     TEXT,
  width          INTEGER,
  height         INTEGER,
  file_size      INTEGER,
  parent_id      TEXT,
  generation_ms  INTEGER,
  cost_estimate  REAL,
  is_favorite    INTEGER DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at     DATETIME
);

CREATE TABLE IF NOT EXISTS reference_images (
  id        TEXT PRIMARY KEY,
  image_id  TEXT NOT NULL,
  file_path TEXT NOT NULL,
  label     TEXT,
  position  INTEGER,
  FOREIGN KEY (image_id) REFERENCES images(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id     TEXT PRIMARY KEY,
  name   TEXT UNIQUE NOT NULL,
  color  TEXT
);

CREATE TABLE IF NOT EXISTS image_tags (
  image_id TEXT NOT NULL,
  tag_id   TEXT NOT NULL,
  PRIMARY KEY (image_id, tag_id),
  FOREIGN KEY (image_id) REFERENCES images(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  system_prompt TEXT,
  brand_guidelines TEXT,
  brand_strict_mode INTEGER DEFAULT 0,
  image_output_dir TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_brand_assets (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS prompts (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  name        TEXT NOT NULL,
  template    TEXT NOT NULL,
  variables   TEXT,
  folder      TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS queue_jobs (
  id           TEXT PRIMARY KEY,
  status       TEXT NOT NULL,
  request      TEXT NOT NULL,
  result_id    TEXT,
  error        TEXT,
  priority     INTEGER DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at   DATETIME,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS usage_log (
  id            TEXT PRIMARY KEY,
  model         TEXT NOT NULL,
  resolution    TEXT,
  cost_estimate REAL,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(prompt, model_text, content=images, content_rowid=rowid);

CREATE TRIGGER IF NOT EXISTS images_ai AFTER INSERT ON images BEGIN
  INSERT INTO images_fts(rowid, prompt, model_text)
  VALUES (new.rowid, new.prompt, COALESCE(new.model_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS images_ad AFTER DELETE ON images BEGIN
  INSERT INTO images_fts(images_fts, rowid, prompt, model_text)
  VALUES ('delete', old.rowid, old.prompt, COALESCE(old.model_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS images_au AFTER UPDATE ON images BEGIN
  INSERT INTO images_fts(images_fts, rowid, prompt, model_text)
  VALUES ('delete', old.rowid, old.prompt, COALESCE(old.model_text, ''));

  INSERT INTO images_fts(rowid, prompt, model_text)
  VALUES (new.rowid, new.prompt, COALESCE(new.model_text, ''));
END;

CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_project_id ON images(project_id);
CREATE INDEX IF NOT EXISTS idx_images_parent_id ON images(parent_id);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_status_priority ON queue_jobs(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_brand_assets_project_id ON project_brand_assets(project_id, created_at DESC);
`;

export class StudioDatabase {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA_SQL);
    this.applyMigrations();
    this.seedProjectContexts();
  }

  private applyMigrations(): void {
    const promptColumns = this.db
      .prepare(`PRAGMA table_info(prompts)`)
      .all() as Array<{ name: string }>;
    const projectColumns = this.db
      .prepare(`PRAGMA table_info(projects)`)
      .all() as Array<{ name: string }>;

    if (!promptColumns.some((column) => column.name === 'project_id')) {
      this.db.exec(`ALTER TABLE prompts ADD COLUMN project_id TEXT;`);
    }

    if (!projectColumns.some((column) => column.name === 'brand_guidelines')) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN brand_guidelines TEXT;`);
    }

    if (!projectColumns.some((column) => column.name === 'brand_strict_mode')) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN brand_strict_mode INTEGER DEFAULT 0;`);
    }

    if (!projectColumns.some((column) => column.name === 'image_output_dir')) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN image_output_dir TEXT;`);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_brand_assets (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name       TEXT NOT NULL,
        mime_type  TEXT NOT NULL,
        file_path  TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_prompts_project_id ON prompts(project_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_project_brand_assets_project_id ON project_brand_assets(project_id, created_at DESC);`);
  }

  private seedProjectContexts(): void {
    const defaultProjectId = this.ensureDefaultProject();

    this.db
      .prepare(
        `UPDATE images
         SET project_id = ?
         WHERE project_id IS NULL OR TRIM(project_id) = ''`
      )
      .run(defaultProjectId);

    this.db
      .prepare(
        `UPDATE prompts
         SET project_id = ?
         WHERE project_id IS NULL OR TRIM(project_id) = ''`
      )
      .run(defaultProjectId);
  }

  private ensureDefaultProject(): string {
    const existing = this.db
      .prepare(`SELECT id FROM projects ORDER BY created_at ASC LIMIT 1`)
      .get() as { id: string } | undefined;

    if (existing) {
      return existing.id;
    }

    const id = 'project-default';
    this.db
      .prepare(
        `INSERT INTO projects (id, name, description, system_prompt, brand_guidelines, brand_strict_mode, image_output_dir)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, 'Persoenlich', 'Standard-Arbeitsbereich', null, null, 0, null);

    return id;
  }

  listImages(options?: {
    search?: string;
    limit?: number;
    offset?: number;
    projectId?: string;
  }): StudioImage[] {
    const limit = Math.min(5000, Math.max(1, options?.limit ?? 300));
    const offset = Math.max(0, options?.offset ?? 0);
    const search = options?.search?.trim();

    if (search) {
      const likeSearch = `%${escapeLikePattern(search)}%`;

      if (options?.projectId) {
        try {
          const query = this.db.prepare(
            `SELECT i.*
             FROM images i
             JOIN images_fts f ON f.rowid = i.rowid
             WHERE i.deleted_at IS NULL
               AND i.project_id = ?
               AND images_fts MATCH ?
             ORDER BY i.created_at DESC
             LIMIT ? OFFSET ?`
          );

          return (query.all(options.projectId, search, limit, offset) as ImageRow[]).map((row) =>
            mapImageRow(row)
          );
        } catch {
          const fallbackQuery = this.db.prepare(
            `SELECT *
             FROM images
             WHERE deleted_at IS NULL
               AND project_id = ?
               AND (
                 prompt LIKE ? ESCAPE '\\'
                 OR COALESCE(model_text, '') LIKE ? ESCAPE '\\'
               )
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`
          );

          return (fallbackQuery.all(options.projectId, likeSearch, likeSearch, limit, offset) as ImageRow[]).map(
            (row) => mapImageRow(row)
          );
        }
      }

      try {
        const query = this.db.prepare(
          `SELECT i.*
           FROM images i
           JOIN images_fts f ON f.rowid = i.rowid
           WHERE i.deleted_at IS NULL
             AND images_fts MATCH ?
           ORDER BY i.created_at DESC
           LIMIT ? OFFSET ?`
        );

        return (query.all(search, limit, offset) as ImageRow[]).map((row) => mapImageRow(row));
      } catch {
        const fallbackQuery = this.db.prepare(
          `SELECT *
           FROM images
           WHERE deleted_at IS NULL
             AND (
               prompt LIKE ? ESCAPE '\\'
               OR COALESCE(model_text, '') LIKE ? ESCAPE '\\'
             )
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`
        );

        return (fallbackQuery.all(likeSearch, likeSearch, limit, offset) as ImageRow[]).map((row) =>
          mapImageRow(row)
        );
      }
    }

    if (options?.projectId) {
      const query = this.db.prepare(
        `SELECT * FROM images
         WHERE deleted_at IS NULL
           AND project_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      );

      return (query.all(options.projectId, limit, offset) as ImageRow[]).map((row) => mapImageRow(row));
    }

    const query = this.db.prepare(
      `SELECT * FROM images
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    );

    return (query.all(limit, offset) as ImageRow[]).map((row) => mapImageRow(row));
  }

  getImageById(id: string): StudioImage | null {
    const row = this.db
      .prepare('SELECT * FROM images WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .get(id) as ImageRow | undefined;

    return row ? mapImageRow(row) : null;
  }

  insertImage(input: ImageInsertInput): void {
    this.db
      .prepare(
        `INSERT INTO images (
          id, project_id, prompt, model, aspect_ratio, resolution, thinking_level,
          used_search, model_text, file_path, thumb_path, width, height, file_size,
          parent_id, generation_ms, cost_estimate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.projectId,
        input.prompt,
        input.model,
        input.aspectRatio,
        input.resolution,
        input.thinkingLevel,
        input.usedSearch ? 1 : 0,
        input.modelText,
        normalizeStudioPath(input.filePath),
        input.thumbPath ? normalizeStudioPath(input.thumbPath) : null,
        input.width,
        input.height,
        input.fileSize,
        input.parentId,
        input.generationMs,
        input.costEstimate
      );
  }

  insertReferenceImage(input: ReferenceImageInsertInput): void {
    this.db
      .prepare(
        `INSERT INTO reference_images (id, image_id, file_path, label, position)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.id, input.imageId, normalizeRelativePath(input.filePath), input.label, input.position);
  }

  toggleFavorite(imageId: string): StudioImage | null {
    this.db
      .prepare(
        `UPDATE images
         SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END
         WHERE id = ?`
      )
      .run(imageId);

    return this.getImageById(imageId);
  }

  softDeleteImage(imageId: string): void {
    this.db
      .prepare(
        `UPDATE images
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(imageId);
  }

  deleteImageHard(imageId: string): void {
    this.db.prepare(`DELETE FROM images WHERE id = ?`).run(imageId);
  }

  deleteReferenceImageById(referenceId: string): void {
    this.db.prepare(`DELETE FROM reference_images WHERE id = ?`).run(referenceId);
  }

  deleteReferenceImagesByImageId(imageId: string): void {
    this.db.prepare(`DELETE FROM reference_images WHERE image_id = ?`).run(imageId);
  }

  listProjects(): StudioProject[] {
    const rows = this.db
      .prepare(
        `SELECT
          p.id,
          p.name,
          p.description,
          p.system_prompt,
          p.brand_guidelines,
          p.brand_strict_mode,
          p.image_output_dir,
          p.created_at,
          (
            SELECT COUNT(*)
            FROM images i
            WHERE i.project_id = p.id
              AND i.deleted_at IS NULL
          ) AS image_count,
          (
            SELECT COUNT(*)
            FROM prompts pr
            WHERE pr.project_id = p.id
          ) AS prompt_count,
          (
            SELECT COUNT(*)
            FROM project_brand_assets pba
            WHERE pba.project_id = p.id
          ) AS brand_asset_count,
          (
            SELECT COALESCE(SUM(COALESCE(i.cost_estimate, 0)), 0)
            FROM images i
            WHERE i.project_id = p.id
              AND i.deleted_at IS NULL
          ) AS total_cost,
          (
            SELECT MAX(i.created_at)
            FROM images i
            WHERE i.project_id = p.id
              AND i.deleted_at IS NULL
          ) AS last_activity_at
        FROM projects p
        ORDER BY COALESCE(last_activity_at, p.created_at) DESC, p.name COLLATE NOCASE ASC`
      )
      .all() as ProjectRow[];

    return rows.map((row) => mapProjectRow(row));
  }

  getProjectById(projectId: string): StudioProject | null {
    const row = this.db
      .prepare(
        `SELECT
          p.id,
          p.name,
          p.description,
          p.system_prompt,
          p.brand_guidelines,
          p.brand_strict_mode,
          p.image_output_dir,
          p.created_at,
          (
            SELECT COUNT(*)
            FROM images i
            WHERE i.project_id = p.id
              AND i.deleted_at IS NULL
          ) AS image_count,
          (
            SELECT COUNT(*)
            FROM prompts pr
            WHERE pr.project_id = p.id
          ) AS prompt_count,
          (
            SELECT COUNT(*)
            FROM project_brand_assets pba
            WHERE pba.project_id = p.id
          ) AS brand_asset_count,
          (
            SELECT COALESCE(SUM(COALESCE(i.cost_estimate, 0)), 0)
            FROM images i
            WHERE i.project_id = p.id
              AND i.deleted_at IS NULL
          ) AS total_cost,
          (
            SELECT MAX(i.created_at)
            FROM images i
            WHERE i.project_id = p.id
              AND i.deleted_at IS NULL
          ) AS last_activity_at
        FROM projects p
        WHERE p.id = ?
        LIMIT 1`
      )
      .get(projectId) as ProjectRow | undefined;

    return row ? mapProjectRow(row) : null;
  }

  createProject(input: {
    id: string;
    name: string;
    description: string | null;
    systemPrompt: string | null;
    brandGuidelines: string | null;
    brandStrictMode: boolean;
    imageOutputDir: string | null;
  }): StudioProject {
    this.db
      .prepare(
        `INSERT INTO projects (id, name, description, system_prompt, brand_guidelines, brand_strict_mode, image_output_dir)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.name,
        input.description,
        input.systemPrompt,
        input.brandGuidelines,
        input.brandStrictMode ? 1 : 0,
        input.imageOutputDir
      );

    const created = this.getProjectById(input.id);
    if (!created) {
      throw new Error('Projekt konnte nicht erstellt werden.');
    }

    return created;
  }

  updateProject(input: {
    id: string;
    name: string;
    description: string | null;
    systemPrompt: string | null;
    brandGuidelines: string | null;
    brandStrictMode: boolean;
    imageOutputDir: string | null;
  }): StudioProject | null {
    this.db
      .prepare(
        `UPDATE projects
         SET name = ?, description = ?, system_prompt = ?, brand_guidelines = ?, brand_strict_mode = ?, image_output_dir = ?
         WHERE id = ?`
      )
      .run(
        input.name,
        input.description,
        input.systemPrompt,
        input.brandGuidelines,
        input.brandStrictMode ? 1 : 0,
        input.imageOutputDir,
        input.id
      );

    return this.getProjectById(input.id);
  }

  deleteProject(projectId: string): boolean {
    const totalProjects = this.db.prepare(`SELECT COUNT(*) AS total FROM projects`).get() as { total: number };
    if (totalProjects.total <= 1) {
      return false;
    }

    const fallbackProject = this.db
      .prepare(
        `SELECT id
         FROM projects
         WHERE id != ?
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get(projectId) as { id: string } | undefined;

    if (!fallbackProject) {
      return false;
    }

    const runDelete = this.db.transaction((targetProjectId: string, nextProjectId: string) => {
      this.db.prepare(`UPDATE images SET project_id = ? WHERE project_id = ?`).run(nextProjectId, targetProjectId);
      this.db.prepare(`UPDATE prompts SET project_id = ? WHERE project_id = ?`).run(nextProjectId, targetProjectId);
      this.db
        .prepare(`UPDATE project_brand_assets SET project_id = ? WHERE project_id = ?`)
        .run(nextProjectId, targetProjectId);
      return this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(targetProjectId).changes > 0;
    });

    return runDelete(projectId, fallbackProject.id);
  }

  listProjectBrandAssets(projectId: string): ProjectBrandAsset[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_id, name, mime_type, file_path, created_at
         FROM project_brand_assets
         WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .all(projectId) as ProjectBrandAssetRow[];

    return rows.map((row) => mapProjectBrandAssetRow(row));
  }

  getProjectBrandAssetById(assetId: string): ProjectBrandAsset | null {
    const row = this.db
      .prepare(
        `SELECT id, project_id, name, mime_type, file_path, created_at
         FROM project_brand_assets
         WHERE id = ?
         LIMIT 1`
      )
      .get(assetId) as ProjectBrandAssetRow | undefined;

    return row ? mapProjectBrandAssetRow(row) : null;
  }

  insertProjectBrandAsset(input: ProjectBrandAssetInsertInput): ProjectBrandAsset {
    this.db
      .prepare(
        `INSERT INTO project_brand_assets (id, project_id, name, mime_type, file_path)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.projectId,
        input.name,
        input.mimeType,
        normalizeRelativePath(input.filePath)
      );

    const created = this.getProjectBrandAssetById(input.id);
    if (!created) {
      throw new Error('Brand-Asset konnte nicht erstellt werden.');
    }

    return created;
  }

  deleteProjectBrandAsset(assetId: string): ProjectBrandAsset | null {
    const existing = this.getProjectBrandAssetById(assetId);
    if (!existing) {
      return null;
    }

    this.db.prepare(`DELETE FROM project_brand_assets WHERE id = ?`).run(assetId);
    return existing;
  }

  listPrompts(projectId: string): PromptTemplate[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_id, name, template, variables, folder, usage_count, created_at
         FROM prompts
         WHERE project_id = ?
         ORDER BY usage_count DESC, created_at DESC`
      )
      .all(projectId) as PromptRow[];

    return rows.map((row) => mapPromptRow(row));
  }

  getPromptById(promptId: string): PromptTemplate | null {
    const row = this.db
      .prepare(
        `SELECT id, project_id, name, template, variables, folder, usage_count, created_at
         FROM prompts
         WHERE id = ?
         LIMIT 1`
      )
      .get(promptId) as PromptRow | undefined;

    return row ? mapPromptRow(row) : null;
  }

  createPrompt(input: {
    id: string;
    projectId: string;
    name: string;
    template: string;
    variables: string[];
    folder: string | null;
  }): PromptTemplate {
    this.db
      .prepare(
        `INSERT INTO prompts (id, project_id, name, template, variables, folder)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.projectId,
        input.name,
        input.template,
        JSON.stringify(input.variables),
        input.folder
      );

    const created = this.getPromptById(input.id);
    if (!created) {
      throw new Error('Prompt-Vorlage konnte nicht erstellt werden.');
    }

    return created;
  }

  updatePrompt(input: {
    id: string;
    name: string;
    template: string;
    variables: string[];
    folder: string | null;
  }): PromptTemplate | null {
    this.db
      .prepare(
        `UPDATE prompts
         SET name = ?, template = ?, variables = ?, folder = ?
         WHERE id = ?`
      )
      .run(input.name, input.template, JSON.stringify(input.variables), input.folder, input.id);

    return this.getPromptById(input.id);
  }

  deletePrompt(promptId: string): boolean {
    return this.db.prepare(`DELETE FROM prompts WHERE id = ?`).run(promptId).changes > 0;
  }

  markPromptUsed(promptId: string): void {
    this.db
      .prepare(
        `UPDATE prompts
         SET usage_count = usage_count + 1
         WHERE id = ?`
      )
      .run(promptId);
  }

  insertQueueJob(input: {
    id: string;
    status: QueueStatus;
    request: GenerationRequest;
    priority: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO queue_jobs (id, status, request, priority)
         VALUES (?, ?, ?, ?)`
      )
      .run(input.id, input.status, JSON.stringify(input.request), input.priority);
  }

  listQueueJobs(limit = 200): QueueJob[] {
    const rows = this.db
      .prepare(
        `SELECT id, status, request, result_id, error, priority, created_at, started_at, completed_at
         FROM queue_jobs
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit) as QueueJobRow[];

    return rows.map((row) => mapQueueJobRow(row));
  }

  listOpenQueueJobs(): QueueJob[] {
    const rows = this.db
      .prepare(
        `SELECT id, status, request, result_id, error, priority, created_at, started_at, completed_at
         FROM queue_jobs
         WHERE status IN ('pending', 'running')
         ORDER BY created_at DESC`
      )
      .all() as QueueJobRow[];

    return rows.map((row) => mapQueueJobRow(row));
  }

  getNextPendingJob(): QueueJob | null {
    const row = this.db
      .prepare(
        `SELECT id, status, request, result_id, error, priority, created_at, started_at, completed_at
         FROM queue_jobs
         WHERE status = 'pending'
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`
      )
      .get() as QueueJobRow | undefined;

    return row ? mapQueueJobRow(row) : null;
  }

  getQueueJobById(jobId: string): QueueJob | null {
    const row = this.db
      .prepare(
        `SELECT id, status, request, result_id, error, priority, created_at, started_at, completed_at
         FROM queue_jobs
         WHERE id = ?
         LIMIT 1`
      )
      .get(jobId) as QueueJobRow | undefined;

    return row ? mapQueueJobRow(row) : null;
  }

  markQueueJobRunning(jobId: string): void {
    this.db
      .prepare(
        `UPDATE queue_jobs
         SET status = 'running', started_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(jobId);
  }

  markQueueJobCompleted(jobId: string, resultId: string): void {
    this.db
      .prepare(
        `UPDATE queue_jobs
         SET status = 'completed', result_id = ?, completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(resultId, jobId);
  }

  markQueueJobFailed(jobId: string, error: string): void {
    this.db
      .prepare(
        `UPDATE queue_jobs
         SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(error, jobId);
  }

  markQueueJobCancelled(jobId: string): void {
    this.db
      .prepare(
        `UPDATE queue_jobs
         SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`
      )
      .run(jobId);
  }

  requeueRunningJobs(): number {
    const result = this.db
      .prepare(
        `UPDATE queue_jobs
         SET status = 'pending',
             started_at = NULL,
             completed_at = NULL,
             error = NULL
         WHERE status = 'running'`
      )
      .run();

    return result.changes;
  }

  insertUsageLog(input: UsageLogInsertInput): void {
    this.db
      .prepare(
        `INSERT INTO usage_log (id, model, resolution, cost_estimate, tokens_in, tokens_out)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.model,
        input.resolution,
        input.costEstimate,
        input.tokensIn,
        input.tokensOut
      );
  }

  getSessionCost(window: 'day' | 'month' | 'all' = 'day'): number {
    let condition = '';
    if (window === 'day') {
      condition = "WHERE created_at >= datetime('now', '-1 day')";
    } else if (window === 'month') {
      condition = "WHERE created_at >= datetime('now', '-1 month')";
    }

    const row = this.db
      .prepare(`SELECT COALESCE(SUM(cost_estimate), 0) as total FROM usage_log ${condition}`)
      .get() as { total: number };

    return row.total;
  }

  close(): void {
    this.db.close();
  }
}

function mapImageRow(row: ImageRow): StudioImage {
  const filePath = normalizeStudioPath(row.file_path);
  const thumbPath = row.thumb_path ? normalizeStudioPath(row.thumb_path) : null;

  return {
    id: row.id,
    projectId: row.project_id,
    prompt: row.prompt,
    model: row.model,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    thinkingLevel: row.thinking_level,
    usedSearch: row.used_search === 1,
    modelText: row.model_text,
    filePath,
    thumbPath,
    fileUrl: toStudioUrl(filePath),
    thumbUrl: thumbPath ? toStudioUrl(thumbPath) : null,
    width: row.width,
    height: row.height,
    fileSize: row.file_size,
    parentId: row.parent_id,
    generationMs: row.generation_ms,
    costEstimate: row.cost_estimate,
    isFavorite: row.is_favorite === 1,
    createdAt: row.created_at,
    deletedAt: row.deleted_at
  };
}

function mapProjectRow(row: ProjectRow): StudioProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    brandGuidelines: row.brand_guidelines,
    brandStrictMode: row.brand_strict_mode === 1,
    imageOutputDir: row.image_output_dir ? normalizeStudioPath(row.image_output_dir) : null,
    brandAssetCount: row.brand_asset_count,
    imageCount: row.image_count,
    promptCount: row.prompt_count,
    totalCost: row.total_cost,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at
  };
}

function mapProjectBrandAssetRow(row: ProjectBrandAssetRow): ProjectBrandAsset {
  const filePath = normalizeRelativePath(row.file_path);

  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    mimeType: row.mime_type,
    filePath,
    fileUrl: toStudioUrl(filePath),
    createdAt: row.created_at
  };
}

function mapPromptRow(row: PromptRow): PromptTemplate {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    template: row.template,
    variables: parsePromptVariables(row.variables),
    folder: row.folder,
    usageCount: row.usage_count,
    createdAt: row.created_at
  };
}

function parsePromptVariables(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function mapQueueJobRow(row: QueueJobRow): QueueJob {
  return {
    id: row.id,
    status: row.status,
    request: parseGenerationRequest(row.request),
    resultId: row.result_id,
    error: row.error,
    priority: row.priority,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

function parseGenerationRequest(value: string): GenerationRequest {
  try {
    return JSON.parse(value) as GenerationRequest;
  } catch {
    return {
      model: 'gemini-3-pro-image-preview',
      prompt: 'Anfrage-Payload konnte nicht gelesen werden'
    };
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

export function buildRelativePath(...segments: string[]): string {
  return normalizeRelativePath(path.join(...segments));
}
