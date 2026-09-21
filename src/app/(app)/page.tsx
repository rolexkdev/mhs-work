"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleCheckBig, LayoutDashboard, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodPicker } from "@/components/period-picker";
import { type Period, periodLabel } from "@/lib/period";
import { useTasks } from "@/modules/tasks/hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { DEPARTMENTS } from "@/modules/tasks/constants";
import {
  UNASSIGNED,
  computeScope,
  personStats,
} from "@/modules/dashboard/metrics";
import { OverviewView } from "@/modules/dashboard/overview-view";
import { PeopleView } from "@/modules/dashboard/people-view";
import { CompletedView } from "@/modules/dashboard/completed-view";
import { PersonSheet } from "@/modules/dashboard/person";

type View = "overview" | "people" | "completed";
const VIEWS: { value: View; label: string; icon: typeof Users }[] = [
  { value: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { value: "people", label: "Nhân viên", icon: Users },
  { value: "completed", label: "Hoàn thành", icon: CircleCheckBig },
];
const VIEW_KEY = "dashboard:view";
const ALL = "__all__";

export default function DashboardPage() {
  // Dashboard mặc định xem theo quý hiện tại.
  const [period, setPeriod] = useState<Period>(() => ({
    mode: "quarter",
    anchor: new Date().toISOString(),
  }));
  const [dept, setDept] = useState<string>(ALL);
  const [view, setView] = useState<View>("overview");
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const { data: allTasks = [], isLoading } = useTasks();
  const { data: profiles = [] } = useProfiles();

  // Nhớ tab xem lần trước — sếp hay mở lại đúng tab quen dùng.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY) as View | null;
      if (saved && VIEWS.some((v) => v.value === saved)) setView(saved);
    } catch {}
  }, []);
  const changeView = (v: string) => {
    setView(v as View);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const tasks = useMemo(
    () =>
      dept === ALL
        ? allTasks
        : allTasks.filter((t) => (t.department ?? "") === dept),
    [allTasks, dept],
  );
  const scope = useMemo(() => computeScope(tasks, period), [tasks, period]);
  // Số liệu theo nhân viên — việc chưa giao không tính cho ai.
  const people = useMemo(
    () => personStats(scope, profiles).filter((p) => p.id !== UNASSIGNED),
    [scope, profiles],
  );
  const staff = useMemo(
    () => profiles.filter((p) => p.role !== "admin"),
    [profiles],
  );

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));
    return (id: string | null) => (id ? (m.get(id) ?? "") : "Chưa giao");
  }, [profiles]);

  const selected = people.find((p) => p.id === openPerson) ?? null;

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="hidden sm:block">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Tiến độ công việc của nhóm · {periodLabel(period)}
            {dept !== ALL && ` · ${dept}`}
          </p>
        </div>
        {/* Một hàng bộ lọc duy nhất, áp cho mọi tab bên dưới */}
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 w-full text-xs sm:h-8 sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả phòng/nhóm</SelectItem>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>

      <Tabs value={view} onValueChange={changeView}>
        <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:w-auto">
          {VIEWS.map((v) => (
            <TabsTrigger
              key={v.value}
              value={v.value}
              className="py-1.5 sm:px-4"
            >
              <v.icon className="hidden h-4 w-4 sm:block" />
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <div
          key={view}
          className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
        >
          {view === "overview" ? (
            <OverviewView
              scope={scope}
              people={people}
              mode={period.mode}
              nameOf={nameOf}
              onOpenPerson={setOpenPerson}
              onShowPeople={() => changeView("people")}
            />
          ) : view === "people" ? (
            <PeopleView
              scope={scope}
              people={people}
              profiles={staff}
              onOpenPerson={setOpenPerson}
            />
          ) : (
            <CompletedView
              tasks={tasks}
              scope={scope}
              people={people}
              period={period}
              onPeriodChange={setPeriod}
              nameOf={nameOf}
            />
          )}
        </div>
      )}

      <PersonSheet
        p={selected}
        buckets={scope.buckets}
        onClose={() => setOpenPerson(null)}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 w-full rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
