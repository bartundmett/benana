import type {
  EnqueueResult,
  GenerationRequest,
  ProjectBrandAsset,
  PromptTemplate,
  QueueJob,
  SaveImageResult,
  StudioConfigPublic,
  StudioImage,
  StudioInitialState,
  StudioMenuCommand,
  StudioProject
} from '../../shared/types';

declare global {
  interface Window {
    studio: {
      getInitialState: () => Promise<StudioInitialState>;
      getConfig: () => Promise<StudioConfigPublic>;
      updateConfig: (
        patch: Partial<
          Pick<
            StudioConfigPublic,
            'defaultModel' | 'theme' | 'onboardingCompleted' | 'queueConcurrency' | 'monthlySpendLimitUsd' | 'totalSpendLimitUsd'
          >
        >
      ) => Promise<StudioConfigPublic>;
      setApiKey: (apiKey: string) => Promise<StudioConfigPublic>;
      clearApiKey: () => Promise<StudioConfigPublic>;
      validateApiKey: (apiKey: string) => Promise<{ valid: boolean; message: string }>;
      listImages: (options?: { search?: string; limit?: number; offset?: number; projectId?: string }) => Promise<StudioImage[]>;
      getImage: (imageId: string) => Promise<StudioImage | null>;
      toggleFavorite: (imageId: string) => Promise<StudioImage | null>;
      deleteImage: (imageId: string) => Promise<boolean>;
      downloadImage: (imageId: string) => Promise<SaveImageResult>;
      listProjects: () => Promise<StudioProject[]>;
      pickProjectImageOutputDir: (currentPath?: string | null) => Promise<string | null>;
      createProject: (input: {
        name: string;
        description?: string | null;
        systemPrompt?: string | null;
        brandGuidelines?: string | null;
        brandStrictMode?: boolean;
        imageOutputDir?: string | null;
      }) => Promise<StudioProject>;
      updateProject: (input: {
        id: string;
        name: string;
        description?: string | null;
        systemPrompt?: string | null;
        brandGuidelines?: string | null;
        brandStrictMode?: boolean;
        imageOutputDir?: string | null;
      }) => Promise<StudioProject | null>;
      deleteProject: (projectId: string) => Promise<boolean>;
      listProjectBrandAssets: (projectId: string) => Promise<ProjectBrandAsset[]>;
      addProjectBrandAssets: (input: {
        projectId: string;
        assets: Array<{ name: string; mimeType: string; dataBase64: string }>;
      }) => Promise<ProjectBrandAsset[]>;
      deleteProjectBrandAsset: (assetId: string) => Promise<boolean>;
      listPrompts: (projectId: string) => Promise<PromptTemplate[]>;
      createPrompt: (input: {
        projectId: string;
        name: string;
        template: string;
        variables?: string[];
        folder?: string | null;
      }) => Promise<PromptTemplate>;
      updatePrompt: (input: {
        id: string;
        name: string;
        template: string;
        variables?: string[];
        folder?: string | null;
      }) => Promise<PromptTemplate | null>;
      deletePrompt: (promptId: string) => Promise<boolean>;
      markPromptUsed: (promptId: string) => Promise<boolean>;
      listQueueJobs: () => Promise<QueueJob[]>;
      enqueueGeneration: (request: GenerationRequest) => Promise<EnqueueResult>;
      pauseQueue: () => Promise<boolean>;
      resumeQueue: () => Promise<boolean>;
      cancelQueueJob: (jobId: string) => Promise<boolean>;
      estimateCost: (resolution?: GenerationRequest['resolution']) => Promise<number>;
      getSessionCost: (window?: 'day' | 'month' | 'all') => Promise<number>;
      openExternal: (url: string) => Promise<void>;
      showItemInFolder: (filePath: string) => Promise<boolean>;
      onQueueUpdated: (listener: () => void) => () => void;
      onImagesUpdated: (listener: () => void) => () => void;
      onProjectsUpdated: (listener: () => void) => () => void;
      onPromptsUpdated: (listener: () => void) => () => void;
      onBrandAssetsUpdated: (listener: () => void) => () => void;
      onMenuCommand: (listener: (command: StudioMenuCommand) => void) => () => void;
    };
  }
}

export {};
