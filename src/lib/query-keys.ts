import type { TaskFilters } from "@/store/ui-store";

export const queryKeys = {
  /** Id of the signed-in user (ownership checks). */
  currentUser: ["auth", "current-user"] as const,
  profiles: ["profiles"] as const,
  /** Profile of the signed-in user (role + document manager flag). */
  currentProfile: ["profiles", "current"] as const,
  accounts: ["accounts"] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meetings", id] as const,
  meetingItems: (meetingId: string) => ["meeting-items", meetingId] as const,
  meetingItemStats: ["meeting-items", "stats"] as const,
  tasks: (filters?: Partial<TaskFilters> & { meetingId?: string | null }) =>
    ["tasks", filters ?? {}] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
  documents: ["documents"] as const,
  document: (id: string) => ["documents", "detail", id] as const,
  documentEvents: (id: string) => ["documents", "events", id] as const,
};
