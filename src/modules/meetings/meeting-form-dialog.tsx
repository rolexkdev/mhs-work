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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { MEETING_STATUS_META } from "@/modules/tasks/constants";
import { useCreateMeeting, useUpdateMeeting } from "@/modules/meetings/hooks";
import type { Meeting, MeetingStatus } from "@/types/database";

const STATUS_ORDER: MeetingStatus[] = ["planned", "ongoing", "closed"];

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function MeetingFormDialog({
  open,
  onOpenChange,
  meeting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meeting?: Meeting | null;
}) {
  const isEdit = !!meeting;
  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<MeetingStatus>("planned");

  useEffect(() => {
    if (!open) return;
    setTitle(meeting?.title ?? "");
    setDescription(meeting?.description ?? "");
    setDate(
      toLocalInput(meeting?.meeting_date ?? new Date().toISOString()),
    );
    setStatus(meeting?.status ?? "planned");
  }, [open, meeting]);

  const pending = createMeeting.isPending || updateMeeting.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const meeting_date = date ? new Date(date).toISOString() : new Date().toISOString();

    if (isEdit && meeting) {
      await updateMeeting.mutateAsync({
        id: meeting.id,
        title: title.trim(),
        description: description.trim() || null,
        meeting_date,
        status,
      });
    } else {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await createMeeting.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        meeting_date,
        created_by: user.id,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa cuộc họp" : "Tạo cuộc họp giao ban"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-title">Tiêu đề *</Label>
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Giao ban tuần 26 — tháng 6/2026"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-desc">Nội dung họp</Label>
            <Textarea
              id="m-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tóm tắt nội dung, quyết định, đầu việc cần giao..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-date">Thời gian họp</Label>
              <Input
                id="m-date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trạng thái</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as MeetingStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {MEETING_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {pending ? "Đang lưu..." : isEdit ? "Lưu" : "Tạo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
