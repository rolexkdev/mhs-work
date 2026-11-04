"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMarkDocumentLost } from "@/modules/documents/shipment-hooks";

export function MarkLostDialog({
  open,
  onOpenChange,
  documentId,
  documentCode,
  documentTitle,
  shipmentId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string | null;
  documentCode?: string | null;
  documentTitle?: string | null;
  shipmentId?: string | null;
}) {
  const markLost = useMarkDocumentLost();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
  }, [open, documentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!documentId || !reason.trim()) return;

    try {
      await markLost.mutateAsync({
        documentId,
        reason: reason.trim(),
        shipmentId: shipmentId ?? null,
      });
    } catch {
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Báo thất lạc hồ sơ
          </DialogTitle>
          {(documentCode || documentTitle) && (
            <p className="text-sm text-muted-foreground">
              {documentCode && (
                <span className="font-mono font-semibold text-foreground">
                  {documentCode}
                </span>
              )}
              {documentCode && documentTitle ? " — " : ""}
              {documentTitle}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason">Lý do thất lạc *</Label>
            <Textarea
              id="lost-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mô tả nguyên nhân, thời điểm phát hiện thất lạc..."
              className="min-h-[90px] resize-none"
              autoFocus
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={markLost.isPending}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={markLost.isPending || !reason.trim()}
            >
              {markLost.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {markLost.isPending
                ? "Đang ghi nhận..."
                : "Xác nhận báo thất lạc"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
