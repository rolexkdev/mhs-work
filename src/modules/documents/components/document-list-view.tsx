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
import { DocumentStepper } from "@/modules/documents/components/document-stepper";
import type { DocumentWithSteps } from "@/types/database";

// Bố cục cột (inline style để Tailwind không phải sinh class động)
const GRID_STYLE = {
  gridTemplateColumns: "minmax(220px,1.4fr) 170px minmax(260px,2fr) 130px 44px",
};

/**
 * Edit / delete permissions shared by the table rows and the mobile cards:
 * creator or manager may edit info; delete only while pending, or in any
 * status for a manager (mirrors the RLS policies). RLS still decides.
 */
function editDeletePermissions(
  doc: DocumentWithSteps,
  currentUserId: string | null,
  canManage: boolean,
): { canEdit: boolean; canDelete: boolean } {
  const status = documentStatus(doc);
  const isCreator = !!currentUserId && doc.created_by === currentUserId;
  return {
    canEdit: canManage || isCreator,
    canDelete: canManage || (isCreator && status.status === "pending"),
  };
}

/**
 * Bảng hồ sơ: tên + người gửi, phòng ban đang giữ, trạng thái và thao tác.
 * Markup theo task-list-view.tsx (grid, pill màu như /tasks); dưới md mỗi
 * hồ sơ là một thẻ, bảng đầy đủ chỉ hiện từ md trở lên.
 */
export function DocumentListView({
  documents,
  currentUserId,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  documents: DocumentWithSteps[];
  currentUserId: string | null;
  canManage: boolean;
  onOpen: (doc: DocumentWithSteps) => void;
  onEdit: (doc: DocumentWithSteps) => void;
  onDelete: (doc: DocumentWithSteps) => void;
}) {
  return (
    <>
      {/* ── Phone: one card per document ── */}
      <div className="space-y-3 md:hidden">
        {documents.map((doc) => (
          <MobileDocumentCard
            key={doc.id}
            doc={doc}
            currentUserId={currentUserId}
            canManage={canManage}
            onOpen={onOpen}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* ── Máy tính: bảng đầy đủ ── */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <div className="min-w-[980px]">
          {/* Header */}
          <div
            className="grid items-center gap-x-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground"
            style={GRID_STYLE}
          >
            <span className="truncate">Hồ sơ</span>
            <span className="truncate">Đang giữ</span>
            <span className="truncate">Hành trình</span>
            <span className="truncate">Trạng thái</span>
            <span />
          </div>

          {documents.map((doc) => {
            const status = documentStatus(doc);
            const senderName = doc.sender?.full_name ?? doc.sender?.email ?? "—";
            const { canEdit, canDelete } = editDeletePermissions(
              doc,
              currentUserId,
              canManage,
            );

            return (
              <div
                key={doc.id}
                onClick={() => onOpen(doc)}
                className="grid cursor-pointer items-center gap-x-4 border-b px-4 py-2.5 last:border-0 hover:bg-muted/30"
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

                {/* Lộ trình */}
                <div className="min-w-0">
                  <DocumentStepper
                    steps={doc.steps}
                    finishedAt={doc.finished_at}
                  />
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

                {/* Thao tác — bấm vào đây không mở chi tiết */}
                <div
                  className="flex justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
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
    </>
  );
}

/**
 * One document on a phone: the 980px grid table cannot be swiped, so the
 * info stacks vertically and the route stepper scrolls horizontally inside
 * the card instead of stretching the page. Tapping the card opens the
 * detail sheet; the actions menu stops the click like a table row.
 */
function MobileDocumentCard({
  doc,
  currentUserId,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  doc: DocumentWithSteps;
  currentUserId: string | null;
  canManage: boolean;
  onOpen: (doc: DocumentWithSteps) => void;
  onEdit: (doc: DocumentWithSteps) => void;
  onDelete: (doc: DocumentWithSteps) => void;
}) {
  const status = documentStatus(doc);
  const senderName = doc.sender?.full_name ?? doc.sender?.email ?? "—";
  const { canEdit, canDelete } = editDeletePermissions(
    doc,
    currentUserId,
    canManage,
  );

  return (
    <div
      onClick={() => onOpen(doc)}
      className="cursor-pointer space-y-2.5 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:bg-muted/40"
    >
      {/* Tên hồ sơ, trạng thái và thao tác góc phải */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 line-clamp-2 text-[15px] font-medium leading-snug">
          {doc.name}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              DOCUMENT_STATUS_BADGE[status.status],
            )}
          >
            {status.label}
          </span>

          {/* Thao tác — bấm vào đây không mở chi tiết */}
          {(canEdit || canDelete) && (
            <div className="flex" onClick={(e) => e.stopPropagation()}>
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
            </div>
          )}
        </div>
      </div>

      {/* Người gửi + phòng ban đang giữ */}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          Người gửi: {senderName}
        </p>
        {status.holder ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              TAG_COLOR_CLASS[colorOf(DEPARTMENTS, status.holder)],
            )}
          >
            {status.holder}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground/60">—</span>
        )}
      </div>

      {/* Lộ trình — cuộn ngang trong thẻ, không kéo theo cả trang */}
      <div className="overflow-x-auto rounded-lg border bg-muted/20 px-2 py-3">
        <DocumentStepper steps={doc.steps} finishedAt={doc.finished_at} />
      </div>
    </div>
  );
}
