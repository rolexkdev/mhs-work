"use client";

import { useEffect, useState } from "react";
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
  useAddMeetingItems,
  useUpdateMeetingItem,
} from "@/modules/meetings/item-hooks";
import { resolveDeadline } from "@/modules/meetings/resolve-deadline";
import type { MeetingItem } from "@/types/database";

// ---------------------------------------------------------------------------
// Thêm / sửa 1 đầu mục
// ---------------------------------------------------------------------------
export function ItemFormDialog({
  open,
  onOpenChange,
  meetingId,
  meetingDate,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meetingId: string;
  meetingDate: string;
  item?: MeetingItem | null;
}) {
  const add = useAddMeetingItems();
  const update = useUpdateMeetingItem();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [department, setDepartment] = useState("");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setContent(item?.content ?? "");
    setDepartment(item?.department ?? "");
    setDeadline(item?.deadline ?? "");
  }, [open, item]);

  const pending = add.isPending || update.isPending;
  const resolved = resolveDeadline(deadline, meetingDate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    const fields = {
      title: title.trim() || null,
      content: content.trim(),
      department: department.trim() || null,
      deadline: deadline.trim() || null,
    };
    if (item)
      await update.mutateAsync({
        id: item.id,
        prevDeadline: item.deadline,
        meetingDate,
        ...fields,
      });
    else
      await add.mutateAsync({
        meetingId,
        meetingDate,
        items: [{ section: null, ...fields }],
      });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Sửa đầu mục" : "Thêm đầu mục"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="if-title">Hạng mục</Label>
            <Input
              id="if-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Ống hóa chất Javel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="if-content">Nội dung chỉ đạo *</Label>
            <Textarea
              id="if-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[90px]"
              required
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="if-dept">Đơn vị phụ trách</Label>
              <Input
                id="if-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="VD: Hạ tầng / Kỹ thuật"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="if-deadline">Thời hạn</Label>
              <Input
                id="if-deadline"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="VD: Tuần tới, 25/10"
              />
              {resolved && resolved.label !== deadline.trim() && (
                <p className="text-xs text-muted-foreground">
                  Tính theo ngày họp: {resolved.label}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : item ? "Lưu" : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
