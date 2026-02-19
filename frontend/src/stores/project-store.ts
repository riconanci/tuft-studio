import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  TuftProject,
  TuftColor,
  Layer,
  YarnEstimate,
  EditorTab,
  ProcessingStatus,
  ViewportState,
} from '@/types';

interface ProjectState {
  // Hydration
  _hasHydrated: boolean;

  // Project data
  project: TuftProject | null;

  // UI state
  activeTab: EditorTab;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  viewport: ViewportState;
  showOutline: boolean;
  outlineWidth: number;
  soloColorId: string | null;
  hiddenColorIds: Set<string>;

  // Actions — project
  initProject: (image: string) => void;
  updateSettings: (settings: Partial<Pick<TuftProject, 'width' | 'height' | 'unit' | 'paletteSize' | 'minThickness' | 'regionThreshold' | 'useYarnPalette'>>) => void;
  setProcessedResult: (data: {
    processedImage: string;
    palette: TuftColor[];
    layers: Layer[];
    yarnEstimates: YarnEstimate[];
    outlineSvg?: string;
  }) => void;
  swapColor: (colorId: string, newHex: string, newName?: string) => void;
  resetProject: () => void;

  // Actions — UI
  setActiveTab: (tab: EditorTab) => void;
  setProcessingStatus: (status: ProcessingStatus, error?: string) => void;
  setViewport: (viewport: Partial<ViewportState>) => void;
  toggleOutline: () => void;
  setOutlineWidth: (width: number) => void;
  setSoloColor: (colorId: string | null) => void;
  toggleColorVisibility: (colorId: string) => void;
}

const DEFAULT_SETTINGS = {
  width: 36,
  height: 24,
  unit: 'in' as const,
  paletteSize: 8,
  minThickness: 5, // mm
  regionThreshold: 0.002, // 0.2%
  useYarnPalette: true,
};

// ──────────────────────────────────────────────
// IndexedDB storage adapter for zustand persist
// ──────────────────────────────────────────────

function createIndexedDBStorage() {
  const DB_NAME = 'tuft-studio';
  const STORE_NAME = 'state';

  function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(name);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        });
      } catch {
        return null;
      }
    },
    setItem: async (name: string, value: string): Promise<void> => {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(value, name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch {
        // Silently fail — persistence is best-effort
      }
    },
    removeItem: async (name: string): Promise<void> => {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch {
        // Silently fail
      }
    },
  };
}

// ──────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      // Initial state
      _hasHydrated: false,
      project: null,
      activeTab: 'settings',
      processingStatus: 'idle',
      processingError: null,
      viewport: { zoom: 1, panX: 0, panY: 0 },
      showOutline: true,
      outlineWidth: 2,
      soloColorId: null,
      hiddenColorIds: new Set(),

      // Project actions
      initProject: (image: string) => {
        set({
          project: {
            id: crypto.randomUUID(),
            originalImage: image,
            ...DEFAULT_SETTINGS,
            palette: [],
            processedLayers: [],
            yarnEstimates: [],
          },
          processingStatus: 'idle',
          processingError: null,
          activeTab: 'settings',
          soloColorId: null,
          hiddenColorIds: new Set(),
        });
      },

      updateSettings: (settings) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, ...settings } });
      },

      setProcessedResult: (data) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            processedImage: data.processedImage,
            palette: data.palette,
            processedLayers: data.layers,
            yarnEstimates: data.yarnEstimates,
            outlineSvg: data.outlineSvg || '',
          },
          processingStatus: 'done',
          processingError: null,
        });
      },

      swapColor: (colorId, newHex, newName) => {
        const { project } = get();
        if (!project || !project.processedImage) return;

        const oldColor = project.palette.find((c) => c.id === colorId);
        if (!oldColor) return;

        const parseHex = (hex: string) => {
          const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          if (!m) return [0, 0, 0];
          return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
        };

        const oldRgb = oldColor.rgb;
        const newRgb = parseHex(newHex) as [number, number, number];

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          const tol = 8;
          for (let i = 0; i < data.length; i += 4) {
            if (
              Math.abs(data[i] - oldRgb[0]) <= tol &&
              Math.abs(data[i + 1] - oldRgb[1]) <= tol &&
              Math.abs(data[i + 2] - oldRgb[2]) <= tol
            ) {
              data[i] = newRgb[0];
              data[i + 1] = newRgb[1];
              data[i + 2] = newRgb[2];
            }
          }

          ctx.putImageData(imageData, 0, 0);
          const newDataUrl = canvas.toDataURL('image/png');

          const newPalette = project.palette.map((c) =>
            c.id === colorId
              ? { ...c, rgb: newRgb, hex: newHex, name: newName ?? '' }
              : c
          );

          set({
            project: {
              ...project,
              processedImage: newDataUrl,
              palette: newPalette,
            },
          });
        };
        img.src = project.processedImage;
      },

      resetProject: () => {
        set({
          project: null,
          processingStatus: 'idle',
          processingError: null,
          soloColorId: null,
          hiddenColorIds: new Set(),
        });
      },

      // UI actions
      setActiveTab: (tab) => set({ activeTab: tab }),

      setProcessingStatus: (status, error) =>
        set({ processingStatus: status, processingError: error || null }),

      setViewport: (viewport) =>
        set((state) => ({ viewport: { ...state.viewport, ...viewport } })),

      toggleOutline: () => set((state) => ({ showOutline: !state.showOutline })),

      setOutlineWidth: (width) => set({ outlineWidth: width }),

      setSoloColor: (colorId) => set({ soloColorId: colorId }),

      toggleColorVisibility: (colorId) =>
        set((state) => {
          const next = new Set(state.hiddenColorIds);
          if (next.has(colorId)) {
            next.delete(colorId);
          } else {
            next.add(colorId);
          }
          return { hiddenColorIds: next };
        }),
    }),
    {
      name: 'tuft-studio-project',
      storage: createJSONStorage(() => createIndexedDBStorage()),
      // Only persist project data + key UI prefs (not transient state)
      partialize: (state) => ({
        project: state.project,
        activeTab: state.activeTab,
        showOutline: state.showOutline,
        outlineWidth: state.outlineWidth,
        hiddenColorIds: Array.from(state.hiddenColorIds),
      }),
      merge: (persisted: any, current) => ({
        ...current,
        ...(persisted || {}),
        // Restore Set from serialized array
        hiddenColorIds: new Set(persisted?.hiddenColorIds || []),
        // Don't restore stale processing status
        processingStatus: 'idle' as ProcessingStatus,
        processingError: null,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state._hasHydrated = true;
          }
        };
      },
    }
  )
);
