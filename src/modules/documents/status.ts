import type { DocumentRecord, DocumentStep } from "@/types/database";

export type DocumentStatusKey =
  | "pending"
  | "in_progress"
  | "returned"
  | "returning"
  | "done";

/** Hand-back sub-status, only set while status is "returning" (0019). */
export type DocumentHandbackKey =
  | "awaiting_return"
  | "received_back"
  | "awaiting_sender";

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatusKey, string> = {
  pending: "Chờ gửi",
  in_progress: "Đang xử lý",
  returned: "Cần bổ sung",
  returning: "Đang trả về",
  done: "Hoàn thành",
};

export const DOCUMENT_HANDBACK_LABEL: Record<DocumentHandbackKey, string> = {
  awaiting_return: "Chờ nhận lại",
  received_back: "Đã nhận lại",
  awaiting_sender: "Chờ người gửi nhận",
};

/** Display order: draft → in progress → returned → returning → done. */
export const DOCUMENT_STATUS_ORDER: DocumentStatusKey[] = [
  "pending",
  "in_progress",
  "returned",
  "returning",
  "done",
];

/**
 * Pill classes per status, same Notion-style palette as task statuses
 * (draft gray, in progress blue, returned orange, returning violet,
 * done emerald).
 */
export const DOCUMENT_STATUS_BADGE: Record<DocumentStatusKey, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  returned: "bg-orange-100 text-orange-700 border-orange-200",
  returning: "bg-violet-100 text-violet-700 border-violet-200",
  done: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export interface DocumentStatusInfo {
  status: DocumentStatusKey;
  /** Exact text to show; the sub-status label while returning. */
  label: string;
  /** Hand-back sub-status, null outside the "returning" status. */
  handback: DocumentHandbackKey | null;
  /**
   * Who holds the paper now. null when it has not been sent or is done.
   * Returned documents and documents received back are at KCN.
   */
  holder: string | null;
}

type DocumentStatusInput = Pick<
  DocumentRecord,
  "finished_at" | "received_back_at" | "handed_over_at"
> & {
  steps: DocumentStep[];
};

function info(
  status: Exclude<DocumentStatusKey, "returning">,
  holder: string | null,
): DocumentStatusInfo {
  return { status, label: DOCUMENT_STATUS_LABEL[status], handback: null, holder };
}

function handback(
  key: DocumentHandbackKey,
  holder: string | null,
): DocumentStatusInfo {
  return {
    status: "returning",
    label: DOCUMENT_HANDBACK_LABEL[key],
    handback: key,
    holder,
  };
}

/**
 * Derive the display status and current holder from the step rows and the
 * hand-back columns. No stored status field is read because status is
 * never stored.
 */
export function documentStatus(doc: DocumentStatusInput): DocumentStatusInfo {
  if (doc.finished_at) return info("done", null);

  const steps = [...doc.steps].sort((a, b) => a.step_order - b.step_order);
  if (steps.length === 0) return info("pending", null);

  const current = steps.find((step) => !step.done_at);

  // Route done: the paper travels back to KCN, then to the sender.
  if (!current) {
    if (doc.handed_over_at) return handback("awaiting_sender", "KCN");
    if (doc.received_back_at) return handback("received_back", "KCN");
    return handback("awaiting_return", steps[steps.length - 1].department);
  }

  if (current.returned_at) return info("returned", "KCN");
  if (!current.received_at) return info("pending", null);
  return info("in_progress", current.department);
}
