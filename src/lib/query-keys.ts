import type { TaskFilters } from "@/store/ui-store";
import type { DocumentStatus, TaskPriority } from "@/types/database";

export interface DocumentQueryFilters {
  status?: DocumentStatus | null;
  officeId?: string | null;
  category?: string | null;
  search?: string | null;
  priority?: TaskPriority | null;
}

export const queryKeys = {
  profiles: ["profiles"] as const,
  accounts: ["accounts"] as const,
  offices: ["offices"] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meetings", id] as const,
  meetingItems: (meetingId: string) => ["meeting-items", meetingId] as const,
  meetingItemStats: ["meeting-items", "stats"] as const,
  tasks: (filters?: Partial<TaskFilters> & { meetingId?: string | null }) =>
    ["tasks", filters ?? {}] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
  documentsAll: ["documents"] as const,
  documents: (filters?: DocumentQueryFilters) =>
    ["documents", filters ?? {}] as const,
  document: (id: string) => ["documents", "detail", id] as const,
  documentHandoffs: (id: string) => ["document-handoffs", id] as const,
  myPendingHandoffs: ["my-pending-handoffs"] as const,
  documentsWithPendingHandoffs: ["documents-with-pending-handoffs"] as const,
  documentHoldersAll: ["document-holders"] as const,
  documentHolders: (id: string) => ["document-holders", id] as const,
  documentAttachments: (id: string) => ["document-attachments", id] as const,
  documentLogs: (id: string) => ["document-logs", id] as const,
};
