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

export default async function DashboardPage() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const weekEnd = new Date(Date.now() + 7 * 86400_000).toISOString();

  const head = { count: "exact" as const, head: true };

  const [total, inProgress, done, overdue, thisWeek] = await Promise.all([
    supabase.from("tasks").select("*", head),
    supabase.from("tasks").select("*", head).eq("status", "in_progress"),
    supabase.from("tasks").select("*", head).eq("status", "done"),
    supabase
      .from("tasks")
      .select("*", head)
      .neq("status", "done")
      .lt("due_date", nowIso),
    supabase
      .from("tasks")
      .select("*", head)
      .neq("status", "done")
      .gte("due_date", nowIso)
      .lte("due_date", weekEnd),
  ]);

  const totalN = total.count ?? 0;
  const doneN = done.count ?? 0;
  const completion = totalN > 0 ? Math.round((doneN / totalN) * 100) : 0;

  const widgets = [
    {
      label: "Tổng công việc",
      value: totalN,
      icon: ListTodo,
      tone: "text-slate-600 bg-slate-100",
    },
    {
      label: "Đang làm",
      value: inProgress.count ?? 0,
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
      value: overdue.count ?? 0,
      icon: AlertTriangle,
      tone: "text-red-600 bg-red-100",
    },
    {
      label: "Đến hạn tuần này",
      value: thisWeek.count ?? 0,
      icon: CalendarClock,
      tone: "text-amber-600 bg-amber-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Tổng quan tiến độ công việc của nhóm.
        </p>
      </div>

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

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Tỷ lệ hoàn thành</p>
            <span className="text-sm font-semibold">{completion}%</span>
          </div>
          <Progress
            value={completion}
            indicatorClassName="bg-emerald-500"
          />
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
