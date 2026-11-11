"use client";

import { cn } from "@/lib/utils";
import { formatShortDateTime } from "@/lib/format";
import {
  DEPARTMENTS,
  TAG_COLOR_CLASS,
} from "@/modules/tasks/constants";
import {
  DOCUMENT_STATUS_BADGE,
  documentStatus,
} from "@/modules/documents/status";
import type { DocumentStep, DocumentWithSteps } from "@/types/database";

const RETURNED_KEY = "__returned";
const HANDBACK_KEY = "__handback";
const OTHER_KEY = "__other";

interface BoardColumn {
  key: string;
  label: string;
  badge: string;
  documents: DocumentWithSteps[];
}

/** Bước đang giữ hồ sơ: bước đầu tiên chưa xong. */
function currentStepOf(doc: DocumentWithSteps): DocumentStep | null {
  return (
    [...doc.steps]
      .sort((a, b) => a.step_order - b.step_order)
      .find((step) => !step.done_at) ?? null
  );
}

/** Dòng thời gian ngắn trên thẻ: mốc gần nhất của trạng thái hiện tại. */
function cardTimeLine(doc: DocumentWithSteps): string {
  const status = documentStatus(doc);
  switch (status.handback) {
    case "awaiting_return": {
      const last = [...doc.steps].sort(
        (a, b) => b.step_order - a.step_order,
      )[0];
      return `${status.label} · xong ${formatShortDateTime(last?.done_at)}`;
    }
    case "received_back":
      return `${status.label} ${formatShortDateTime(doc.received_back_at)}`;
    case "awaiting_sender":
      return `${status.label} · bàn giao ${formatShortDateTime(doc.handed_over_at)}`;
    default:
      return `nhận ${formatShortDateTime(currentStepOf(doc)?.received_at)}`;
  }
}

/**
 * Bảng theo phòng ban đang giữ: mỗi phòng ban một cột, thêm cột "Chờ bổ sung"
 * cho hồ sơ bị trả lại, "Trả người gửi" cho hồ sơ đã về KCN và "Khác" cho
 * phòng ban không còn trong DEPARTMENTS. Hồ sơ chờ nhận lại vẫn nằm ở cột
 * phòng ban cuối vì bản giấy còn ở đó. Chưa gửi và Hoàn thành không lên bảng.
 */
export function DocumentBoardView({
  documents,
  onOpen,
}: {
  documents: DocumentWithSteps[];
  onOpen: (doc: DocumentWithSteps) => void;
}) {
  const returned = documents.filter(
    (doc) => documentStatus(doc).status === "returned",
  );
  // Held by a department: in progress, or route done but not picked up yet.
  const inProgress = documents.filter((doc) => {
    const status = documentStatus(doc);
    return (
      status.status === "in_progress" || status.handback === "awaiting_return"
    );
  });
  const handback = documents.filter((doc) => {
    const key = documentStatus(doc).handback;
    return key === "received_back" || key === "awaiting_sender";
  });

  const departmentNames = new Set(DEPARTMENTS.map((d) => d.value));

  const columns: BoardColumn[] = DEPARTMENTS.map((department) => ({
    key: department.value,
    label: department.value,
    badge: TAG_COLOR_CLASS[department.color],
    documents: inProgress.filter(
      (doc) => documentStatus(doc).holder === department.value,
    ),
  }));

  columns.push({
    key: RETURNED_KEY,
    label: "Chờ bổ sung",
    badge: DOCUMENT_STATUS_BADGE.returned,
    documents: returned,
  });

  columns.push({
    key: HANDBACK_KEY,
    label: "Trả người gửi",
    badge: DOCUMENT_STATUS_BADGE.returning,
    documents: handback,
  });

  // In-progress documents held by a department no longer in DEPARTMENTS.
  const other = inProgress.filter((doc) => {
    const holder = documentStatus(doc).holder;
    return !!holder && !departmentNames.has(holder);
  });
  if (other.length > 0) {
    columns.push({
      key: OTHER_KEY,
      label: "Khác",
      badge: TAG_COLOR_CLASS.gray,
      documents: other,
    });
  }

  return (
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:snap-none">
      {columns.map((column) => (
        <div
          key={column.key}
          className="flex w-60 shrink-0 snap-start flex-col"
        >
          <div className="mb-2 flex items-center gap-2 px-1">
            <span
              className={cn(
                "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium",
                column.badge,
              )}
            >
              {column.label}
            </span>
            <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
              {column.documents.length}
            </span>
          </div>

          <div className="flex min-h-[120px] flex-1 flex-col gap-2 rounded-lg border border-dashed border-transparent bg-muted/40 p-2">
            {column.documents.map((doc) => {
              const senderName =
                doc.sender?.full_name ?? doc.sender?.email ?? "—";

              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onOpen(doc)}
                  className="w-full cursor-pointer space-y-2 rounded-lg border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md"
                >
                  <p className="text-sm font-medium leading-snug">
                    {doc.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Người gửi: {senderName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {cardTimeLine(doc)}
                  </p>
                </button>
              );
            })}
            {column.documents.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Không giữ hồ sơ nào.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
