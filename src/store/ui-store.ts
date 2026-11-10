import { create } from "zustand";
import type { TaskStatus, TaskPriority } from "@/types/database";
import type { DocumentStatusKey } from "@/modules/documents/status";

/**
 * Zustand store cho UI state (filter, view mode) — không phải server data.
 * Server data nên để TanStack Query quản lý.
 */
export type TaskView = "table" | "kanban" | "calendar";

/** List now; the board view arrives in a later plan step. */
export type DocumentView = "list" | "board";

export interface TaskFilters {
  assigneeId: string | null;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  meetingId: string | null;
  range: "week" | "month" | "all";
}

interface UiState {
  taskView: TaskView;
  filters: TaskFilters;
  documentView: DocumentView;
  /** null means "Tất cả". */
  documentStatus: DocumentStatusKey | null;
  documentQuery: string;
  sidebarOpen: boolean;
  setTaskView: (view: TaskView) => void;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
  resetFilters: () => void;
  setDocumentView: (view: DocumentView) => void;
  setDocumentStatus: (status: DocumentStatusKey | null) => void;
  setDocumentQuery: (query: string) => void;
  toggleSidebar: () => void;
}

const defaultFilters: TaskFilters = {
  assigneeId: null,
  status: null,
  priority: null,
  meetingId: null,
  range: "all",
};

export const useUiStore = create<UiState>((set) => ({
  taskView: "table",
  filters: defaultFilters,
  documentView: "list",
  documentStatus: null,
  documentQuery: "",
  sidebarOpen: true,
  setTaskView: (taskView) => set({ taskView }),
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters }),
  setDocumentView: (documentView) => set({ documentView }),
  setDocumentStatus: (documentStatus) => set({ documentStatus }),
  setDocumentQuery: (documentQuery) => set({ documentQuery }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
