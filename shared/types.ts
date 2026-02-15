export type ModelName =
  | 'gemini-3-pro-image-preview'
  | 'gemini-2.5-flash-image'
  | 'gemini-2.5-flash-image-preview';

export type AspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

export type Resolution = '1K' | '2K' | '4K';

export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high';

export type ReferenceLabel = 'person' | 'object' | 'style';

export interface ReferenceImagePayload {
  id?: string;
  name: string;
  mimeType: string;
  dataBase64: string;
  label?: ReferenceLabel;
}

export interface GenerationRequest {
  model: ModelName;
  prompt: string;
  systemPrompt?: string;
  referenceImages?: ReferenceImagePayload[];
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  thinkingLevel?: ThinkingLevel;
  useGoogleSearch?: boolean;
  responseModalities?: Array<'TEXT' | 'IMAGE'>;
  batchCount?: number;
  parentId?: string | null;
  projectId?: string | null;
}

export type QueueStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface QueueJob {
  id: string;
  status: QueueStatus;
  request: GenerationRequest;
  resultId: string | null;
  error: string | null;
  priority: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface StudioImage {
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
  fileUrl: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  parentId: string | null;
  generationMs: number | null;
  costEstimate: number | null;
  isFavorite: boolean;
  createdAt: string;
  deletedAt: string | null;
}

export interface StudioProject {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  brandGuidelines: string | null;
  brandStrictMode: boolean;
  imageOutputDir: string | null;
  brandAssetCount: number;
  imageCount: number;
  promptCount: number;
  totalCost: number;
  createdAt: string;
  lastActivityAt: string | null;
}

export interface ProjectBrandAsset {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  filePath: string;
  fileUrl: string;
  createdAt: string;
}

export interface PromptTemplate {
  id: string;
  projectId: string;
  name: string;
  template: string;
  variables: string[];
  folder: string | null;
  usageCount: number;
  createdAt: string;
}

export interface StudioConfigPublic {
  hasApiKey: boolean;
  defaultModel: ModelName;
  theme: 'dark' | 'light' | 'system';
  onboardingCompleted: boolean;
  queueConcurrency: number;
  monthlySpendLimitUsd: number | null;
  totalSpendLimitUsd: number | null;
}

export type StudioMenuCommand =
  | 'new-image'
  | 'new-project'
  | 'open-gallery'
  | 'open-queue'
  | 'open-prompts'
  | 'open-projects'
  | 'open-settings'
  | 'open-command-palette'
  | 'toggle-sidebar'
  | 'toggle-inspector';

export interface StudioInitialState {
  config: StudioConfigPublic;
  images: StudioImage[];
  queue: QueueJob[];
  projects: StudioProject[];
}

export interface EnqueueResult {
  queuedJobIds: string[];
}

export interface SaveImageResult {
  success: boolean;
  cancelled: boolean;
  filePath?: string;
  error?: string;
}

export interface GenerationMetrics {
  estimatedCost: number;
  attempts: number;
  durationMs: number;
}
