"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import type { DocumentWithSteps } from "@/types/database";

/**
 * Trang Hồ sơ: nút thêm hồ sơ + danh sách, hộp thoại sửa và xác nhận xoá.
 * Ô tìm kiếm, thẻ thống kê, bộ lọc và panel chi tiết sẽ thêm ở các bước sau.
 */
export function DocumentsWorkspace() {
  const { data: documents = [], isLoading, error } = useDocuments();
  const currentUserId = useCurrentUserId();
  const canManage = useCanManageDocuments();
  const deleteDocument = useDeleteDocument();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentWithSteps | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentWithSteps | null>(
    null,
  );

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        {friendlyError(error)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
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
      ) : (
        <DocumentListView
          documents={documents}
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
