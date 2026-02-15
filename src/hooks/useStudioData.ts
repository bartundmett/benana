import { useEffect } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { ProjectBrandAsset, PromptTemplate, QueueJob, StudioImage, StudioProject } from '../../shared/types';
import { useStudioStore } from '../state/useStudioStore';

const QUERY_KEYS = {
  initial: ['studio', 'initial'] as const,
  config: ['studio', 'config'] as const,
  images: (search: string, projectId: string | null) => ['studio', 'images', projectId ?? 'none', search] as const,
  image: (imageId: string | null) => ['studio', 'image', imageId] as const,
  projects: ['studio', 'projects'] as const,
  brandAssets: (projectId: string | null) => ['studio', 'brand-assets', projectId ?? 'none'] as const,
  prompts: (projectId: string | null) => ['studio', 'prompts', projectId ?? 'none'] as const,
  queue: ['studio', 'queue'] as const,
  sessionCost: ['studio', 'session-cost'] as const,
  usageCost: (windowName: 'day' | 'month' | 'all') => ['studio', 'usage-cost', windowName] as const
};

export function useStudioLiveEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const disposeQueue = window.studio.onQueueUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.queue });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionCost });
      void queryClient.invalidateQueries({ queryKey: ['studio', 'usage-cost'] });
    });

    const disposeImages = window.studio.onImagesUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ['studio', 'images'] });
      void queryClient.invalidateQueries({ queryKey: ['studio', 'image'] });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
    });

    const disposeProjects =
      typeof window.studio.onProjectsUpdated === 'function'
        ? window.studio.onProjectsUpdated(() => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
            void queryClient.invalidateQueries({ queryKey: ['studio', 'images'] });
          })
        : () => {};

    const disposePrompts =
      typeof window.studio.onPromptsUpdated === 'function'
        ? window.studio.onPromptsUpdated(() => {
            void queryClient.invalidateQueries({ queryKey: ['studio', 'prompts'] });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
          })
        : () => {};

    const disposeBrandAssets =
      typeof window.studio.onBrandAssetsUpdated === 'function'
        ? window.studio.onBrandAssetsUpdated(() => {
            void queryClient.invalidateQueries({ queryKey: ['studio', 'brand-assets'] });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
          })
        : () => {};

    return () => {
      disposeQueue();
      disposeImages();
      disposeProjects();
      disposePrompts();
      disposeBrandAssets();
    };
  }, [queryClient]);
}

export function useInitialStudioState() {
  const setConfig = useStudioStore((state) => state.setConfig);

  return useQuery({
    queryKey: QUERY_KEYS.initial,
    queryFn: async () => {
      const state = await window.studio.getInitialState();
      setConfig(state.config);
      return state;
    },
    staleTime: 10_000
  });
}

export function useStudioConfig() {
  const setConfig = useStudioStore((state) => state.setConfig);

  return useQuery({
    queryKey: QUERY_KEYS.config,
    queryFn: async () => {
      const config = await window.studio.getConfig();
      setConfig(config);
      return config;
    },
    staleTime: 10_000
  });
}

export function useProjects() {
  return useQuery<StudioProject[]>({
    queryKey: QUERY_KEYS.projects,
    queryFn: () => window.studio.listProjects(),
    staleTime: 3_000
  });
}

export function useProjectPrompts(projectId: string | null) {
  return useQuery<PromptTemplate[]>({
    queryKey: QUERY_KEYS.prompts(projectId),
    queryFn: () => {
      if (!projectId) {
        return Promise.resolve([]);
      }
      return window.studio.listPrompts(projectId);
    },
    enabled: Boolean(projectId),
    staleTime: 3_000
  });
}

export function useProjectBrandAssets(projectId: string | null) {
  return useQuery<ProjectBrandAsset[]>({
    queryKey: QUERY_KEYS.brandAssets(projectId),
    queryFn: () => {
      if (!projectId) {
        return Promise.resolve([]);
      }

      return window.studio.listProjectBrandAssets(projectId);
    },
    enabled: Boolean(projectId),
    staleTime: 3_000
  });
}

export function useGalleryImages(search: string, projectId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.images(search, projectId),
    queryFn: () => {
      if (!projectId) {
        return Promise.resolve([]);
      }
      return window.studio.listImages({ search, limit: 500, projectId });
    },
    enabled: Boolean(projectId),
    staleTime: 2_000
  });
}

export function useQueueJobs() {
  return useQuery<QueueJob[]>({
    queryKey: QUERY_KEYS.queue,
    queryFn: () => window.studio.listQueueJobs(),
    staleTime: 1_000
  });
}

export function useSelectedImage(imageId: string | null) {
  return useQuery<StudioImage | null>({
    queryKey: QUERY_KEYS.image(imageId),
    queryFn: () => {
      if (!imageId) {
        return Promise.resolve(null);
      }
      return window.studio.getImage(imageId);
    },
    enabled: Boolean(imageId)
  });
}

export function useSessionCost() {
  return useQuery<number>({
    queryKey: QUERY_KEYS.sessionCost,
    queryFn: () => window.studio.getSessionCost('day'),
    staleTime: 2_000
  });
}

export function useUsageCost(windowName: 'day' | 'month' | 'all') {
  return useQuery<number>({
    queryKey: QUERY_KEYS.usageCost(windowName),
    queryFn: () => window.studio.getSessionCost(windowName),
    staleTime: 2_000
  });
}

export function useRefreshImages(): () => Promise<void> {
  const search = useStudioStore((state) => state.gallerySearch);
  const activeProjectId = useStudioStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.images(search, activeProjectId) });
  };
}
