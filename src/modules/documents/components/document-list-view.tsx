"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEPARTMENTS, TAG_COLOR_CLASS, colorOf } from "@/modules/tasks/constants";
import {
  DOCUMENT_STATUS_BADGE,
  documentStatus,
} from "@/modules/documents/status";
import type { DocumentWithSteps } from "@/types/database";

// Bố cục cột (inline style để Tailwind không phải sinh class động)
const GRID_STYLE = {
  gridTemplateColumns: "minmax(220px,1.4fr) 170px 150px 44px",
};

/**
 * Bảng hồ sơ: tên + người gửi, phòng ban đang giữ, trạng thái và thao tác.
 * Markup theo task-list-view.tsx (grid, pill màu như /tasks).
 * Quyền sửa/xoá được tính ở đây để ẩn nút, RLS vẫn là nơi quyết định cuối.
 */
export function DocumentListView({
  documents,
  currentUserId,
  canManage,
  onEdit,
  onDelete,
}: {
  documents: DocumentWithSteps[];
  currentUserId: string | null;
  canManage: boolean;
  onEdit: (doc: DocumentWithSteps) => void;
  onDelete: (doc: DocumentWithSteps) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="min-w-[640px]">
        {/* Header */}
        <div
          className="grid items-center gap-x-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground"
          style={GRID_STYLE}
        >
          <span className="truncate">Hồ sơ</span>
          <span className="truncate">Đang giữ</span>
          <span className="truncate">Trạng thái</span>
          <span />
        </div>

        {documents.map((doc) => {
          const status = documentStatus(doc);
          const senderName = doc.sender?.full_name ?? doc.sender?.email ?? "—";
          const isCreator = !!currentUserId && doc.created_by === currentUserId;
          // Creator or manager may edit info; delete only while pending,
          // or in any status for a manager (mirrors the RLS policies).
          const canEdit = canManage || isCreator;
          const canDelete =
            canManage || (isCreator && status.status === "pending");

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

              {/* Thao tác */}
              <div className="flex justify-end">
                {(canEdit || canDelete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onClick={() => onEdit(doc)}>
                          <Pencil className="h-4 w-4" /> Chỉnh sửa
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem
                          onClick={() => onDelete(doc)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" /> Xoá
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
