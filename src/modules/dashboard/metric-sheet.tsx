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
import type { PeriodMode } from "@/lib/period";
import { ThroughputChart } from "@/modules/dashboard/charts";
import {
  groupByStatus,
  metricTasks,
  type MetricKey,
} from "@/modules/dashboard/drilldown";
import {
  completedDate,
  isOnTime,
  isOverdue,
  type Scope,
} from "@/modules/dashboard/metrics";
import { OnTimeBadge, TaskRows } from "@/modules/dashboard/person";
import { TASK_STATUS_META } from "@/modules/tasks/constants";
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
    if (metric === "onTimeRate") {
      const doneAt = completedDate(t);
      return (
        <div className="shrink-0 text-right">
          <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {doneAt ? formatDate(doneAt.toISOString()) : "—"}
          </p>
          <OnTimeBadge onTime={isOnTime(t)} />
        </div>
      );
    }
    if (metric === "completed") {
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
  periodMode,
  department,
  nameOf,
  onSelect,
}: {
  metric: MetricKey;
  scope: Scope;
  periodLabel: string;
  periodMode?: PeriodMode;
  department: string | null;
  nameOf: (id: string | null) => string;
  onSelect?: (t: Task) => void;
}) {
  const tasks = metricTasks(scope, metric);
  const title = METRIC_TITLE[metric];
  const meta = rowMeta(metric);

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

      {metric === "onTimeRate" && tasks.length > 0 && (
        <div className="space-y-2">
          <ThroughputChart
            series={scope.series}
            showCreated={false}
            height={170}
          />
          {periodMode === "all" && (
            <p className="text-[11px] text-muted-foreground">
              Biểu đồ chỉ hiển thị 12 tháng gần nhất; số liệu chú thích và danh
              sách bao gồm toàn bộ việc đã hoàn thành.
            </p>
          )}
        </div>
      )}

      {metric === "open" && tasks.length > 0 ? (
        <div className="space-y-4">
          {groupByStatus(tasks).map((group) => (
            <section key={group.status} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    TASK_STATUS_META[group.status].dot,
                  )}
                />
                <span>{TASK_STATUS_META[group.status].label}</span>
                <span className="tabular-nums">({group.tasks.length})</span>
              </div>
              <TaskRows
                tasks={group.tasks}
                nameOf={nameOf}
                onSelect={onSelect}
                meta={meta}
              />
            </section>
          ))}
        </div>
      ) : (
        <TaskRows
          tasks={tasks}
          nameOf={nameOf}
          onSelect={onSelect}
          meta={meta}
        />
      )}
    </div>
  );
}

export function MetricSheet({
  metric,
  scope,
  periodLabel,
  periodMode,
  department,
  nameOf,
  onSelect,
  onClose,
  children,
}: {
  metric: MetricKey | null;
  scope: Scope;
  periodLabel: string;
  periodMode?: PeriodMode;
  department: string | null;
  nameOf: (id: string | null) => string;
  onSelect?: (t: Task) => void;
  onClose: () => void;
  /** Nested overlays (e.g. TaskDetailPanel) rendered inside this dialog's React tree so their close interactions do not dismiss the metric sheet. */
  children?: ReactNode;
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
            periodMode={periodMode}
            department={department}
            nameOf={nameOf}
            onSelect={onSelect}
          />
        )}
        {children}
      </SheetContent>
    </Sheet>
  );
}
