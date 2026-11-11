"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  DOCUMENT_STATUS_BADGE,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_ORDER,
  documentStatus,
  type DocumentStatusKey,
} from "@/modules/documents/status";
import type { DocumentWithSteps } from "@/types/database";

/**
 * Thẻ thống kê: Tất cả + 5 trạng thái, bấm để lọc danh sách.
 * Số đếm luôn tính trên toàn bộ hồ sơ, không phụ thuộc ô tìm kiếm.
 */
export function DocumentStats({
  documents,
  status,
  onStatusChange,
}: {
  documents: DocumentWithSteps[];
  /** null = Tất cả. */
  status: DocumentStatusKey | null;
  onStatusChange: (status: DocumentStatusKey | null) => void;
}) {
  const counts = useMemo(() => {
    const byStatus: Record<DocumentStatusKey, number> = {
      pending: 0,
      in_progress: 0,
      returned: 0,
      returning: 0,
      done: 0,
    };
    documents.forEach((doc) => {
      byStatus[documentStatus(doc).status] += 1;
    });
    return byStatus;
  }, [documents]);

  const cards: {
    key: DocumentStatusKey | null;
    label: string;
    badge: string | null;
    count: number;
  }[] = [
    { key: null, label: "Tất cả", badge: null, count: documents.length },
    ...DOCUMENT_STATUS_ORDER.map((key) => ({
      key,
      label: DOCUMENT_STATUS_LABEL[key],
      badge: DOCUMENT_STATUS_BADGE[key],
      count: counts[key],
    })),
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6 [&>*]:min-w-0">
      {cards.map((card) => {
        const active = status === card.key;
        return (
          <button
            key={card.key ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onStatusChange(card.key)}
            className="text-left"
          >
            <Card
              className={cn(
                "h-full transition-all hover:-translate-y-0.5 hover:shadow-md",
                active && "border-primary ring-1 ring-primary",
              )}
            >
              <CardContent className="space-y-1.5 p-4">
                <span
                  className={cn(
                    "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium",
                    card.badge ?? "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {card.label}
                </span>
                <p className="text-2xl font-semibold tracking-tight">
                  {card.count}
                </p>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
