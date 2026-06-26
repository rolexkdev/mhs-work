"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  CalendarClock,
  User,
  Building2,
  Tag,
  CalendarDays,
  ListChecks,
  Paperclip,
  Trash2,
  Plus,
  Loader2,
  Download,
  Send,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, initials } from "@/lib/format";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
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
import { useTask, useUpdateTask } from "@/modules/tasks/hooks";
import {
  useChecklists,
  useAddChecklist,
  useToggleChecklist,
  useDeleteChecklist,
} from "@/modules/tasks/checklist-hooks";
import {
  useComments,
  useAddComment,
} from "@/modules/tasks/comment-hooks";
import {
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
  getAttachmentUrl,
} from "@/modules/tasks/attachment-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import type { Meeting, Task } from "@/types/database";

const UNASSIGNED = "__none__";
const NO_MEETING = "__none__";

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex w-32 shrink-0 items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function TaskDetailPanel({
  taskId,
  open,
  onOpenChange,
  meetings,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meetings: Meeting[];
}) {
  const { data: task } = useTask(taskId);
  const { data: profiles = [] } = useProfiles();
  const update = useUpdateTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [latestUpdate, setLatestUpdate] = useState("");
  const [note, setNote] = useState("");
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (task && task.id !== loadedId.current) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setLatestUpdate(task.latest_update ?? "");
      setNote(task.note ?? "");
      loadedId.current = task.id;
    }
  }, [task]);

  const saveTitle = useDebouncedCallback((value: string) => {
    if (task && value.trim() && value !== task.title)
      update.mutate({ id: task.id, title: value.trim() });
  });
  const saveDesc = useDebouncedCallback((value: string) => {
    if (task && value !== (task.description ?? ""))
      update.mutate({ id: task.id, description: value || null });
  });
  const saveUpdate = useDebouncedCallback((value: string) => {
    if (task && value !== (task.latest_update ?? ""))
      update.mutate({ id: task.id, latest_update: value || null });
  });
  const saveNote = useDebouncedCallback((value: string) => {
    if (task && value !== (task.note ?? ""))
      update.mutate({ id: task.id, note: value || null });
  });

  function patch(p: Partial<Task>) {
    if (task) update.mutate({ id: task.id, ...p });
  }

  const nameOf = (id: string | null) =>
    id ? profiles.find((p) => p.id === id)?.full_name ?? null : null;

  const isDone = task?.status === "done";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto p-0">
        {!task ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <Button
                variant={isDone ? "secondary" : "outline"}
                size="sm"
                onClick={() =>
                  patch({ status: isDone ? "todo" : "done" })
                }
              >
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
                {isDone ? "Đã hoàn thành" : "Đánh dấu hoàn thành"}
              </Button>
              {update.isPending && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Đang lưu
                </span>
              )}
            </div>

            <div className="flex-1 space-y-1 px-5 py-4">
              {/* Title */}
              <textarea
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  saveTitle(e.target.value);
                }}
                rows={1}
                className="w-full resize-none border-0 bg-transparent text-lg font-semibold leading-snug outline-none placeholder:text-muted-foreground"
                placeholder="Tiêu đề công việc"
              />

              <div className="divide-y">
                <Row icon={CalendarClock} label="Hạn chót">
                  <Input
                    type="date"
                    value={task.due_date ? task.due_date.slice(0, 10) : ""}
                    onChange={(e) =>
                      patch({
                        due_date: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                    className="h-8 w-44"
                  />
                </Row>

                <Row icon={User} label="Người thực hiện">
                  <Select
                    value={task.assignee_id ?? UNASSIGNED}
                    onValueChange={(v) =>
                      patch({ assignee_id: v === UNASSIGNED ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8">
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
                </Row>

                <Row icon={Building2} label="Phòng/Nhóm">
                  <Select
                    value={task.department ?? "__none__"}
                    onValueChange={(v) =>
                      patch({ department: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Chưa phân phòng</SelectItem>
                      {DEPARTMENTS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>

                <Row icon={Tag} label="Hạng mục">
                  <Select
                    value={task.category ?? "__none__"}
                    onValueChange={(v) =>
                      patch({ category: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>

                <Row icon={ListChecks} label="Trạng thái">
                  <Select
                    value={task.status}
                    onValueChange={(v) =>
                      patch({ status: v as Task["status"] })
                    }
                  >
                    <SelectTrigger className="h-8">
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
                </Row>

                <Row icon={CalendarDays} label="Cuộc họp">
                  <Select
                    value={task.meeting_id ?? NO_MEETING}
                    onValueChange={(v) =>
                      patch({ meeting_id: v === NO_MEETING ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8">
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
                </Row>
              </div>

              {/* Cập nhật mới nhất */}
              <div className="space-y-1 pt-3">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5" /> Cập nhật mới nhất
                </label>
                <textarea
                  value={latestUpdate}
                  onChange={(e) => {
                    setLatestUpdate(e.target.value);
                    saveUpdate(e.target.value);
                  }}
                  rows={2}
                  placeholder="Tình hình mới nhất của công việc..."
                  className="w-full resize-none rounded-md border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Lý do / Ghi chú */}
              <div className="space-y-1 pt-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Lý do / Ghi chú
                </label>
                <textarea
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    saveNote(e.target.value);
                  }}
                  rows={2}
                  placeholder="Ghi chú thêm..."
                  className="w-full resize-none rounded-md border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Mô tả */}
              <div className="space-y-1 pt-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Mô tả
                </label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    saveDesc(e.target.value);
                  }}
                  rows={3}
                  placeholder="Thêm mô tả..."
                  className="w-full resize-none rounded-md border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <ChecklistSection taskId={task.id} progress={task.progress} />
              <AttachmentSection taskId={task.id} />
              <CommentSection taskId={task.id} nameOf={nameOf} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ChecklistSection({
  taskId,
  progress,
}: {
  taskId: string;
  progress: number;
}) {
  const { data: items = [] } = useChecklists(taskId);
  const add = useAddChecklist(taskId);
  const toggle = useToggleChecklist(taskId);
  const del = useDeleteChecklist(taskId);
  const [text, setText] = useState("");

  const doneCount = items.filter((i) => i.is_done).length;

  return (
    <div className="space-y-2 pt-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="h-4 w-4" /> Việc con
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {doneCount}/{items.length}
            </span>
          )}
        </h3>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">{progress}%</span>
        )}
      </div>
      {items.length > 0 && <Progress value={progress} className="h-1.5" />}

      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50"
          >
            <button
              onClick={() =>
                toggle.mutate({ id: item.id, is_done: !item.is_done })
              }
            >
              {item.is_done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <span
              className={cn(
                "flex-1 text-sm",
                item.is_done && "text-muted-foreground line-through",
              )}
            >
              {item.content}
            </span>
            <button
              onClick={() => del.mutate(item.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            add.mutate(text.trim());
            setText("");
          }
        }}
        className="flex items-center gap-2"
      >
        <Plus className="h-4 w-4 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Thêm việc con..."
          className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </form>
    </div>
  );
}

function AttachmentSection({ taskId }: { taskId: string }) {
  const { data: items = [] } = useAttachments(taskId);
  const upload = useUploadAttachment(taskId);
  const del = useDeleteAttachment(taskId);
  const inputRef = useRef<HTMLInputElement>(null);

  async function openFile(path: string) {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="space-y-2 pt-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4" /> Tệp đính kèm
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Tải lên
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="space-y-1">
        {items.map((a) => (
          <div
            key={a.id}
            className="group flex items-center gap-2 rounded-md border px-2 py-1.5"
          >
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => openFile(a.file_url)}
              className="flex-1 truncate text-left text-sm hover:underline"
            >
              {a.file_name}
            </button>
            <button onClick={() => openFile(a.file_url)}>
              <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={() => del.mutate(a)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">Chưa có tệp nào.</p>
        )}
      </div>
    </div>
  );
}

function CommentSection({
  taskId,
  nameOf,
}: {
  taskId: string;
  nameOf: (id: string | null) => string | null;
}) {
  const { data: comments = [] } = useComments(taskId);
  const add = useAddComment(taskId);
  const [text, setText] = useState("");

  return (
    <div className="space-y-3 pt-5">
      <h3 className="text-sm font-medium">Bình luận</h3>

      <div className="space-y-3">
        {comments.map((c) => {
          const name = nameOf(c.user_id) ?? "Người dùng";
          return (
            <div key={c.id} className="flex gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px]">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-medium">{name}</span>{" "}
                  <span className="text-muted-foreground">
                    · {formatDateTime(c.created_at)}
                  </span>
                </p>
                <p className="whitespace-pre-wrap text-sm">{c.content}</p>
              </div>
            </div>
          );
        })}
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Chưa có bình luận. Hãy trao đổi tại đây.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            add.mutate(text.trim());
            setText("");
          }
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Thêm bình luận..."
        />
        <Button type="submit" size="icon" disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
