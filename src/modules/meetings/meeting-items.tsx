"use client";

import { useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TASK_STATUS_META } from "@/modules/tasks/constants";
import { useTasks } from "@/modules/tasks/hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMeetings } from "@/modules/meetings/hooks";
import { TaskDetailPanel } from "@/modules/tasks/components/task-detail-panel";
import { useMeetingItems } from "@/modules/meetings/item-hooks";
import type { Meeting, Task } from "@/types/database";

/**
 * Archived directive items of a meeting (read-only). Items are no longer
 * created; old ones keep showing their linked tasks' status and progress.
 */
export function MeetingItems({ meeting }: { meeting: Meeting }) {
  const { data: items = [], isLoading } = useMeetingItems(meeting.id);
  const { data: allTasks = [] } = useTasks({ meetingId: meeting.id });
  const { data: profiles = [] } = useProfiles();
  const { data: meetings = [] } = useMeetings();
  const [taskId, setTaskId] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.full_name ?? p.email]));
    return (id: string) => m.get(id) ?? "—";
  }, [profiles]);

  const tasksByItem = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (t.deleted_at || !t.meeting_item_id) continue;
      m.set(t.meeting_item_id, [...(m.get(t.meeting_item_id) ?? []), t]);
    }
    return m;
  }, [allTasks]);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <Archive className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Cuộc họp này không có đầu mục lưu trữ.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((it) => {
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
                            {it.deadline && (
                              <span>⏰ {it.deadline}</span>
                            )}
                          </div>
                        )}
                      </div>
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
                              {(t.latest_update || t.assignee_ids.length > 0) && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {[t.assignee_ids.map(nameOf).join(", "), t.latest_update]
                                    .filter(Boolean)
                                    .join(" · ")}
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

      <TaskDetailPanel
        taskId={taskId}
        open={!!taskId}
        onOpenChange={(v) => !v && setTaskId(null)}
        meetings={meetings}
      />
    </div>
  );
}
