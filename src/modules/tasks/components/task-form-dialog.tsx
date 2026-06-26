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
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  DEPARTMENTS,
  CATEGORIES,
} from "@/modules/tasks/constants";
import { useCreateTask, useUpdateTask } from "@/modules/tasks/hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import type { Task, Meeting } from "@/types/database";

const UNASSIGNED = "__none__";
const NO_MEETING = "__none__";
const NO_DEPT = "__none__";
const NO_CAT = "__none__";

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}
function toIso(dateInput: string): string | null {
  return dateInput ? new Date(dateInput).toISOString() : null;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  meetings,
  defaultMeetingId,
  lockMeeting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  meetings: Meeting[];
  defaultMeetingId?: string | null;
  /** Khoá chọn cuộc họp (khi tạo task từ trong trang chi tiết họp) */
  lockMeeting?: boolean;
}) {
  const isEdit = !!task;
  const { data: profiles = [] } = useProfiles();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const [meetingId, setMeetingId] = useState<string>(NO_MEETING);
  const [department, setDepartment] = useState<string>(NO_DEPT);
  const [category, setCategory] = useState<string>(NO_CAT);
  const [status, setStatus] = useState<Task["status"]>("todo");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Reset form mỗi khi mở
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssignee(task?.assignee_id ?? UNASSIGNED);
    setMeetingId(task?.meeting_id ?? defaultMeetingId ?? NO_MEETING);
    setDepartment(task?.department ?? NO_DEPT);
    setCategory(task?.category ?? NO_CAT);
    setStatus(task?.status ?? "todo");
    setStartDate(toDateInput(task?.start_date ?? null));
    setDueDate(toDateInput(task?.due_date ?? null));
  }, [open, task, defaultMeetingId]);

  const pending = createTask.isPending || updateTask.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const common = {
      title: title.trim(),
      description: description.trim() || null,
      assignee_id: assignee === UNASSIGNED ? null : assignee,
      meeting_id: meetingId === NO_MEETING ? null : meetingId,
      department: department === NO_DEPT ? null : department,
      category: category === NO_CAT ? null : category,
      status,
      start_date: toIso(startDate),
      due_date: toIso(dueDate),
    };

    if (isEdit && task) {
      await updateTask.mutateAsync({ id: task.id, ...common });
    } else {
      await createTask.mutateAsync(common);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa công việc" : "Tạo công việc"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Tiêu đề *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Hoàn thiện API đăng nhập"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Mô tả</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Chi tiết công việc, yêu cầu..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Người thực hiện</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Chưa giao</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Cuộc họp</Label>
              <Select
                value={meetingId}
                onValueChange={setMeetingId}
                disabled={lockMeeting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MEETING}>Không gắn họp</SelectItem>
                  {meetings.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Phòng/Nhóm</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEPT}>Chưa phân phòng</SelectItem>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Hạng mục</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CAT}>—</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Trạng thái</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as Task["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TASK_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="start">Ngày bắt đầu</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due">Hạn chót</Label>
              <Input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
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
              {pending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Tạo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
