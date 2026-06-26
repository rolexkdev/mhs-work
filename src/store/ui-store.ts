import { create } from "zustand";
import type { TaskStatus, TaskPriority } from "@/types/database";

/**
 * Zustand store cho UI state (filter, view mode) — không phải server data.
 * Server data nên để TanStack Query quản lý.
 */
export type TaskView = "table" | "kanban" | "calendar";

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
  sidebarOpen: boolean;
  setTaskView: (view: TaskView) => void;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
  resetFilters: () => void;
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
  sidebarOpen: true,
  setTaskView: (taskView) => set({ taskView }),
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
