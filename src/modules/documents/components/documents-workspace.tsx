"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";
import { useDocuments } from "@/modules/documents/hooks";
import { DocumentListView } from "@/modules/documents/components/document-list-view";

/**
 * Trang Hồ sơ: chỉ hiển thị danh sách ở bước này.
 * Ô tìm kiếm, thẻ thống kê, bộ lọc và panel chi tiết sẽ thêm ở các bước sau.
 */
export function DocumentsWorkspace() {
  const { data: documents = [], isLoading, error } = useDocuments();

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        {friendlyError(error)}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Không có hồ sơ phù hợp.</p>
      </div>
    );
  }

  return <DocumentListView documents={documents} />;
}
