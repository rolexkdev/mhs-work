"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import {
  DOCUMENT_PRIORITY_META,
  DOCUMENT_PRIORITY_ORDER,
  DOCUMENT_CATEGORY_SUGGESTIONS,
} from "@/modules/documents/constants";
import {
  useCreateDocument,
  useUpdateDocument,
} from "@/modules/documents/hooks";
import { useCreateHandoff } from "@/modules/documents/handoff-hooks";
import { RecipientPickerList } from "@/modules/documents/handoff-dialog";
import { uploadDocumentFile } from "@/modules/documents/attachment-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMe } from "@/modules/meetings/item-hooks";
import type { DocumentRecord, TaskPriority } from "@/types/database";

const NO_OFFICE = "__none__";

/** Local calendar date (YYYY-MM-DD) of a timestamp. */
function toLocalDateInput(iso: string | null | undefined): string {
  return new Date(iso ?? Date.now()).toLocaleDateString("sv-SE");
}

export function DocumentFormDialog({
  open,
  onOpenChange,
  document,
  defaultOfficeId,
  navigateOnCreate = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  document?: DocumentRecord | null;
  defaultOfficeId?: string | null;
  navigateOnCreate?: boolean;
}) {
  const isEdit = !!document;
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const createHandoff = useCreateHandoff({ silentToast: true });

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [originOfficeId, setOriginOfficeId] = useState<string>(NO_OFFICE);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [quantity, setQuantity] = useState("1");
  const [receivedDate, setReceivedDate] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [receiverSearch, setReceiverSearch] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(document?.title ?? "");
    setCategory(document?.category ?? "");
    setOriginOfficeId(
      document?.origin_office_id ?? defaultOfficeId ?? NO_OFFICE,
    );
    setPriority(document?.priority ?? "medium");
    setQuantity(String(document?.quantity ?? 1));
    setReceivedDate(toLocalDateInput(document?.received_at));
    setReceiverId("");
    setReceiverSearch("");
    setDescription(document?.description ?? "");
    setFiles([]);
  }, [open, document, defaultOfficeId]);

  const selectedReceiver = useMemo(
    () => (receiverId ? profiles.find((p) => p.id === receiverId) ?? null : null),
    [profiles, receiverId],
  );

  const pending =
    createDocument.isPending ||
    updateDocument.isPending ||
    uploadingFiles ||
    createHandoff.isPending;

  const trimmedTitle = title.trim();
  const hasReceiver = isEdit || Boolean(receiverId);
  const canSubmit = Boolean(trimmedTitle) && hasReceiver;
  const missingHint = !trimmedTitle && !hasReceiver
    ? "Vui lòng nhập tiêu đề và chọn người nhận hồ sơ."
    : !trimmedTitle
      ? "Vui lòng nhập tiêu đề hồ sơ."
      : !hasReceiver
        ? "Vui lòng chọn người nhận hồ sơ."
        : null;

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
    if (!canSubmit) return;
    const qty = Math.max(1, Math.floor(Number(quantity)) || 1);
    const receivedAt = receivedDate
      ? new Date(`${receivedDate}T00:00:00`).toISOString()
      : undefined;

    if (isEdit && document) {
      try {
        await updateDocument.mutateAsync({
          id: document.id,
          title: trimmedTitle,
          category: category.trim() || null,
          priority,
          description: description.trim() || null,
          quantity: qty,
          received_at: receivedAt,
        });
      } catch {
        return;
      }
      onOpenChange(false);
      return;
    }

    let created: DocumentRecord;
    try {
      created = await createDocument.mutateAsync({
        title: trimmedTitle,
        category: category.trim() || null,
        origin_office_id: originOfficeId === NO_OFFICE ? null : originOfficeId,
        priority,
        description: description.trim() || null,
        quantity: qty,
        received_at: receivedAt ?? null,
      });
    } catch {
      return;
    }

    if (files.length > 0) {
      setUploadingFiles(true);
      try {
        for (const file of files) {
          await uploadDocumentFile({
            documentId: created.id,
            file,
          });
        }
        qc.invalidateQueries({
          queryKey: queryKeys.documentAttachments(created.id),
        });
      } catch (err) {
        toast.error(friendlyError(err, "Tải tệp đính kèm thất bại."));
      } finally {
        setUploadingFiles(false);
      }
    }

    let handoffFailed = false;
    try {
      await createHandoff.mutateAsync({
        documentId: created.id,
        toUsers: [receiverId],
        kind: "assign",
      });
    } catch (err) {
      handoffFailed = true;
      toast.error(
        `Đã tạo hồ sơ nhưng bàn giao thất bại: ${friendlyError(
          err,
          "Vui lòng thử lại bằng nút Bàn giao.",
        )}`,
      );
    } finally {
      qc.invalidateQueries({
        queryKey: queryKeys.documentHandoffs(created.id),
      });
      qc.invalidateQueries({
        queryKey: queryKeys.documentHolders(created.id),
      });
      qc.invalidateQueries({ queryKey: queryKeys.documentHoldersAll });
      qc.invalidateQueries({ queryKey: queryKeys.document(created.id) });
      qc.invalidateQueries({
        queryKey: queryKeys.documentLogs(created.id),
      });
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
      qc.invalidateQueries({ queryKey: queryKeys.myPendingHandoffs });
      qc.invalidateQueries({
        queryKey: queryKeys.documentsWithPendingHandoffs,
      });
    }

    onOpenChange(false);
    if (navigateOnCreate || handoffFailed) {
      router.push(`/documents/${created.id}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">
            {isEdit ? "Chỉnh sửa hồ sơ" : "Tiếp nhận hồ sơ mới"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Cập nhật thông tin hồ sơ – công văn."
              : "Nhập thông tin hồ sơ, chọn người nhận để bàn giao và đính kèm bản scan nếu có."}
          </p>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Tiêu đề hồ sơ *</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Công văn về việc phê duyệt báo cáo ĐTM..."
                autoFocus
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-received">Ngày tiếp nhận hồ sơ</Label>
                <Input
                  id="doc-received"
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-quantity">Số lượng</Label>
                <Input
                  id="doc-quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>

            {!isEdit && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Người nhận *</Label>
                  {selectedReceiver ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        Đã chọn:{" "}
                        <span className="font-medium text-foreground">
                          {selectedReceiver.full_name ?? selectedReceiver.email}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setReceiverId("")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-600">
                      Bắt buộc chọn 1 người nhận
                    </span>
                  )}
                </div>

                <RecipientPickerList
                  profiles={profiles}
                  offices={offices}
                  currentUserId={me?.id ?? null}
                  selectedIds={receiverId ? [receiverId] : []}
                  onSelect={(userId) =>
                    setReceiverId((prev) => (prev === userId ? "" : userId))
                  }
                  search={receiverSearch}
                  onSearchChange={setReceiverSearch}
                  maxHeightClassName="max-h-48"
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-category">Loại hồ sơ / Hạng mục</Label>
                <Input
                  id="doc-category"
                  list="doc-category-suggestions"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="VD: Công văn đến, Tờ trình..."
                />
                <datalist id="doc-category-suggestions">
                  {DOCUMENT_CATEGORY_SUGGESTIONS.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              {!isEdit && (
                <div className="space-y-1.5">
                  <Label>Văn phòng khởi tạo</Label>
                  <Select
                    value={originOfficeId}
                    onValueChange={setOriginOfficeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn văn phòng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_OFFICE}>
                        Theo văn phòng của tôi
                      </SelectItem>
                      {offices.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.code} — {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div
                className={
                  !isEdit ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"
                }
              >
                <Label>Độ ưu tiên</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as TaskPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_PRIORITY_ORDER.map((p) => (
                      <SelectItem key={p} value={p}>
                        {DOCUMENT_PRIORITY_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-desc">Mô tả / Nội dung tóm tắt</Label>
              <Textarea
                id="doc-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ghi chú số hiệu gốc, đơn vị gửi, nội dung chính..."
                className="min-h-[84px] resize-none"
              />
            </div>

            {!isEdit && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Bản scan / Tệp đính kèm</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5" /> Chọn tệp
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleSelectFiles}
                  />
                </div>

                {files.length > 0 ? (
                  <ul className="space-y-1 rounded-md border bg-muted/20 p-2">
                    {files.map((f, idx) => (
                      <li
                        key={`${f.name}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
                      >
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Bỏ tệp"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Có thể chọn một hoặc nhiều file ảnh/PDF bản scan để tải lên
                    ngay sau khi tạo.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col items-stretch gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-amber-600">{missingHint}</div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={pending || !canSubmit}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending
                  ? "Đang lưu..."
                  : isEdit
                    ? "Lưu thay đổi"
                    : "Tạo hồ sơ"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
