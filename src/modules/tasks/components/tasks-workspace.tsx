"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Table2, Plus, Filter } from "lucide-react";
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
import { TaskTable } from "@/modules/tasks/components/task-table";
import { TaskFormDialog } from "@/modules/tasks/components/task-form-dialog";
import type { Task, TaskStatus } from "@/types/database";

const ALL = "__all__";

export function TasksWorkspace({
  meetingId,
}: {
  /** Khi truyền: chỉ hiển thị task của cuộc họp này, ẩn filter cuộc họp. */
  meetingId?: string;
}) {
  const [view, setView] = useState<"board" | "table">("board");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

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

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(t: Task) {
    setEditing(t);
    setDialogOpen(true);
  }
  function handleStatusChange(id: string, status: TaskStatus) {
    updateTask.mutate({ id, status });
  }
  function handleDelete(t: Task) {
    if (confirm(`Xoá công việc "${t.title}"?`)) deleteTask.mutate(t.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="board">
              <LayoutGrid className="h-4 w-4" /> Bảng
            </TabsTrigger>
            <TabsTrigger value="table">
              <Table2 className="h-4 w-4" /> Danh sách
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Tạo công việc
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
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
          onEdit={openEdit}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <TaskTable
          tasks={tasks}
          nameOf={nameOf}
          onEdit={openEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />
      )}

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        meetings={meetings}
        defaultMeetingId={meetingId}
        lockMeeting={!!meetingId}
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
