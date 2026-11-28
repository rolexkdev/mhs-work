import type { TaskFilters } from "@/store/ui-store";

export const queryKeys = {
  /** Id of the signed-in user (ownership checks). */
  currentUser: ["auth", "current-user"] as const,
  profiles: ["profiles"] as const,
  /** Profile of the signed-in user (role). */
  currentProfile: ["profiles", "current"] as const,
  /** Role of the signed-in user (admin / leader / member). */
  currentRole: ["profiles", "current", "role"] as const,
  accounts: ["accounts"] as const,
  accountActivity: (userId: string, days: number) =>
    ["accounts", "activity", userId, days] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meetings", id] as const,
  meetingItems: (meetingId: string) => ["meeting-items", meetingId] as const,
  tasks: (
    filters?: Partial<TaskFilters> & {
      meetingId?: string | null;
      withDeleted?: boolean;
    },
  ) => ["tasks", filters ?? {}] as const,
  /** Trashed tasks (admin trash page). */
  taskTrash: ["tasks", "trash"] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
  /** Categories (Hạng mục) of every department. */
  taskCategories: ["task-categories"] as const,
  taskComments: (taskId: string) => ["comments", taskId] as const,
  taskCommentEdits: (commentId: string) =>
    ["comments", "edits", commentId] as const,
  /** Bell notifications of the signed-in user. */
  notifications: ["notifications"] as const,
  documents: ["documents"] as const,
  document: (id: string) => ["documents", "detail", id] as const,
  documentEvents: (id: string) => ["documents", "events", id] as const,
};
