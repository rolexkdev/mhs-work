import { completedDate, type Scope } from "@/modules/dashboard/metrics";
import { TASK_STATUS_ORDER } from "@/modules/tasks/constants";
import type { Task, TaskStatus } from "@/types/database";

export type MetricKey =
  | "completed"
  | "onTimeRate"
  | "created"
  | "open"
  | "overdue";

function compareDueAsc(a: Task, b: Task): number {
  if (a.due_date && b.due_date) {
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  }
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
}

/** Returns the tasks backing a dashboard stat tile, ordered per spec, without mutating scope. */
export function metricTasks(scope: Scope, key: MetricKey): Task[] {
  switch (key) {
    case "completed":
    case "onTimeRate":
      return [...scope.completed].sort(
        (a, b) => completedDate(b)!.getTime() - completedDate(a)!.getTime(),
      );
    case "created":
      return [...scope.created].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    case "open":
      return [...scope.open].sort(compareDueAsc);
    case "overdue":
      return [...scope.overdue].sort(compareDueAsc);
  }
}

/** Groups tasks in TASK_STATUS_ORDER, omitting empty groups and keeping task order within each group. */
export function groupByStatus(
  tasks: Task[],
): { status: TaskStatus; tasks: Task[] }[] {
  const byStatus = new Map<TaskStatus, Task[]>();
  for (const t of tasks) {
    const list = byStatus.get(t.status);
    if (list) list.push(t);
    else byStatus.set(t.status, [t]);
  }
  const groups: { status: TaskStatus; tasks: Task[] }[] = [];
  for (const status of TASK_STATUS_ORDER) {
    const list = byStatus.get(status);
    if (list && list.length > 0) groups.push({ status, tasks: list });
  }
  return groups;
}
