import type { TaskFilters } from "@/store/ui-store";

export const queryKeys = {
  profiles: ["profiles"] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meetings", id] as const,
  tasks: (filters?: Partial<TaskFilters> & { meetingId?: string | null }) =>
    ["tasks", filters ?? {}] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
};
