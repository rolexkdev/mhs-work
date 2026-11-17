"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMeetings } from "@/modules/meetings/hooks";
import { norm } from "@/modules/meetings/parse-minutes";
import {
  usePurgeTask,
  useRestoreTask,
  useTrashedTasks,
} from "@/modules/tasks/hooks";
import { TASK_STATUS_META } from "@/modules/tasks/constants";
import { TaskDetailPanel } from "@/modules/tasks/components/task-detail-panel";
import type { Task } from "@/types/database";

/**
 * Thùng rác công việc (chỉ admin). Công việc vẫn giữ nguyên lịch sử, bình luận,
 * việc con và tiến độ; bấm vào để xem, "Khôi phục" để đưa về danh sách.
 */
export function TaskTrash() {
  const { data: tasks = [], isLoading } = useTrashedTasks();
  const { data: profiles = [] } = useProfiles();
  const { data: meetings = [] } = useMeetings();
  const restore = useRestoreTask();
  const purge = usePurgeTask();

  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [purging, setPurging] = useState<Task | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.full_name ?? p.email]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [profiles]);
  const meetingOf = useMemo(() => {
    const m = new Map(meetings.map((x) => [x.id, x.title]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [meetings]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return tasks;
    return tasks.filter((t) =>
      norm(
        [t.title, t.department, nameOf(t.deleted_by), meetingOf(t.meeting_id)]
          .filter(Boolean)
          .join(" "),
      ).includes(q),
    );
  }, [tasks, query, nameOf, meetingOf]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên, phòng, người xoá, cuộc họp"
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {tasks.length ? "Không có công việc nào khớp." : "Thùng rác trống."}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => {
            const status = TASK_STATUS_META[t.status];
            const meeting = meetingOf(t.meeting_id);
            return (
              <li key={t.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      className="min-w-0 flex-1 space-y-1 text-left"
                    >
                      <p className="font-medium leading-snug hover:underline">
                        {t.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <Badge
                          variant="outline"
                          className={cn("font-normal", status?.badge)}
                        >
                          {status?.label ?? t.status}
                        </Badge>
                        <span>Tiến độ {t.manual_progress}%</span>
                        {t.department && <span>· {t.department}</span>}
                        {meeting && <span>· Họp: {meeting}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {nameOf(t.deleted_by)} xoá lúc{" "}
                        {formatDateTime(t.deleted_at)}
                      </p>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(t.id)}
                      >
                        <RotateCcw className="h-4 w-4" /> Khôi phục
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-red-600"
                        title="Xoá vĩnh viễn"
                        onClick={() => setPurging(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <TaskDetailPanel
        taskId={openId}
        open={!!openId}
        onOpenChange={(v) => !v && setOpenId(null)}
        meetings={meetings}
      />
      <ConfirmDialog
        open={!!purging}
        onOpenChange={(v) => !v && setPurging(null)}
        title="Xoá vĩnh viễn?"
        description={
          purging
            ? `"${purging.title}" sẽ bị xoá hẳn cùng lịch sử, việc con, bình luận và tệp đính kèm. Không thể khôi phục.`
            : undefined
        }
        confirmLabel="Xoá vĩnh viễn"
        destructive
        onConfirm={() => purging && purge.mutate(purging.id)}
      />
    </div>
  );
}
