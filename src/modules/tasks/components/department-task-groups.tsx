"use client";

import { useMemo, type ComponentType, type ReactNode } from "react";
import {
  CheckCircle2,
  Circle,
  Eye,
  Loader,
  PauseCircle,
  type LucideIcon,
} from "lucide-react";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TaskRows } from "@/modules/dashboard/person";
import {
  DEPARTMENTS,
  TAG_ACCENT_CLASS,
  colorOf,
} from "@/modules/tasks/constants";
import type { Task, TaskStatus } from "@/types/database";

/**
 * Icon and solid badge of each status, shared by the task summary tiles and
 * the dashboard sheets. Literal class names so Tailwind can see them.
 */
export const STATUS_BADGE: Record<TaskStatus, { icon: LucideIcon; badge: string }> = {
  todo: { icon: Circle, badge: "bg-slate-500 text-white" },
  in_progress: { icon: Loader, badge: "bg-blue-500 text-white" },
  blocked: { icon: PauseCircle, badge: "bg-orange-500 text-white" },
  review: { icon: Eye, badge: "bg-amber-500 text-white" },
  done: { icon: CheckCircle2, badge: "bg-emerald-500 text-white" },
};

/**
 * Heading of a right-hand task sheet (dashboard metrics, task summary tiles):
 * colored icon badge, title with count, one line of context.
 */
export function TaskSheetHeading({
  icon: Icon,
  badge,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  /** Literal classes of the icon badge, e.g. "bg-blue-500 text-white". */
  badge: string;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 pr-10">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm",
          badge,
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <SheetTitle className="truncate text-lg">{title}</SheetTitle>
        {description && (
          <SheetDescription className="truncate">{description}</SheetDescription>
        )}
      </div>
    </div>
  );
}

/** Groups tasks by department, in DEPARTMENTS order, keeping their order. */
export function groupByDepartment(
  tasks: Task[],
): { department: string | null; tasks: Task[] }[] {
  const byDept = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const k = t.department ?? null;
    const list = byDept.get(k);
    if (list) list.push(t);
    else byDept.set(k, [t]);
  }
  const order: (string | null)[] = DEPARTMENTS.map((d) => d.value);
  for (const k of byDept.keys()) if (k && !order.includes(k)) order.push(k);
  order.push(null);
  return order
    .filter((d) => byDept.has(d))
    .map((d) => ({ department: d, tasks: byDept.get(d)! }));
}

/** Task rows split into department blocks with a header in the department color. */
export function DepartmentTaskGroups({
  tasks,
  nameOf,
  onSelect,
  meta,
}: {
  tasks: Task[];
  nameOf?: (id: string | null) => string;
  onSelect?: (t: Task) => void;
  /** Right-hand cell of each row (defaults to the due date). */
  meta?: (t: Task) => ReactNode;
}) {
  const groups = useMemo(() => groupByDepartment(tasks), [tasks]);

  if (groups.length === 0)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Không có việc nào.
      </p>
    );

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const accent =
          TAG_ACCENT_CLASS[
            g.department ? colorOf(DEPARTMENTS, g.department) : "gray"
          ];
        return (
          <section key={g.department ?? "__none__"} className="space-y-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold",
                accent.header,
              )}
            >
              {g.department ?? "Chưa phân phòng"}
              <span className="text-xs font-normal opacity-90">
                {g.tasks.length} việc
              </span>
            </div>
            <TaskRows
              tasks={g.tasks}
              nameOf={nameOf}
              onSelect={onSelect}
              meta={meta}
            />
          </section>
        );
      })}
    </div>
  );
}
