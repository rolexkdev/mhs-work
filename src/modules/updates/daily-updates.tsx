"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { addDays, format, isToday } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDateTime, initials } from "@/lib/format";
import { isTaskInPeriod } from "@/lib/period";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTasks } from "@/modules/tasks/hooks";
import { useDailyUpdates } from "@/modules/tasks/log-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { TASK_STATUS_META } from "@/modules/tasks/constants";
import type { Profile } from "@/types/database";

export function DailyUpdates() {
  const [date, setDate] = useState<Date>(() => new Date());
  const dateISO = date.toISOString();

  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: logs = [], isLoading: logsLoading } = useDailyUpdates(dateISO);
  const { data: profiles = [] } = useProfiles();

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);
  const nameOf = (id: string | null) =>
    id ? profileById.get(id)?.full_name ?? profileById.get(id)?.email ?? null : null;

  // Task cần theo dõi trong ngày: đang hoạt động trong tuần chứa ngày này & chưa xong.
  const period = { mode: "week" as const, anchor: dateISO };
  const activeTasks = useMemo(
    () =>
      tasks.filter((t) => t.status !== "done" && isTaskInPeriod(t, period)),
    [tasks, dateISO], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Log cập nhật mới nhất trong ngày theo từng task (logs đã sắp giảm dần).
  const updateByTask = useMemo(() => {
    const m = new Map<string, (typeof logs)[number]>();
    for (const l of logs) if (!m.has(l.task_id)) m.set(l.task_id, l);
    return m;
  }, [logs]);

  const rows = useMemo(() => {
    const list = activeTasks.map((t) => ({ task: t, log: updateByTask.get(t.id) }));
    // Chưa cập nhật lên trước để dễ nhắc nhở.
    return list.sort((a, b) => Number(!!a.log) - Number(!!b.log));
  }, [activeTasks, updateByTask]);

  const updatedN = rows.filter((r) => r.log).length;
  const isLoading = tasksLoading || logsLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center rounded-md border">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-8"
            onClick={() => setDate((d) => addDays(d, -1))}
            title="Ngày trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[190px] px-2 text-center text-sm font-medium">
            {format(date, "EEEE, dd/MM/yyyy", { locale: vi })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-8"
            onClick={() => setDate((d) => addDays(d, 1))}
            title="Ngày sau"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && (
            <span className="text-sm text-muted-foreground">
              Đã cập nhật{" "}
              <span className="font-semibold text-foreground">
                {updatedN}/{rows.length}
              </span>{" "}
              công việc
            </span>
          )}
          {!isToday(date) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDate(new Date())}
            >
              Hôm nay
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Không có công việc cần cập nhật trong tuần của ngày này.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ task, log }) => {
            const meta = TASK_STATUS_META[task.status];
            const content =
              typeof log?.new_value === "string" ? log.new_value : null;
            const updater = nameOf(log?.created_by ?? null);
            return (
              <Card key={task.id} className={cn(!log && "border-dashed")}>
                <CardContent className="flex items-start gap-3 p-3">
                  {log ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/50" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/tasks?task=${task.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {task.title}
                      </Link>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[11px] font-medium",
                          meta.badge,
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Avatar className="h-4 w-4">
                        {profileById.get(task.assignee_id ?? "")?.avatar_url && (
                          <AvatarImage
                            src={
                              profileById.get(task.assignee_id ?? "")!
                                .avatar_url!
                            }
                            alt=""
                          />
                        )}
                        <AvatarFallback className="text-[8px]">
                          {initials(nameOf(task.assignee_id) ?? "?")}
                        </AvatarFallback>
                      </Avatar>
                      {nameOf(task.assignee_id) ?? "Chưa giao"}
                    </div>

                    {log ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">
                        {content || (
                          <span className="text-muted-foreground">
                            (Đã xoá nội dung cập nhật)
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {updater ? `${updater} · ` : ""}
                          {formatDateTime(log.created_at)}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-2 text-xs font-medium text-amber-600">
                        Chưa cập nhật hôm nay
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
