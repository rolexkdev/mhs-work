"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCurrentUserId } from "@/modules/auth/use-current-user";
import { useProfiles } from "@/modules/auth/use-profiles";
import {
  useCanManageDocuments,
  useCreateDocument,
  useUpdateDocument,
} from "@/modules/documents/hooks";
import {
  DEPARTMENTS,
  TAG_COLOR_CLASS,
  colorOf,
} from "@/modules/tasks/constants";
import type { DocumentWithSteps } from "@/types/database";

const NO_SENDER = "__none__";

/**
 * Hộp thoại thêm / sửa thông tin hồ sơ.
 *
 * Tạo mới: tên, người gửi, ghi chú và — chỉ với quản lý hồ sơ — lộ trình ban
 * đầu (thêm phòng ban, đổi thứ tự, xoá bước).
 * Chỉnh sửa: chỉ tên, người gửi, ghi chú; lộ trình sửa ở bước sau.
 */
export function DocumentFormDialog({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Có giá trị là chế độ chỉnh sửa. */
  document?: DocumentWithSteps | null;
}) {
  const isEdit = !!document;
  const { data: profiles = [] } = useProfiles();
  const currentUserId = useCurrentUserId();
  const canManage = useCanManageDocuments();
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();

  const [name, setName] = useState("");
  const [senderId, setSenderId] = useState("");
  const [note, setNote] = useState("");
  const [departmentToAdd, setDepartmentToAdd] = useState("");
  const [route, setRoute] = useState<string[]>([]);

  // Reset form mỗi khi mở.
  useEffect(() => {
    if (!open) return;
    setName(document?.name ?? "");
    setSenderId(document?.sender_id ?? "");
    setNote(document?.note ?? "");
    setDepartmentToAdd("");
    setRoute([]);
  }, [open, document]);

  // Tạo mới: người gửi mặc định là người đang đăng nhập (chờ auth trả về id).
  useEffect(() => {
    if (!open || isEdit) return;
    setSenderId((prev) => prev || currentUserId || "");
  }, [open, isEdit, currentUserId]);

  const pending = createDocument.isPending || updateDocument.isPending;

  function handleAddDepartment(value: string) {
    setRoute((prev) => [...prev, value]);
    setDepartmentToAdd("");
  }

  function handleRemoveStep(index: number) {
    setRoute((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMoveStep(index: number, direction: -1 | 1) {
    setRoute((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const info = {
      name: trimmedName,
      sender_id: senderId && senderId !== NO_SENDER ? senderId : null,
      note: note.trim() || null,
    };

    try {
      if (isEdit && document) {
        await updateDocument.mutateAsync({ id: document.id, ...info });
      } else {
        await createDocument.mutateAsync({
          ...info,
          departments: canManage && route.length > 0 ? route : undefined,
        });
      }
    } catch {
      // Toast do hook hiển thị; giữ hộp thoại mở để người dùng sửa lại.
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">
            {isEdit ? "Chỉnh sửa hồ sơ" : "Thêm hồ sơ"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Cập nhật tên, người gửi và ghi chú của hồ sơ."
              : "Nhập thông tin hồ sơ giấy cần theo dõi."}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="doc-name">Tên hồ sơ *</FieldLabel>
                <Input
                  id="doc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Hồ sơ xin cấp phép xây dựng nhà xưởng"
                  className="h-11 text-base font-medium"
                  autoFocus
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Người gửi</FieldLabel>
                  <Select
                    value={senderId || NO_SENDER}
                    onValueChange={setSenderId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn người gửi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SENDER}>—</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name ?? p.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="doc-note">Ghi chú</FieldLabel>
                <Textarea
                  id="doc-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Thông tin thêm về hồ sơ (không bắt buộc)"
                  className="min-h-[88px] resize-none"
                />
              </div>
            </div>

            {!isEdit && canManage && (
              <Section title="Lộ trình xử lý">
                <div className="space-y-3">
                  <Select
                    value={departmentToAdd}
                    onValueChange={handleAddDepartment}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Thêm phòng ban vào lộ trình" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {route.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Chưa có bước nào. Hồ sơ sẽ ở trạng thái Chờ gửi.
                    </p>
                  ) : (
                    <ol className="space-y-2">
                      {route.map((department, index) => (
                        <li
                          key={`${department}-${index}`}
                          className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                            {index + 1}
                          </span>
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate rounded-full border px-2 py-0.5 text-xs font-medium",
                              TAG_COLOR_CLASS[
                                colorOf(DEPARTMENTS, department)
                              ],
                            )}
                          >
                            {department}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Chuyển lên"
                            disabled={index === 0}
                            onClick={() => handleMoveStep(index, -1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Chuyển xuống"
                            disabled={index === route.length - 1}
                            onClick={() => handleMoveStep(index, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            aria-label="Xoá bước"
                            onClick={() => handleRemoveStep(index)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </Section>
            )}
          </div>

          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending
                ? "Đang lưu..."
                : isEdit
                  ? "Lưu thay đổi"
                  : "Thêm hồ sơ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Label nhỏ, đồng nhất với form công việc. */
function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </Label>
  );
}

/** Nhóm trường có tiêu đề + đường kẻ phân cách. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
          {title}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
    </div>
  );
}
