"use client";

import { useMemo, useState } from "react";
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
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ALL);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => m.set(p.id, p.full_name ?? p.email));
    return m;
  }, [profiles]);
  const nameOf = (id: string | null) => (id ? nameById.get(id) ?? null : null);

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
    if (confirm(`Xoá công việc "${t.title}"?`)) deleteTask.mutate(t.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Chưa có công việc nào. Bấm{" "}
            <span className="font-medium">Tạo công việc</span> để bắt đầu.
          </p>
        </div>
      ) : view === "board" ? (
        <TaskBoard
          tasks={tasks}
          nameOf={nameOf}
          onEdit={openDetail}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <TaskListView
          tasks={tasks}
          groupBy={groupBy}
          profiles={profiles}
          meetings={meetings}
          nameOf={nameOf}
          onOpen={openDetail}
          onDelete={handleDelete}
          onPatch={handlePatch}
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
