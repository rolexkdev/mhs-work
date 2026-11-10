import type { DocumentRecord, DocumentStep } from "@/types/database";

export type DocumentStatusKey = "pending" | "in_progress" | "returned" | "done";

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatusKey, string> = {
  pending: "Chờ gửi",
  in_progress: "Đang xử lý",
  returned: "Cần bổ sung",
  done: "Hoàn thành",
};

/** Display order: draft → in progress → returned → done. */
export const DOCUMENT_STATUS_ORDER: DocumentStatusKey[] = [
  "pending",
  "in_progress",
  "returned",
  "done",
];

export interface DocumentStatusInfo {
  status: DocumentStatusKey;
  label: string;
  /**
   * Department currently holding the document. null when it has not been
   * sent or is done. Returned documents are back at KCN.
   */
  holder: string | null;
}

type DocumentStatusInput = Pick<DocumentRecord, "finished_at"> & {
  steps: DocumentStep[];
};

/**
 * Derive the display status and current holder from the step rows.
 * No stored status field is read because status is never stored.
 */
export function documentStatus(doc: DocumentStatusInput): DocumentStatusInfo {
  if (doc.finished_at) {
    return { status: "done", label: DOCUMENT_STATUS_LABEL.done, holder: null };
  }

  const steps = [...doc.steps].sort((a, b) => a.step_order - b.step_order);
  const current = steps.find((step) => !step.done_at);

  // No step at all, or every step is done without a completion marker.
  if (!current) {
    if (steps.length === 0) {
      return {
        status: "pending",
        label: DOCUMENT_STATUS_LABEL.pending,
        holder: null,
      };
    }

    return { status: "done", label: DOCUMENT_STATUS_LABEL.done, holder: null };
  }

  if (current.returned_at) {
    return {
      status: "returned",
      label: DOCUMENT_STATUS_LABEL.returned,
      holder: "KCN",
    };
  }

  if (!current.received_at) {
    return {
      status: "pending",
      label: DOCUMENT_STATUS_LABEL.pending,
      holder: null,
    };
  }

  return {
    status: "in_progress",
    label: DOCUMENT_STATUS_LABEL.in_progress,
    holder: current.department,
  };
}
