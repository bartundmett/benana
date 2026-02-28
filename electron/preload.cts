import { contextBridge, ipcRenderer } from 'electron';
import type { StudioMenuCommand } from '../shared/types.js';

const studioApi = {
  getInitialState: () => ipcRenderer.invoke('studio:get-initial-state'),
  getConfig: () => ipcRenderer.invoke('studio:config:get'),
  updateConfig: (patch: unknown) => ipcRenderer.invoke('studio:config:update', patch),
  setApiKey: (apiKey: string) => ipcRenderer.invoke('studio:config:set-api-key', apiKey),
  clearApiKey: () => ipcRenderer.invoke('studio:config:clear-api-key'),
  validateApiKey: (apiKey: string) => ipcRenderer.invoke('studio:config:validate-api-key', apiKey),
  listImages: (options?: { search?: string; limit?: number; offset?: number; projectId?: string }) =>
    ipcRenderer.invoke('studio:images:list', options),
  getImage: (imageId: string) => ipcRenderer.invoke('studio:images:get', imageId),
  toggleFavorite: (imageId: string) => ipcRenderer.invoke('studio:images:toggle-favorite', imageId),
  deleteImage: (imageId: string) => ipcRenderer.invoke('studio:images:delete', imageId),
  downloadImage: (imageId: string) => ipcRenderer.invoke('studio:images:download', imageId),
  listProjects: () => ipcRenderer.invoke('studio:projects:list'),
  pickProjectImageOutputDir: (currentPath?: string | null) =>
    ipcRenderer.invoke('studio:projects:pick-image-output-dir', currentPath ?? null),
  createProject: (input: unknown) => ipcRenderer.invoke('studio:projects:create', input),
  updateProject: (input: unknown) => ipcRenderer.invoke('studio:projects:update', input),
  deleteProject: (projectId: string) => ipcRenderer.invoke('studio:projects:delete', projectId),
  listProjectBrandAssets: (projectId: string) => ipcRenderer.invoke('studio:project-brand-assets:list', projectId),
  addProjectBrandAssets: (input: unknown) => ipcRenderer.invoke('studio:project-brand-assets:create', input),
  deleteProjectBrandAsset: (assetId: string) => ipcRenderer.invoke('studio:project-brand-assets:delete', assetId),
  listPrompts: (projectId: string) => ipcRenderer.invoke('studio:prompts:list', projectId),
  createPrompt: (input: unknown) => ipcRenderer.invoke('studio:prompts:create', input),
  updatePrompt: (input: unknown) => ipcRenderer.invoke('studio:prompts:update', input),
  deletePrompt: (promptId: string) => ipcRenderer.invoke('studio:prompts:delete', promptId),
  markPromptUsed: (promptId: string) => ipcRenderer.invoke('studio:prompts:mark-used', promptId),
  listQueueJobs: () => ipcRenderer.invoke('studio:queue:list'),
  enqueueGeneration: (request: unknown) => ipcRenderer.invoke('studio:queue:enqueue', request),
  pauseQueue: () => ipcRenderer.invoke('studio:queue:pause'),
  resumeQueue: () => ipcRenderer.invoke('studio:queue:resume'),
  cancelQueueJob: (jobId: string) => ipcRenderer.invoke('studio:queue:cancel', jobId),
  estimateCost: (resolution?: string, model?: string) => ipcRenderer.invoke('studio:estimate-cost', resolution, model),
  getSessionCost: (windowName: 'day' | 'month' | 'all' = 'day') =>
    ipcRenderer.invoke('studio:usage:session-cost', windowName),
  openExternal: (url: string) => ipcRenderer.invoke('studio:shell:open-external', url),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('studio:shell:show-item', filePath),
  onQueueUpdated: (listener: () => void) => {
    const callback = () => listener();
    ipcRenderer.on('studio:queue-updated', callback);
    return () => {
      ipcRenderer.removeListener('studio:queue-updated', callback);
    };
  },
  onImagesUpdated: (listener: () => void) => {
    const callback = () => listener();
    ipcRenderer.on('studio:images-updated', callback);
    return () => {
      ipcRenderer.removeListener('studio:images-updated', callback);
    };
  },
  onProjectsUpdated: (listener: () => void) => {
    const callback = () => listener();
    ipcRenderer.on('studio:projects-updated', callback);
    return () => {
      ipcRenderer.removeListener('studio:projects-updated', callback);
    };
  },
  onPromptsUpdated: (listener: () => void) => {
    const callback = () => listener();
    ipcRenderer.on('studio:prompts-updated', callback);
    return () => {
      ipcRenderer.removeListener('studio:prompts-updated', callback);
    };
  },
  onBrandAssetsUpdated: (listener: () => void) => {
    const callback = () => listener();
    ipcRenderer.on('studio:brand-assets-updated', callback);
    return () => {
      ipcRenderer.removeListener('studio:brand-assets-updated', callback);
    };
  },
  onMenuCommand: (listener: (command: StudioMenuCommand) => void) => {
    const callback = (_event: unknown, command: unknown) => {
      if (typeof command !== 'string') {
        return;
      }

      listener(command as StudioMenuCommand);
    };

    ipcRenderer.on('studio:menu-command', callback);
    return () => {
      ipcRenderer.removeListener('studio:menu-command', callback);
    };
  }
};

contextBridge.exposeInMainWorld('studio', studioApi);
