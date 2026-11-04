"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, Paperclip, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import { useRespondHandoff } from "@/modules/documents/handoff-hooks";
import { uploadDocumentFile } from "@/modules/documents/attachment-hooks";
import type { DocumentHandoff } from "@/types/database";

export function RespondHandoffDialog({
  open,
  onOpenChange,
  handoff,
  documentTitle,
  defaultAccept = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  handoff: DocumentHandoff | null;
  documentTitle?: string | null;
  defaultAccept?: boolean;
}) {
  const qc = useQueryClient();
  const respondHandoff = useRespondHandoff();

  const [accept, setAccept] = useState(defaultAccept);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setAccept(defaultAccept);
    setNote("");
    setFiles([]);
  }, [open, defaultAccept, handoff]);

  const pending = respondHandoff.isPending || uploading;

  function handleSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) {
      setFiles((prev) => [...prev, ...selected]);
    }
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!handoff) return;

    try {
      await respondHandoff.mutateAsync({
        handoffId: handoff.id,
        accept,
        note: note.trim() || null,
        documentId: handoff.document_id,
      });
    } catch {
      return;
    }

    if (files.length > 0) {
      setUploading(true);
      try {
        for (const file of files) {
          await uploadDocumentFile({
            documentId: handoff.document_id,
            handoffId: handoff.id,
            file,
          });
        }
        qc.invalidateQueries({
          queryKey: queryKeys.documentAttachments(handoff.document_id),
        });
      } catch (err) {
        toast.error(friendlyError(err, "Tải ảnh/tệp minh chứng thất bại."));
      } finally {
        setUploading(false);
      }
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {accept ? "Xác nhận đã nhận hồ sơ" : "Từ chối nhận hồ sơ"}
          </DialogTitle>
          {documentTitle && (
            <p className="truncate text-sm text-muted-foreground">
              {documentTitle}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={accept ? "default" : "outline"}
              className={
                accept
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : undefined
              }
              onClick={() => setAccept(true)}
            >
              <Check className="h-4 w-4" /> Đã nhận
            </Button>
            <Button
              type="button"
              variant={!accept ? "destructive" : "outline"}
              onClick={() => setAccept(false)}
            >
              <X className="h-4 w-4" /> Từ chối
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="respond-note">
              {accept ? "Ghi chú phản hồi" : "Lý do từ chối"}
            </Label>
            <Textarea
              id="respond-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                accept
                  ? "Ghi chú tình trạng hồ sơ, số bản đã nhận (tuỳ chọn)..."
                  : "Nhập lý do từ chối..."
              }
              className="min-h-[76px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ảnh chụp / Tệp minh chứng (tuỳ chọn)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" /> Chọn ảnh / tệp
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                multiple
                className="hidden"
                onChange={handleSelectFiles}
              />
            </div>

            {files.length > 0 && (
              <ul className="space-y-1 rounded-md border bg-muted/20 p-2">
                {files.map((f, idx) => (
                  <li
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              variant={accept ? "default" : "destructive"}
              className={
                accept
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : undefined
              }
              disabled={pending}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending
                ? "Đang xử lý..."
                : accept
                  ? "Xác nhận đã nhận"
                  : "Xác nhận từ chối"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
