"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  CalendarClock,
  User,
  Building2,
  CalendarDays,
  ListChecks,
  Paperclip,
  Trash2,
  Plus,
  Loader2,
  Download,
  Send,
  RefreshCw,
  History,
  Repeat,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  TASK_PRIORITY_META,
  DEPARTMENTS,
  RECURRENCE_LABEL,
  RECURRENCE_ORDER,
} from "@/modules/tasks/constants";
import { ProgressDial } from "@/modules/tasks/components/progress-dial";
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
import { useTaskLogs } from "@/modules/tasks/log-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import type {
  Meeting,
  Task,
  TaskAttachment,
  TaskLog,
  TaskStatus,
  TaskPriority,
} from "@/types/database";

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
  function copyLink() {
    if (!task) return;
    const url = `${window.location.origin}/tasks?task=${task.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Đã chép liên kết công việc"))
      .catch(() => toast.error("Không chép được liên kết"));
  }

  const nameOf = (id: string | null) =>
    id ? profiles.find((p) => p.id === id)?.full_name ?? null : null;
  const avatarOf = (id: string | null) =>
    id ? profiles.find((p) => p.id === id)?.avatar_url ?? null : null;

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
                  patch({ status: isDone ? "in_progress" : "done" })
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
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground"
                onClick={copyLink}
                title="Chép liên kết công việc để gửi cho người khác"
              >
                <Link2 className="h-4 w-4" /> Chép liên kết
              </Button>
            </div>

            <Tabs
              defaultValue="detail"
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="border-b px-5">
                <TabsList className="h-10 justify-start gap-1 rounded-none bg-transparent p-0">
                  <TabsTrigger
                    value="detail"
                    className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-2 pt-1 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    Chi tiết
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-2 pt-1 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    <History className="h-3.5 w-3.5" /> Lịch sử
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="detail"
                className="mt-0 flex-1 space-y-1 overflow-y-auto px-5 py-4"
              >
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

              {/* Tiến độ báo cáo (thủ công) */}
              <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-4">
                <ProgressDial
                  value={task.manual_progress}
                  onChange={(v) => patch({ manual_progress: v })}
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">Tiến độ báo cáo</p>
                  <p className="text-xs text-muted-foreground">
                    Chủ task kéo vòng tròn để cập nhật % hoàn thành.
                  </p>
                </div>
              </div>

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

                <Row icon={Repeat} label="Lặp lại">
                  <Select
                    value={task.recurrence}
                    onValueChange={(v) =>
                      patch({ recurrence: v as Task["recurrence"] })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_ORDER.map((r) => (
                        <SelectItem key={r} value={r}>
                          {RECURRENCE_LABEL[r]}
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
              <CommentSection
                taskId={task.id}
                nameOf={nameOf}
                avatarOf={avatarOf}
              />
              </TabsContent>

              <TabsContent
                value="history"
                className="mt-0 flex-1 overflow-y-auto px-5 py-4"
              >
                <HistorySection
                  taskId={task.id}
                  nameOf={nameOf}
                  avatarOf={avatarOf}
                />
              </TabsContent>
            </Tabs>
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

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const isImage = (name: string) => IMAGE_RE.test(name);

/** Ảnh đính kèm hiển thị trực tiếp (lazy tải signed URL), tỉ lệ vừa khung. */
function AttachmentImage({
  att,
  onOpen,
  onDelete,
}: {
  att: TaskAttachment;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAttachmentUrl(att.file_url).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [att.file_url]);

  return (
    <div className="group relative overflow-hidden rounded-md border bg-muted/40">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={att.file_name}
          onClick={onOpen}
          className="max-h-72 w-full cursor-zoom-in object-contain"
        />
      ) : (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center gap-2 border-t bg-background/80 px-2 py-1.5">
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-xs">{att.file_name}</span>
        <button onClick={onOpen} title="Mở ảnh">
          <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
        <button
          onClick={onDelete}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
        </button>
      </div>
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

  const images = items.filter((a) => isImage(a.file_name));
  const files = items.filter((a) => !isImage(a.file_name));

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

      {/* Ảnh — hiển thị trực tiếp */}
      {images.length > 0 && (
        <div className="space-y-2">
          {images.map((a) => (
            <AttachmentImage
              key={a.id}
              att={a}
              onOpen={() => openFile(a.file_url)}
              onDelete={() => del.mutate(a)}
            />
          ))}
        </div>
      )}

      {/* Tệp khác — dạng dòng */}
      <div className="space-y-1">
        {files.map((a) => (
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

function statusLabel(v: unknown) {
  return typeof v === "string"
    ? TASK_STATUS_META[v as TaskStatus]?.label ?? v
    : "—";
}
function priorityLabel(v: unknown) {
  return typeof v === "string"
    ? TASK_PRIORITY_META[v as TaskPriority]?.label ?? v
    : "—";
}
const B = ({ children }: { children: React.ReactNode }) => (
  <span className="font-medium text-foreground">{children}</span>
);

/** Mô tả 1 dòng log thành câu tiếng Việt dễ đọc. */
function describeLog(
  log: TaskLog,
  nameOf: (id: string | null) => string | null,
): React.ReactNode {
  const oldV = log.old_value;
  const newV = log.new_value;
  const txt = (v: unknown) =>
    v === null || v === undefined || v === "" ? "trống" : String(v);
  const date = (v: unknown) =>
    typeof v === "string" && v ? formatDate(v) : "trống";
  const person = (v: unknown) =>
    typeof v === "string" && v ? nameOf(v) ?? "—" : "trống";

  switch (log.action) {
    case "created":
      return <>đã tạo công việc</>;
    case "status":
      return (
        <>
          đổi trạng thái <B>{statusLabel(oldV)}</B> → <B>{statusLabel(newV)}</B>
        </>
      );
    case "assignee":
      return (
        <>
          đổi người thực hiện <B>{person(oldV)}</B> → <B>{person(newV)}</B>
        </>
      );
    case "priority":
      return (
        <>
          đổi ưu tiên <B>{priorityLabel(oldV)}</B> → <B>{priorityLabel(newV)}</B>
        </>
      );
    case "due_date":
      return (
        <>
          đổi hạn chót <B>{date(oldV)}</B> → <B>{date(newV)}</B>
        </>
      );
    case "start_date":
      return (
        <>
          đổi ngày bắt đầu <B>{date(oldV)}</B> → <B>{date(newV)}</B>
        </>
      );
    case "department":
      return (
        <>
          đổi phòng/nhóm <B>{txt(oldV)}</B> → <B>{txt(newV)}</B>
        </>
      );
    case "category":
      return (
        <>
          đổi hạng mục <B>{txt(oldV)}</B> → <B>{txt(newV)}</B>
        </>
      );
    case "manual_progress":
      return (
        <>
          cập nhật tiến độ <B>{txt(oldV)}%</B> → <B>{txt(newV)}%</B>
        </>
      );
    case "title":
      return (
        <>
          đổi tiêu đề thành <B>“{txt(newV)}”</B>
        </>
      );
    case "latest_update":
      return <>cập nhật tình hình mới nhất</>;
    case "description":
      return <>sửa mô tả</>;
    default:
      return <>cập nhật công việc</>;
  }
}

function HistorySection({
  taskId,
  nameOf,
  avatarOf,
}: {
  taskId: string;
  nameOf: (id: string | null) => string | null;
  avatarOf: (id: string | null) => string | null;
}) {
  const { data: logs = [] } = useTaskLogs(taskId);

  return (
    <div className="space-y-3">
      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có hoạt động nào.</p>
      ) : (
        <ol className="space-y-3">
          {logs.map((log) => {
            const name = nameOf(log.created_by) ?? "Hệ thống";
            const avatar = avatarOf(log.created_by);
            return (
              <li key={log.id} className="flex gap-2">
                <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                  {avatar && <AvatarImage src={avatar} alt={name} />}
                  <AvatarFallback className="text-[9px]">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{name}</span>{" "}
                  {describeLog(log, nameOf)}{" "}
                  <span className="whitespace-nowrap">
                    · {formatDateTime(log.created_at)}
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function CommentSection({
  taskId,
  nameOf,
  avatarOf,
}: {
  taskId: string;
  nameOf: (id: string | null) => string | null;
  avatarOf: (id: string | null) => string | null;
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
          const avatar = avatarOf(c.user_id);
          return (
            <div key={c.id} className="flex gap-2">
              <Avatar className="h-7 w-7">
                {avatar && <AvatarImage src={avatar} alt={name} />}
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
