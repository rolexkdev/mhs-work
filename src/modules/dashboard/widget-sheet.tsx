"use client";

import type { ReactNode } from "react";
import { BarChart3, Building2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
import {
  DEPARTMENTS,
  TAG_ACCENT_CLASS,
  colorOf,
  statusLabelPlain,
} from "@/modules/tasks/constants";
import {
  DepartmentTaskGroups,
  STATUS_BADGE,
  TaskSheetHeading,
} from "@/modules/tasks/components/department-task-groups";
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
  const description = `${periodLabel}${department ? ` · ${department}` : ""}`;

  if (widget.kind === "status") {
    const tasks = statusTasks(scope, widget.status);
    const title = statusLabelPlain(widget.status);
    const meta = widget.status === "done" ? completedMeta : openMeta;
    return (
      <div className="space-y-5 p-5 sm:p-6">
        <TaskSheetHeading
          icon={STATUS_BADGE[widget.status].icon}
          badge={STATUS_BADGE[widget.status].badge}
          title={`${title} (${tasks.length})`}
          description={description}
        />
        <DepartmentTaskGroups
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
        <TaskSheetHeading
          icon={BarChart3}
          badge="bg-indigo-500 text-white"
          title={title}
          description={description}
        />
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
          <TabsContent value="completed" className="mt-4">
            <DepartmentTaskGroups
              tasks={completed}
              nameOf={nameOf}
              onSelect={onSelect}
              meta={rateMeta}
            />
          </TabsContent>
          <TabsContent value="created" className="mt-4">
            <DepartmentTaskGroups
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
  // One department: keep the status grouping, badge in the department color.
  const deptAccent =
    TAG_ACCENT_CLASS[
      widget.department ? colorOf(DEPARTMENTS, widget.department) : "gray"
    ];
  return (
    <div className="space-y-5 p-5 sm:p-6">
      <TaskSheetHeading
        icon={Building2}
        badge={deptAccent.header}
        title={`${title} (${tasks.length})`}
        description={description}
      />
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
