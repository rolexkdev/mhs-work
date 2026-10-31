"use client";

import { useMemo, useState } from "react";
import { FileUp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  TASK_STATUS_META,
  TAG_COLOR_CLASS,
  DEPARTMENTS,
  colorOf,
} from "@/modules/tasks/constants";
import { useTasks } from "@/modules/tasks/hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMeetings } from "@/modules/meetings/hooks";
import { TaskDetailPanel } from "@/modules/tasks/components/task-detail-panel";
import {
  useCreateMissingTasks,
  useDeleteMeetingItem,
  useMe,
  useMeetingItems,
} from "@/modules/meetings/item-hooks";
import { ItemFormDialog } from "@/modules/meetings/item-dialogs";
import { ImportItemsDialog } from "@/modules/meetings/import-items-dialog";
import type { Meeting, MeetingItem, Task, TaskStatus } from "@/types/database";

type StatusFilter = "all" | "todo" | "doing" | "done";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "todo", label: "Chưa bắt đầu" },
  { value: "doing", label: "Đang thực hiện" },
  { value: "done", label: "Hoàn thành" },
];

function matches(filter: StatusFilter, status: TaskStatus | undefined) {
  if (filter === "all") return true;
  if (filter === "todo") return !status || status === "todo";
  if (filter === "done") return status === "done";
  return !!status && status !== "todo" && status !== "done";
}

/**
 * Đầu mục chỉ đạo của cuộc họp: mỗi đầu mục đi kèm công việc giao theo phòng.
 * Tiến độ và trạng thái lấy thẳng từ công việc, bấm vào để mở chi tiết công việc.
 */
export function MeetingItems({ meeting }: { meeting: Meeting }) {
  const { data: items = [], isLoading } = useMeetingItems(meeting.id);
  const { data: tasks = [] } = useTasks({ meetingId: meeting.id });
  const { data: profiles = [] } = useProfiles();
  const { data: meetings = [] } = useMeetings();
  const { data: me } = useMe();
  const del = useDeleteMeetingItem();
  const createMissing = useCreateMissingTasks();

  const canManage = me?.role === "admin" || me?.role === "leader";

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [dept, setDept] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingItem | null>(null);
  const [deleting, setDeleting] = useState<MeetingItem | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.full_name ?? p.email]));
    return (id: string) => m.get(id) ?? "—";
  }, [profiles]);

  const tasksByItem = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of [...tasks].reverse()) {
      if (!t.meeting_item_id) continue;
      m.set(t.meeting_item_id, [...(m.get(t.meeting_item_id) ?? []), t]);
    }
    return m;
  }, [tasks]);

  const linkedTasks = tasks.filter((t) => t.meeting_item_id);
  const doneCount = linkedTasks.filter((t) => t.status === "done").length;
  const doingCount = linkedTasks.filter(
    (t) => t.status !== "done" && t.status !== "todo",
  ).length;
  const total = linkedTasks.length;
  const missing = items.filter((it) => !tasksByItem.has(it.id));
  const departments = [
    ...new Set(linkedTasks.flatMap((t) => (t.department ? [t.department] : []))),
  ].sort();

  const visible = items.filter((it) => {
    const linked = tasksByItem.get(it.id) ?? [];
    if (dept && !linked.some((t) => t.department === dept)) return false;
    if (filter === "all") return true;
    return linked.length
      ? linked.some((t) => matches(filter, t.status))
      : matches(filter, undefined);
  });

  return (
    <div className="space-y-4">
      {/* Tổng quan cho lãnh đạo */}
      {total > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="text-2xl font-semibold">{doneCount}</span>
                <span className="text-muted-foreground">
                  /{total} công việc hoàn thành
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Đang thực hiện: {doingCount} · Chưa bắt đầu:{" "}
                {total - doneCount - doingCount}
              </p>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${(doneCount / total) * 100}%` }}
              />
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${(doingCount / total) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {canManage && missing.length > 0 && !isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
          <span>{missing.length} đầu mục chưa có công việc.</span>
          <Button
            size="sm"
            disabled={createMissing.isPending}
            onClick={() => createMissing.mutate(missing)}
          >
            {createMissing.isPending ? "Đang tạo..." : "Tạo công việc"}
          </Button>
        </div>
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
        {canManage && (
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
        )}
      </div>

      {departments.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {departments.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDept(dept === d ? null : d)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-medium transition-opacity",
                TAG_COLOR_CLASS[colorOf(DEPARTMENTS, d)],
                dept && dept !== d && "opacity-50",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      )}

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
            Chưa có đầu mục nào trong cuộc họp này.
          </p>
          {canManage && (
            <Button className="mt-4" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" /> Nhập từ biên bản
            </Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Không có đầu mục nào ở mục này.
        </p>
      ) : (
        <ol className="space-y-3">
          {visible.map((it) => {
            const linked = tasksByItem.get(it.id) ?? [];
            return (
              <li key={it.id}>
                <Card
                  className={cn(
                    "transition-shadow",
                    linked.length > 0 && "cursor-pointer hover:shadow-md",
                  )}
                  onClick={() => linked[0] && setTaskId(linked[0].id)}
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {items.indexOf(it) + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        {it.title && <p className="font-semibold">{it.title}</p>}
                        <p className="whitespace-pre-wrap text-sm">{it.content}</p>
                        {(it.department || it.deadline) && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {it.department && <span>👥 {it.department}</span>}
                            {it.deadline && <span>⏰ {it.deadline}</span>}
                          </div>
                        )}
                      </div>
                      {canManage && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label="Thao tác đầu mục"
                              >
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
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleting(it)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Xoá
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>

                    {/* Tiến độ + trạng thái lấy từ công việc */}
                    {linked.length === 0 ? (
                      <p className="text-xs text-muted-foreground sm:ml-9">
                        Chưa có công việc.
                      </p>
                    ) : (
                      <div className="space-y-2 sm:ml-9">
                        {linked.map((t) => {
                          const tm = TASK_STATUS_META[t.status];
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTaskId(t.id);
                              }}
                              className="block w-full space-y-1.5 rounded-md text-left"
                            >
                              <span className="flex items-center gap-3">
                                <Progress
                                  value={t.manual_progress}
                                  className="min-w-0 flex-1"
                                  indicatorClassName={
                                    t.status === "done" ? "bg-emerald-500" : undefined
                                  }
                                />
                                <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums">
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
                              </span>
                              {(t.latest_update || t.assignee_id) && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {t.assignee_id && `${nameOf(t.assignee_id)} `}
                                  {t.assignee_id && t.latest_update && "· "}
                                  {t.latest_update}
                                </span>
                              )}
                            </button>
                          );
                        })}
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
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Xoá đầu mục?"
        description="Công việc đi kèm cũng bị xoá cùng tiến độ, bình luận và tệp đính kèm."
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
