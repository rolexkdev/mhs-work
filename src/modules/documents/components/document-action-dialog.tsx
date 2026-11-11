"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useDocumentAction,
  type DocumentActionKey,
} from "@/modules/documents/hooks";

export const DOCUMENT_ACTION_LABEL: Record<DocumentActionKey, string> = {
  send: "Gửi đi",
  forward: "Đã xử lý, chuyển tiếp",
  return: "Trả lại",
  resend: "Gửi lại",
  finish_early: "Kết thúc sớm",
  receive_back: "Nhận lại",
  hand_over: "Bàn giao người gửi",
  sender_confirm: "Đã nhận hồ sơ",
};

const ACTION_DESCRIPTION: Record<DocumentActionKey, string> = {
  send: "Hồ sơ sẽ được gửi tới phòng ban đầu tiên trong lộ trình.",
  forward:
    "Bước hiện tại được đánh dấu đã xử lý và hồ sơ chuyển sang bước kế tiếp.",
  return: "Hồ sơ quay về KCN và chuyển sang trạng thái Cần bổ sung.",
  resend: "Gửi lại hồ sơ cho phòng ban đang giữ sau khi đã bổ sung.",
  finish_early:
    "Dừng lộ trình ngay; các bước chưa tới sẽ bị bỏ và hồ sơ chuyển sang trả về người gửi.",
  receive_back: "Xác nhận hồ sơ đã được nhận lại về KCN.",
  hand_over: "Bàn giao hồ sơ cho người gửi; người gửi sẽ xác nhận đã nhận.",
  sender_confirm: "Xác nhận người gửi đã nhận lại hồ sơ. Hồ sơ sẽ Hoàn thành.",
};

const NOTE_PLACEHOLDER: Record<DocumentActionKey, string> = {
  send: "Ghi chú khi gửi (không bắt buộc)",
  forward: "Ghi chú khi chuyển tiếp (không bắt buộc)",
  return: "Lý do trả lại...",
  resend: "Ghi chú khi gửi lại (không bắt buộc)",
  finish_early: "Ghi chú khi kết thúc (không bắt buộc)",
  receive_back: "Ghi chú khi nhận lại (không bắt buộc)",
  hand_over: "Ghi chú khi bàn giao (không bắt buộc)",
  sender_confirm: "Ghi chú khi nhận (không bắt buộc)",
};

/**
 * Hộp thoại xác nhận một thao tác tiến trình hồ sơ.
 * Người xử lý chỉ có ở các RPC nhận p_handler_name (chuyển tiếp, kết thúc sớm).
 */
export function DocumentActionDialog({
  open,
  onOpenChange,
  documentId,
  stepId,
  action,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  /** Bước hiện tại; send và các thao tác trả về không cần. */
  stepId: string | null;
  action: DocumentActionKey;
}) {
  const mutation = useDocumentAction();

  const [handlerName, setHandlerName] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setHandlerName("");
    setNote("");
  }, [open, action]);

  const needsHandler = action === "forward" || action === "finish_early";
  const reasonRequired = action === "return";
  const trimmedNote = note.trim();
  const isHandback =
    action === "receive_back" ||
    action === "hand_over" ||
    action === "sender_confirm";
  const needsStep = action !== "send" && !isHandback;
  const canSubmit =
    !mutation.isPending &&
    (!needsStep || !!stepId) &&
    (!reasonRequired || trimmedNote.length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      switch (action) {
        case "send":
          await mutation.mutateAsync({
            action: "send",
            documentId,
            note: trimmedNote || null,
          });
          break;
        case "forward":
          if (!stepId) return;
          await mutation.mutateAsync({
            action: "forward",
            documentId,
            stepId,
            handlerName: handlerName.trim() || null,
            note: trimmedNote || null,
          });
          break;
        case "return":
          if (!stepId || !trimmedNote) return;
          await mutation.mutateAsync({
            action: "return",
            documentId,
            stepId,
            reason: trimmedNote,
          });
          break;
        case "resend":
          if (!stepId) return;
          await mutation.mutateAsync({
            action: "resend",
            documentId,
            stepId,
            note: trimmedNote || null,
          });
          break;
        case "finish_early":
          if (!stepId) return;
          await mutation.mutateAsync({
            action: "finish_early",
            documentId,
            stepId,
            handlerName: handlerName.trim() || null,
            note: trimmedNote || null,
          });
          break;
        case "receive_back":
        case "hand_over":
        case "sender_confirm":
          await mutation.mutateAsync({
            action,
            documentId,
            note: trimmedNote || null,
          });
          break;
      }
    } catch {
      // Toast do hook hiển thị; giữ hộp thoại mở để người dùng thử lại.
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{DOCUMENT_ACTION_LABEL[action]}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {ACTION_DESCRIPTION[action]}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsHandler && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Người xử lý
              </Label>
              <Input
                value={handlerName}
                onChange={(e) => setHandlerName(e.target.value)}
                placeholder="Tên người xử lý (không bắt buộc)"
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {reasonRequired ? "Lý do trả lại *" : "Ghi chú"}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={NOTE_PLACEHOLDER[action]}
              className="min-h-[96px] resize-none"
              autoFocus={!needsHandler}
              required={reasonRequired}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? "Đang lưu..." : DOCUMENT_ACTION_LABEL[action]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
