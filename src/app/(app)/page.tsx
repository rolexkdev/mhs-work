import { Suspense } from "react";
import Link from "next/link";
import {
  ListTodo,
  Loader2,
  CircleCheck,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusDonut,
  DeptProgressBars,
  type DonutSegment,
  type DeptRow,
} from "@/modules/dashboard/charts";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  DEPARTMENTS,
} from "@/modules/tasks/constants";
import type { TaskStatus } from "@/types/database";

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  blocked: "#f97316",
  review: "#f59e0b",
  done: "#10b981",
};

type Row = {
  status: TaskStatus;
  department: string | null;
  due_date: string | null;
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Tổng quan tiến độ công việc của nhóm.
        </p>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const supabase = await createClient();
  const now = Date.now();
  const weekEnd = now + 7 * 86400_000;

  const { data } = await supabase
    .from("tasks")
    .select("status, department, due_date");
  const rows = (data ?? []) as Row[];

  // ----- Tổng hợp -----
  const totalN = rows.length;
  const byStatus = (s: TaskStatus) => rows.filter((r) => r.status === s).length;
  const doneN = byStatus("done");
  const inProgressN = byStatus("in_progress");
  const completion = totalN > 0 ? Math.round((doneN / totalN) * 100) : 0;

  const overdueN = rows.filter(
    (r) =>
      r.status !== "done" && r.due_date && new Date(r.due_date).getTime() < now,
  ).length;
  const thisWeekN = rows.filter((r) => {
    if (r.status === "done" || !r.due_date) return false;
    const t = new Date(r.due_date).getTime();
    return t >= now && t <= weekEnd;
  }).length;

  const segments: DonutSegment[] = TASK_STATUS_ORDER.map((s) => ({
    label: TASK_STATUS_META[s].label,
    value: byStatus(s),
    color: STATUS_COLOR[s],
  }));

  // ----- Theo phòng/nhóm -----
  const deptOrder = [...DEPARTMENTS.map((d) => d.value), "__none__"];
  const deptRows: DeptRow[] = deptOrder
    .map((key) => {
      const list =
        key === "__none__"
          ? rows.filter((r) => !r.department)
          : rows.filter((r) => r.department === key);
      return {
        label: key === "__none__" ? "Chưa phân phòng" : key,
        total: list.length,
        done: list.filter((r) => r.status === "done").length,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const widgets = [
    {
      label: "Tổng công việc",
      value: totalN,
      icon: ListTodo,
      tone: "text-slate-600 bg-slate-100",
    },
    {
      label: "Đang làm",
      value: inProgressN,
      icon: Loader2,
      tone: "text-blue-600 bg-blue-100",
    },
    {
      label: "Hoàn thành",
      value: doneN,
      icon: CircleCheck,
      tone: "text-emerald-600 bg-emerald-100",
    },
    {
      label: "Quá hạn",
      value: overdueN,
      icon: AlertTriangle,
      tone: "text-red-600 bg-red-100",
    },
    {
      label: "Đến hạn tuần này",
      value: thisWeekN,
      icon: CalendarClock,
      tone: "text-amber-600 bg-amber-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {widgets.map((w) => (
          <Card key={w.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${w.tone}`}
              >
                <w.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-tight">
                  {w.value}
                </p>
                <p className="text-xs text-muted-foreground">{w.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Phân bố trạng thái */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <p className="text-sm font-medium">Phân bố theo trạng thái</p>
            <StatusDonut segments={segments} total={totalN} />
          </CardContent>
        </Card>

        {/* Tiến độ theo phòng */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <p className="text-sm font-medium">Tiến độ hoàn thành theo phòng</p>
            <DeptProgressBars rows={deptRows} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Tỷ lệ hoàn thành chung</p>
            <span className="text-sm font-semibold">{completion}%</span>
          </div>
          <Progress value={completion} indicatorClassName="bg-emerald-500" />
          <p className="text-xs text-muted-foreground">
            {doneN}/{totalN} công việc đã hoàn thành.{" "}
            <Link href="/tasks" className="text-primary hover:underline">
              Xem tất cả →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
