"use client";

import { cn } from "@/lib/utils";
import { DEPARTMENTS, TAG_COLOR_CLASS, colorOf } from "@/modules/tasks/constants";
import {
  DOCUMENT_STATUS_BADGE,
  documentStatus,
} from "@/modules/documents/status";
import type { DocumentWithSteps } from "@/types/database";

// Bố cục cột (inline style để Tailwind không phải sinh class động)
const GRID_STYLE = { gridTemplateColumns: "minmax(240px,1.6fr) 170px 150px" };

/**
 * Bảng hồ sơ: tên + người gửi, phòng ban đang giữ, trạng thái.
 * Markup theo task-list-view.tsx (grid, pill màu như /tasks).
 */
export function DocumentListView({
  documents,
}: {
  documents: DocumentWithSteps[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="min-w-[560px]">
        {/* Header */}
        <div
          className="grid items-center gap-x-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground"
          style={GRID_STYLE}
        >
          <span className="truncate">Hồ sơ</span>
          <span className="truncate">Đang giữ</span>
          <span className="truncate">Trạng thái</span>
        </div>

        {documents.map((doc) => {
          const status = documentStatus(doc);
          const senderName =
            doc.sender?.full_name ?? doc.sender?.email ?? "—";

          return (
            <div
              key={doc.id}
              className="grid items-center gap-x-4 border-b px-4 py-2.5 last:border-0 hover:bg-muted/30"
              style={GRID_STYLE}
            >
              {/* Tên hồ sơ + người gửi */}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{doc.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Người gửi: {senderName}
                </p>
              </div>

              {/* Phòng ban đang giữ */}
              <div className="min-w-0">
                {status.holder ? (
                  <span
                    className={cn(
                      "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium",
                      TAG_COLOR_CLASS[colorOf(DEPARTMENTS, status.holder)],
                    )}
                  >
                    {status.holder}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/60">—</span>
                )}
              </div>

              {/* Trạng thái */}
              <div className="min-w-0">
                <span
                  className={cn(
                    "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium",
                    DOCUMENT_STATUS_BADGE[status.status],
                  )}
                >
                  {status.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
