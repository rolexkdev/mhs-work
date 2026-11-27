import {
  bucketIndex,
  completedDate,
  isOnTime,
  type Bucket,
  type Scope,
} from "@/modules/dashboard/metrics";
import { TASK_STATUS_ORDER } from "@/modules/tasks/constants";
import type { Task, TaskStatus } from "@/types/database";

export type MetricKey =
  | "completed"
  | "onTimeRate"
  | "created"
  | "open"
  | "overdue";

export type RateTypeFilter = "onTime" | "late" | null;

export type WidgetDrilldown =
  | { kind: "status"; status: TaskStatus }
  | { kind: "department"; department: string | null }
  | { kind: "bucket"; index: number; label: string };

function compareDueAsc(a: Task, b: Task): number {
  if (a.due_date && b.due_date) {
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  }
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
}

function compareCompletedDesc(a: Task, b: Task): number {
  return completedDate(b)!.getTime() - completedDate(a)!.getTime();
}

/** Returns tasks in scope.rows matching a status, ordered per spec without mutating scope. */
export function statusTasks(scope: Scope, status: TaskStatus): Task[] {
  const list = scope.rows.filter((t) => t.status === status);
  return status === "done"
    ? list.sort(compareCompletedDesc)
    : list.sort(compareDueAsc);
}

/** Returns tasks in scope.rows matching a department (null = unassigned), ordered per status. */
export function departmentTasks(
  scope: Scope,
  department: string | null,
): Task[] {
  return scope.rows
    .filter((t) => (t.department ?? null) === department)
    .sort((a, b) => {
      if (a.status === "done" && b.status === "done") {
        return compareCompletedDesc(a, b);
      }
      return compareDueAsc(a, b);
    });
}

/** Returns completed and newly created tasks falling in a throughput chart bucket, newest first. */
export function bucketTasks(
  scope: Scope,
  index: number,
): { completed: Task[]; created: Task[] } {
  if (index < 0 || index >= scope.buckets.length) {
    return { completed: [], created: [] };
  }
  const completed = scope.completed
    .filter((t) => {
      const done = completedDate(t);
      return done !== null && bucketIndex(done, scope.buckets) === index;
    })
    .sort(compareCompletedDesc);
  const created = scope.created
    .filter(
      (t) => bucketIndex(new Date(t.created_at), scope.buckets) === index,
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  return { completed, created };
}

/** Default tab for a throughput bucket sheet: completed when non-empty, otherwise created. */
export function defaultBucketTab(
  completedCount: number,
): "completed" | "created" {
  return completedCount > 0 ? "completed" : "created";
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

/** Returns true for an unmodified primary-button click (lets Ctrl/Cmd/Shift/middle click navigate natively). */
export function isPlainClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
  );
}

/** Filters completed tasks by on-time/late type and/or chart bucket index without mutating input. */
export function filterCompleted(
  tasks: Task[],
  buckets: Bucket[],
  filter: { type: RateTypeFilter; bucket: number | null },
): Task[] {
  return tasks.filter((t) => {
    if (filter.type === "onTime" && !isOnTime(t)) return false;
    if (filter.type === "late" && isOnTime(t)) return false;
    if (filter.bucket !== null) {
      const done = completedDate(t);
      if (!done || bucketIndex(done, buckets) !== filter.bucket) return false;
    }
    return true;
  });
}
