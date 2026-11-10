"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";
import { useCurrentUserId } from "@/modules/auth/use-current-user";
import {
  useCanManageDocuments,
  useDeleteDocument,
  useDocuments,
} from "@/modules/documents/hooks";
import { DocumentFormDialog } from "@/modules/documents/components/document-form-dialog";
import { DocumentListView } from "@/modules/documents/components/document-list-view";
import { DocumentStats } from "@/modules/documents/components/document-stats";
import { documentStatus } from "@/modules/documents/status";
import { useUiStore } from "@/store/ui-store";
import type { DocumentWithSteps } from "@/types/database";

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt hoa thường và dấu. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

/** Tên hồ sơ, người gửi (tên/email) và phòng ban đang giữ. */
function searchText(doc: DocumentWithSteps): string {
  return normalize(
    [
      doc.name,
      doc.sender?.full_name,
      doc.sender?.email,
      documentStatus(doc).holder,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Trang Hồ sơ: thẻ thống kê, ô tìm kiếm, bộ lọc trạng thái và danh sách.
 * Bộ lọc nằm trong Zustand vì chỉ là UI state; dữ liệu hồ sơ do TanStack Query.
 */
export function DocumentsWorkspace() {
  const { data: documents = [], isLoading, error } = useDocuments();
  const currentUserId = useCurrentUserId();
  const canManage = useCanManageDocuments();
  const deleteDocument = useDeleteDocument();

  const documentStatusFilter = useUiStore((s) => s.documentStatus);
  const setDocumentStatus = useUiStore((s) => s.setDocumentStatus);
  const documentQuery = useUiStore((s) => s.documentQuery);
  const setDocumentQuery = useUiStore((s) => s.setDocumentQuery);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentWithSteps | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentWithSteps | null>(
    null,
  );

  const filtered = useMemo(() => {
    const query = normalize(documentQuery.trim());
    return documents.filter((doc) => {
      if (
        documentStatusFilter &&
        documentStatus(doc).status !== documentStatusFilter
      ) {
        return false;
      }
      return !query || searchText(doc).includes(query);
    });
  }, [documents, documentStatusFilter, documentQuery]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        {friendlyError(error)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[86px] w-full" />
          ))}
        </div>
      ) : (
        <DocumentStats
          documents={documents}
          status={documentStatusFilter}
          onStatusChange={setDocumentStatus}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={documentQuery}
            onChange={(e) => setDocumentQuery(e.target.value)}
            placeholder="Tìm theo tên hồ sơ, người gửi hoặc phòng ban đang giữ..."
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Thêm hồ sơ
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Chưa có hồ sơ nào. Bấm Thêm hồ sơ để bắt đầu.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Không có hồ sơ phù hợp.
          </p>
        </div>
      ) : (
        <DocumentListView
          documents={filtered}
          currentUserId={currentUserId}
          canManage={canManage}
          onEdit={setEditing}
          onDelete={setPendingDelete}
        />
      )}

      <DocumentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DocumentFormDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        document={editing}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Xoá hồ sơ?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" sẽ bị xoá vĩnh viễn cùng lộ trình và lịch sử xử lý.`
            : undefined
        }
        confirmLabel="Xoá"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteDocument.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}
