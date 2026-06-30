"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus, Filter, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMeetings } from "@/modules/meetings/hooks";
import {
  useTasks,
  useUpdateTask,
  useDeleteTask,
  type TaskQueryFilters,
} from "@/modules/tasks/hooks";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
} from "@/modules/tasks/constants";
import { TaskBoard } from "@/modules/tasks/components/task-board";
import {
  TaskListView,
  type GroupBy,
} from "@/modules/tasks/components/task-list-view";
import { TaskFormDialog } from "@/modules/tasks/components/task-form-dialog";
import { TaskDetailPanel } from "@/modules/tasks/components/task-detail-panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PeriodPicker } from "@/components/period-picker";
import {
  type Period,
  currentPeriod,
  isTaskInPeriod,
  periodRange,
  weekKey,
} from "@/lib/period";
import type { Task, TaskStatus } from "@/types/database";

const ALL = "__all__";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "Bảng mặc định" },
  { value: "department", label: "Phòng/Nhóm" },
  { value: "assignee", label: "Người phụ trách" },
  { value: "status", label: "Trạng thái" },
  { value: "meeting", label: "Cuộc họp" },
];

export function TasksWorkspace({ meetingId }: { meetingId?: string }) {
  const [view, setView] = useState<"board" | "list">("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  // Trong trang chi tiết cuộc họp: xem tất cả task của họp, không lọc theo tuần.
  const [period, setPeriod] = useState<Period>(() =>
    meetingId ? { mode: "all", anchor: new Date().toISOString() } : currentPeriod(),
  );
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ALL);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  // Mở chi tiết khi điều hướng kèm ?task=<id> (vd từ Cmd-K).
  const searchParams = useSearchParams();
  useEffect(() => {
    const tid = searchParams.get("task");
    if (tid) {
      setDetailId(tid);
      setDetailOpen(true);
    }
  }, [searchParams]);

  const { data: profiles = [] } = useProfiles();
  const { data: meetings = [] } = useMeetings();

  const filters: TaskQueryFilters = {
    meetingId: meetingId ?? null,
    status: statusFilter === ALL ? null : (statusFilter as Task["status"]),
    priority:
      priorityFilter === ALL ? null : (priorityFilter as Task["priority"]),
    assigneeId: assigneeFilter === ALL ? null : assigneeFilter,
  };
  const { data: tasks = [], isLoading } = useTasks(filters);

  // Lọc theo kỳ (tuần/tháng) — bỏ qua khi đang ở trong 1 cuộc họp.
  const visibleTasks = useMemo(
    () => tasks.filter((t) => isTaskInPeriod(t, period)),
    [tasks, period],
  );

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => m.set(p.id, p.full_name ?? p.email));
    return m;
  }, [profiles]);
  const nameOf = (id: string | null) => (id ? nameById.get(id) ?? null : null);

  const avatarById = useMemo(() => {
    const m = new Map<string, string | null>();
    profiles.forEach((p) => m.set(p.id, p.avatar_url));
    return m;
  }, [profiles]);
  const avatarOf = (id: string | null) =>
    id ? avatarById.get(id) ?? null : null;

  function openDetail(t: Task) {
    setDetailId(t.id);
    setDetailOpen(true);
  }
  function handleStatusChange(id: string, status: TaskStatus) {
    updateTask.mutate({ id, status });
  }
  function handlePatch(id: string, patch: Partial<Task>) {
    updateTask.mutate({ id, ...patch });
  }
  function handleDelete(t: Task) {
    setPendingDelete(t);
  }
  function handleToggleWeekHidden(t: Task) {
    const { start } = periodRange(period);
    if (!start) return;
    const wk = weekKey(start);
    const has = t.hidden_weeks?.includes(wk);
    const hidden_weeks = has
      ? t.hidden_weeks.filter((w) => w !== wk)
      : [...(t.hidden_weeks ?? []), wk];
    updateTask.mutate({ id: t.id, hidden_weeks });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!meetingId && <PeriodPicker value={period} onChange={setPeriod} />}

        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="list">
              <List className="h-4 w-4" /> Danh sách
            </TabsTrigger>
            <TabsTrigger value="board">
              <LayoutGrid className="h-4 w-4" /> Kanban
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {view === "list" && (
          <div className="flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupBy)}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    Nhóm: {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Trạng thái"
            options={TASK_STATUS_ORDER.map((s) => ({
              value: s,
              label: TASK_STATUS_META[s].label,
            }))}
          />
          <FilterSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            placeholder="Ưu tiên"
            options={TASK_PRIORITY_ORDER.map((p) => ({
              value: p,
              label: TASK_PRIORITY_META[p].label,
            }))}
          />
          <FilterSelect
            value={assigneeFilter}
            onChange={setAssigneeFilter}
            placeholder="Người làm"
            options={profiles.map((p) => ({
              value: p.id,
              label: p.full_name ?? p.email,
            }))}
          />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Tạo công việc
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {tasks.length === 0
              ? "Chưa có công việc nào. Bấm Tạo công việc để bắt đầu."
              : "Không có công việc nào trong kỳ này. Đổi bộ lọc kỳ để xem thêm."}
          </p>
        </div>
      ) : view === "board" ? (
        <TaskBoard
          tasks={visibleTasks}
          nameOf={nameOf}
          avatarOf={avatarOf}
          onEdit={openDetail}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <TaskListView
          tasks={visibleTasks}
          groupBy={groupBy}
          profiles={profiles}
          meetings={meetings}
          nameOf={nameOf}
          onOpen={openDetail}
          onDelete={handleDelete}
          onPatch={handlePatch}
          canHideWeek={period.mode === "week"}
          onToggleWeekHidden={handleToggleWeekHidden}
        />
      )}

      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        meetings={meetings}
        defaultMeetingId={meetingId}
        lockMeeting={!!meetingId}
      />
      <TaskDetailPanel
        taskId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        meetings={meetings}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Xoá công việc?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" sẽ bị xoá vĩnh viễn cùng việc con, bình luận và tệp đính kèm.`
            : undefined
        }
        confirmLabel="Xoá"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteTask.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[140px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Tất cả {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
