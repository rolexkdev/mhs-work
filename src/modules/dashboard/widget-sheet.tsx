"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  bucketTasks,
  defaultBucketTab,
  departmentTasks,
  statusTasks,
  type WidgetDrilldown,
} from "@/modules/dashboard/drilldown";
import type { Scope } from "@/modules/dashboard/metrics";
import {
  rowMeta,
  StatusGroupedTaskRows,
} from "@/modules/dashboard/metric-sheet";
import { TaskRows } from "@/modules/dashboard/person";
import { TASK_STATUS_META } from "@/modules/tasks/constants";
import type { Task } from "@/types/database";

const completedMeta = rowMeta("completed");
const rateMeta = rowMeta("onTimeRate");
const createdMeta = rowMeta("created");
const openMeta = rowMeta("open");
const statusAwareMeta = (t: Task) =>
  t.status === "done" ? completedMeta(t) : openMeta(t);

function WidgetSheetBody({
  widget,
  scope,
  periodLabel,
  department,
  nameOf,
  onSelect,
}: {
  widget: WidgetDrilldown;
  scope: Scope;
  periodLabel: string;
  department: string | null;
  nameOf: (id: string | null) => string;
  onSelect?: (t: Task) => void;
}) {
  if (widget.kind === "status") {
    const tasks = statusTasks(scope, widget.status);
    const title = TASK_STATUS_META[widget.status].label;
    const meta = widget.status === "done" ? completedMeta : openMeta;
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
          meta={meta}
        />
      </div>
    );
  }

  if (widget.kind === "bucket") {
    const { completed, created } = bucketTasks(scope, widget.index);
    const title = scope.buckets[widget.index]?.label ?? widget.label;
    return (
      <div className="space-y-5 p-5 sm:p-6">
        <div className="space-y-1 pr-10">
          <SheetTitle className="truncate text-lg">{title}</SheetTitle>
          <SheetDescription className="truncate">
            {periodLabel}
            {department ? ` · ${department}` : ""}
          </SheetDescription>
        </div>
        <Tabs
          key={widget.index}
          defaultValue={defaultBucketTab(completed.length)}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="completed">
              Hoàn thành ({completed.length})
            </TabsTrigger>
            <TabsTrigger value="created">
              Mới giao ({created.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="completed">
            <TaskRows
              tasks={completed}
              nameOf={nameOf}
              onSelect={onSelect}
              meta={rateMeta}
            />
          </TabsContent>
          <TabsContent value="created">
            <TaskRows
              tasks={created}
              nameOf={nameOf}
              onSelect={onSelect}
              meta={createdMeta}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  const tasks = departmentTasks(scope, widget.department);
  const title = widget.department ?? "Chưa phân phòng";
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
      {tasks.length > 0 ? (
        <StatusGroupedTaskRows
          tasks={tasks}
          nameOf={nameOf}
          onSelect={onSelect}
          meta={statusAwareMeta}
        />
      ) : (
        <TaskRows
          tasks={tasks}
          nameOf={nameOf}
          onSelect={onSelect}
          meta={statusAwareMeta}
        />
      )}
    </div>
  );
}

export function WidgetSheet({
  widget,
  scope,
  periodLabel,
  department,
  nameOf,
  onSelect,
  onClose,
  children,
}: {
  widget: WidgetDrilldown | null;
  scope: Scope;
  periodLabel: string;
  department: string | null;
  nameOf: (id: string | null) => string;
  onSelect?: (t: Task) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet open={!!widget} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="overflow-y-auto sm:max-w-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {widget && (
          <WidgetSheetBody
            widget={widget}
            scope={scope}
            periodLabel={periodLabel}
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
