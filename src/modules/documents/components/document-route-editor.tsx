"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DocumentRouteList,
  type RouteRow,
} from "@/modules/documents/components/document-route-list";
import { useSetDocumentRoute } from "@/modules/documents/hooks";
import type { DocumentWithSteps } from "@/types/database";

/** Local key for steps added in the dialog (existing steps use their id). */
let nextRowKey = 0;

/**
 * Hộp thoại sửa lộ trình: bước đã tới bị khoá và giữ nguyên thứ tự ở đầu,
 * chỉ các bước chưa tới được thêm, đổi thứ tự hoặc xoá.
 *
 * Lộ trình được chốt một lần khi mở hộp thoại (useState initializer) để một
 * lần refetch trong lúc mở không ghi đè phần người dùng đang sửa; RPC vẫn
 * kiểm tra lại trạng thái khi lưu.
 */
export function DocumentRouteEditor({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  document: DocumentWithSteps;
}) {
  const setRoute = useSetDocumentRoute();

  const [rows, setRows] = useState<RouteRow[]>(() =>
    [...document.steps]
      .sort((a, b) => a.step_order - b.step_order)
      .map((step) => ({
        key: step.id,
        department: step.department,
        locked: !!step.received_at,
      })),
  );

  function handleAdd(department: string) {
    setRows((prev) => [
      ...prev,
      { key: `new-${++nextRowKey}`, department },
    ]);
  }

  function handleMove(index: number, direction: -1 | 1) {
    setRows((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      // Locked steps never change position.
      if (prev[index].locked || prev[target].locked) return prev;

      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleRemove(index: number) {
    setRows((prev) =>
      prev[index]?.locked ? prev : prev.filter((_, i) => i !== index),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      await setRoute.mutateAsync({
        documentId: document.id,
        departments: rows.map((row) => row.department),
      });
    } catch {
      // Toast do hook hiển thị; giữ hộp thoại mở để thử lại.
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sửa lộ trình</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Chỉ sửa được các bước chưa tới. Bước đã tới được giữ nguyên và khoá.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DocumentRouteList
            rows={rows}
            onAdd={handleAdd}
            onMove={handleMove}
            onRemove={handleRemove}
            emptyText="Chưa có bước nào. Hồ sơ cần ít nhất một bước trước khi gửi."
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={setRoute.isPending}>
              {setRoute.isPending ? "Đang lưu..." : "Lưu lộ trình"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
