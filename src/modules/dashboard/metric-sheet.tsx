"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { dueLabel, formatDate } from "@/lib/format";
import { metricTasks, type MetricKey } from "@/modules/dashboard/drilldown";
import {
  completedDate,
  isOnTime,
  isOverdue,
  type Scope,
} from "@/modules/dashboard/metrics";
import { TaskRows } from "@/modules/dashboard/person";
import type { Task } from "@/types/database";

export const METRIC_TITLE: Record<MetricKey, string> = {
  completed: "Hoàn thành trong kỳ",
  onTimeRate: "Tỷ lệ xong đúng hạn",
  created: "Việc mới giao",
  open: "Đang thực hiện",
  overdue: "Quá hạn",
};

function rowMeta(metric: MetricKey): (t: Task) => ReactNode {
  return (t) => {
    if (metric === "completed" || metric === "onTimeRate") {
      const doneAt = completedDate(t);
      return (
        <span
          className={cn(
            "shrink-0 whitespace-nowrap text-right text-xs",
            doneAt && !isOnTime(t)
              ? "text-amber-600"
              : "text-muted-foreground",
          )}
        >
          {doneAt ? formatDate(doneAt.toISOString()) : "—"}
        </span>
      );
    }
    if (metric === "created") {
      return (
        <span className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
          {formatDate(t.created_at)}
        </span>
      );
    }
    const late = metric === "overdue" || isOverdue(t);
    return (
      <span
        className={cn(
          "shrink-0 whitespace-nowrap text-right text-xs",
          late ? "font-medium text-red-600" : "text-muted-foreground",
        )}
      >
        {dueLabel(t.due_date).text}
      </span>
    );
  };
}

export function MetricSheetBody({
  metric,
  scope,
  periodLabel,
  department,
  nameOf,
  onSelect,
}: {
  metric: MetricKey;
  scope: Scope;
  periodLabel: string;
  department: string | null;
  nameOf: (id: string | null) => string;
  onSelect?: (t: Task) => void;
}) {
  const tasks = metricTasks(scope, metric);
  const title = METRIC_TITLE[metric];

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="space-y-1 pr-10">
        <SheetTitle className="truncate text-lg">
          {title} ({tasks.length})
        </SheetTitle>
        <SheetDescription className="truncate">
          {periodLabel}
          {department ? ` · ${department}` : ""}
        </SheetDescription>
      </div>

      <TaskRows
        tasks={tasks}
        nameOf={nameOf}
        onSelect={onSelect}
        meta={rowMeta(metric)}
      />
    </div>
  );
}

export function MetricSheet({
  metric,
  scope,
  periodLabel,
  department,
  nameOf,
  onSelect,
  onClose,
}: {
  metric: MetricKey | null;
  scope: Scope;
  periodLabel: string;
  department: string | null;
  nameOf: (id: string | null) => string;
  onSelect?: (t: Task) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!metric} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="overflow-y-auto sm:max-w-2xl"
        // Prevent auto-focus from triggering chart tooltips when opened.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {metric && (
          <MetricSheetBody
            metric={metric}
            scope={scope}
            periodLabel={periodLabel}
            department={department}
            nameOf={nameOf}
            onSelect={onSelect}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
