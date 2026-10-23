"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  FileUp,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  MEETING_ITEM_STATUS_META,
  TASK_STATUS_META,
} from "@/modules/tasks/constants";
import { useTasks } from "@/modules/tasks/hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMeetings } from "@/modules/meetings/hooks";
import { TaskDetailPanel } from "@/modules/tasks/components/task-detail-panel";
import {
  useDeleteMeetingItem,
  useMe,
  useMeetingItems,
  useResolveMeetingItem,
} from "@/modules/meetings/item-hooks";
import {
  AssignItemDialog,
  ItemFormDialog,
  ResolveItemDialog,
} from "@/modules/meetings/item-dialogs";
import { ImportItemsDialog } from "@/modules/meetings/import-items-dialog";
import type {
  Meeting,
  MeetingItem,
  MeetingItemStatus,
  Task,
} from "@/types/database";

type Filter = "all" | MeetingItemStatus | "mine";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "open", label: "Chưa nhận" },
  { value: "in_progress", label: "Đang xử lý" },
  { value: "done", label: "Đã xử lý" },
  { value: "mine", label: "Việc của tôi" },
];

/**
 * Đầu mục chỉ đạo của cuộc họp: ai cũng nhận/giao việc và đánh dấu đã xử lý;
 * lãnh đạo xem tổng quan cuộc họp đã giao gì và xử lý tới đâu.
 */
export function MeetingItems({ meeting }: { meeting: Meeting }) {
  const { data: items = [], isLoading } = useMeetingItems(meeting.id);
  const { data: tasks = [] } = useTasks({ meetingId: meeting.id });
  const { data: profiles = [] } = useProfiles();
  const { data: meetings = [] } = useMeetings();
  const { data: me } = useMe();
  const resolve = useResolveMeetingItem();
  const del = useDeleteMeetingItem();

  const canManage = me?.role === "admin" || me?.role === "leader";

  const [filter, setFilter] = useState<Filter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingItem | null>(null);
  const [assigning, setAssigning] = useState<MeetingItem | null>(null);
  const [resolving, setResolving] = useState<MeetingItem | null>(null);
  const [deleting, setDeleting] = useState<MeetingItem | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.full_name ?? p.email]));
    return (id: string | null) => (id ? (m.get(id) ?? "—") : "Chưa giao");
  }, [profiles]);

  const tasksByItem = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.meeting_item_id) continue;
      const list = m.get(t.meeting_item_id) ?? [];
      list.push(t);
      m.set(t.meeting_item_id, list);
    }
    return m;
  }, [tasks]);

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, done: 0 };
    for (const it of items) c[it.status] += 1;
    return c;
  }, [items]);

  const visible = items.filter((it) => {
    if (filter === "all") return true;
    if (filter === "mine")
      return (tasksByItem.get(it.id) ?? []).some((t) => t.assignee_id === me?.id);
    return it.status === filter;
  });

  const pct = items.length ? Math.round((counts.done / items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Tổng quan cho lãnh đạo */}
      {items.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="text-2xl font-semibold">{counts.done}</span>
                <span className="text-muted-foreground">
                  /{items.length} đầu mục đã xử lý
                </span>
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {(["open", "in_progress", "done"] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        MEETING_ITEM_STATUS_META[s].dot,
                      )}
                    />
                    {MEETING_ITEM_STATUS_META[s].label}: {counts[s]}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
              <div
                className="bg-blue-500 transition-all"
                style={{
                  width: `${(counts.in_progress / items.length) * 100}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {items.length > 0 &&
            FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" /> Nhập từ biên bản
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Thêm đầu mục
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <FileUp className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Chưa có đầu mục nào. Tải biên bản họp (.docx) lên để tự tách các
            nhiệm vụ.
          </p>
          <Button className="mt-4" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" /> Nhập từ biên bản
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Không có đầu mục nào ở mục này.
        </p>
      ) : (
        <ol className="space-y-3">
          {visible.map((it) => {
            const linked = tasksByItem.get(it.id) ?? [];
            const meta = MEETING_ITEM_STATUS_META[it.status];
            const allDone =
              linked.length > 0 && linked.every((t) => t.status === "done");
            return (
              <li key={it.id}>
                <Card
                  className={cn(
                    "border-l-4",
                    it.status === "done"
                      ? "border-l-emerald-500"
                      : it.status === "in_progress"
                        ? "border-l-blue-500"
                        : "border-l-slate-300",
                  )}
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {items.indexOf(it) + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                              meta.badge,
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                          {it.title && (
                            <span className="font-semibold">{it.title}</span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{it.content}</p>
                        {(it.department || it.deadline) && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {it.department && <span>👥 {it.department}</span>}
                            {it.deadline && <span>⏰ {it.deadline}</span>}
                          </div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(it);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Sửa đầu mục
                          </DropdownMenuItem>
                          {it.status === "done" && (
                            <DropdownMenuItem
                              onClick={() =>
                                resolve.mutate({ id: it.id, done: false })
                              }
                            >
                              <RotateCcw className="mr-2 h-4 w-4" /> Mở lại
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleting(it)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Xoá
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Công việc đã giao từ đầu mục */}
                    {linked.length > 0 && (
                      <ul className="divide-y rounded-md border bg-muted/20 sm:ml-9">
                        {linked.map((t) => {
                          const tm = TASK_STATUS_META[t.status];
                          return (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => setTaskId(t.id)}
                                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                              >
                                <span className="w-32 shrink-0 truncate font-medium sm:w-40">
                                  {nameOf(t.assignee_id)}
                                </span>
                                <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">
                                  {t.latest_update || t.title}
                                </span>
                                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {t.manual_progress}%
                                </span>
                                <span
                                  className={cn(
                                    "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                                    tm.badge,
                                  )}
                                >
                                  {tm.label}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {it.status === "done" && (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/40 sm:ml-9">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          ✅ {nameOf(it.handled_by)} đánh dấu đã xử lý ·{" "}
                          {formatDateTime(it.handled_at)}
                        </p>
                        {it.result && (
                          <p className="mt-1 whitespace-pre-wrap">{it.result}</p>
                        )}
                      </div>
                    )}

                    {it.status !== "done" && (
                      <div className="flex flex-wrap items-center gap-2 sm:ml-9">
                        <Button
                          size="sm"
                          variant={linked.length ? "outline" : "default"}
                          onClick={() => setAssigning(it)}
                        >
                          <UserPlus className="h-4 w-4" />
                          {linked.length ? "Giao thêm" : "Nhận / giao việc"}
                        </Button>
                        <Button
                          size="sm"
                          variant={allDone ? "default" : "outline"}
                          onClick={() => setResolving(it)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Đã xử lý
                        </Button>
                        {allDone && (
                          <span className="text-xs text-muted-foreground">
                            Các việc đã hoàn thành — đánh dấu đầu mục đã xử lý?
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <ImportItemsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        meeting={meeting}
        canEditMeeting={canManage}
      />
      <ItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        meetingId={meeting.id}
        item={editing}
      />
      <AssignItemDialog
        item={assigning}
        meId={me?.id ?? null}
        onOpenChange={(v) => !v && setAssigning(null)}
      />
      <ResolveItemDialog
        item={resolving}
        onOpenChange={(v) => !v && setResolving(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Xoá đầu mục?"
        description="Các công việc đã giao vẫn giữ lại, chỉ bỏ liên kết với đầu mục."
        confirmLabel="Xoá"
        destructive
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
      <TaskDetailPanel
        taskId={taskId}
        open={!!taskId}
        onOpenChange={(v) => !v && setTaskId(null)}
        meetings={meetings}
      />
    </div>
  );
}
