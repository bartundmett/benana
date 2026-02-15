import { create } from 'zustand';

import type { StudioConfigPublic } from '../../shared/types';

export type StudioView = 'gallery' | 'create' | 'projects' | 'prompts' | 'queue' | 'settings';

export interface RemixDraft {
  prompt: string;
  sourceImageId?: string;
  sourceImageUrl?: string;
  sourceImageName?: string;
}

export interface PromptTemplateDraft {
  prompt: string;
  templateId?: string;
}

interface StudioUiState {
  activeView: StudioView;
  activeProjectId: string | null;
  selectedImageId: string | null;
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  commandPaletteOpen: boolean;
  gallerySearch: string;
  config: StudioConfigPublic | null;
  pendingRemix: RemixDraft | null;
  pendingPromptTemplate: PromptTemplateDraft | null;
  setActiveView: (view: StudioView) => void;
  setActiveProjectId: (projectId: string | null) => void;
  setSelectedImageId: (imageId: string | null) => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setGallerySearch: (value: string) => void;
  setConfig: (config: StudioConfigPublic) => void;
  setPendingRemix: (payload: RemixDraft | null) => void;
  setPendingPromptTemplate: (payload: PromptTemplateDraft | null) => void;
}

export const useStudioStore = create<StudioUiState>((set) => ({
  activeView: 'gallery',
  activeProjectId: null,
  selectedImageId: null,
  sidebarCollapsed: false,
  inspectorCollapsed: true,
  commandPaletteOpen: false,
  gallerySearch: '',
  config: null,
  pendingRemix: null,
  pendingPromptTemplate: null,
  setActiveView: (view) => set({ activeView: view }),
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  setSelectedImageId: (selectedImageId) => set({ selectedImageId }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleInspector: () => set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
  setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setGallerySearch: (gallerySearch) => set({ gallerySearch }),
  setConfig: (config) => set({ config }),
  setPendingRemix: (pendingRemix) => set({ pendingRemix }),
  setPendingPromptTemplate: (pendingPromptTemplate) => set({ pendingPromptTemplate })
}));
