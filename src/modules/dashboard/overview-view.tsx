"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleCheckBig,
  Clock,
  ListPlus,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/format";
import type { PeriodMode } from "@/lib/period";
import {
  ChartLegend,
  DeptProgressBars,
  Sparkline,
  StackedBar,
  StatusDonut,
  ThroughputChart,
  type DeptRow,
  type DonutSegment,
} from "@/modules/dashboard/charts";
import {
  SERIES,
  STATUS_COLOR,
  isOnTime,
  isOverdue,
  pct,
  type PersonStats,
  type Scope,
} from "@/modules/dashboard/metrics";
import {
  PersonAvatar,
  PersonHoverCard,
  statusSegments,
} from "@/modules/dashboard/person";
import {
  DEPARTMENTS,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
} from "@/modules/tasks/constants";
import type { Task } from "@/types/database";

export const PREV_LABEL: Record<PeriodMode, string> = {
  week: "tuần trước",
  month: "tháng trước",
  quarter: "quý trước",
  year: "năm trước",
  all: "",
};

type Delta = { value: number; unit?: string; tone: "good" | "bad" | "neutral" };

function deltaOf(
  cur: number,
  prev: number | null | undefined,
  upIsGood: boolean | null,
  unit = "",
): Delta | null {
  if (prev === null || prev === undefined) return null;
  const d = cur - prev;
  return {
    value: d,
    unit,
    tone:
      upIsGood === null || d === 0
        ? "neutral"
        : d > 0 === upIsGood
          ? "good"
          : "bad",
  };
}

function StatTile({
  label,
  value,
  icon: Icon,
  iconTone,
  delta,
  prevLabel,
  sub,
  children,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  iconTone: string;
  delta?: Delta | null;
  prevLabel: string;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              iconTone,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          {delta && (
            <span
              className={cn(
                "inline-flex items-center text-xs font-medium",
                delta.tone === "good" &&
                  "text-emerald-600 dark:text-emerald-400",
                delta.tone === "bad" && "text-red-600 dark:text-red-400",
                delta.tone === "neutral" && "text-muted-foreground",
              )}
              title={`So với ${prevLabel}`}
            >
              {delta.value > 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : delta.value < 0 ? (
                <ArrowDownRight className="h-3.5 w-3.5" />
              ) : null}
              {delta.value > 0 ? "+" : ""}
              {delta.value}
              {delta.unit}
            </span>
          )}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        {children && <div className="mt-auto pt-1">{children}</div>}
      </CardContent>
    </Card>
  );
}

export function OverviewView({
  scope,
  people,
  mode,
  nameOf,
  onOpenPerson,
  onShowPeople,
}: {
  scope: Scope;
  people: PersonStats[];
  mode: PeriodMode;
  nameOf: (id: string | null) => string;
  onOpenPerson: (id: string) => void;
  onShowPeople: () => void;
}) {
  const prevLabel = PREV_LABEL[mode];
  const { rows, completed, open, overdue, series, buckets } = scope;
  const lateN = completed.filter((t) => !isOnTime(t)).length;

  const segments: DonutSegment[] = TASK_STATUS_ORDER.map((s) => ({
    key: s,
    label: TASK_STATUS_META[s].label,
    value: rows.filter((r) => r.status === s).length,
    color: STATUS_COLOR[s],
  }));

  const deptRows: DeptRow[] = [...DEPARTMENTS.map((d) => d.value), null]
    .map((key) => {
      const list = rows.filter((r) => (r.department ?? null) === key);
      return {
        label: key ?? "Chưa phân phòng",
        total: list.length,
        done: list.filter((r) => r.status === "done").length,
        overdue: list.filter((r) => isOverdue(r)).length,
        segments: TASK_STATUS_ORDER.map((s) => ({
          key: s,
          label: TASK_STATUS_META[s].label,
          value: list.filter((r) => r.status === s).length,
          color: STATUS_COLOR[s],
        })),
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  // Nhiều việc nhất lên trước — để nhìn ai đang gánh nhiều việc.
  const staff = [...people].sort(
    (a, b) => b.total - a.total || b.completed.length - a.completed.length,
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ------------------------------------------------ số liệu chính */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 [&>*]:min-w-0">
        <StatTile
          label="Hoàn thành trong kỳ"
          value={completed.length}
          icon={CircleCheckBig}
          iconTone="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
          delta={deltaOf(completed.length, scope.prevCompleted?.length, true)}
          prevLabel={prevLabel}
          sub={prevLabel && `so với ${prevLabel}`}
        >
          <Sparkline
            values={series.map((s) => s.onTime + s.late)}
            buckets={buckets}
            color={SERIES.onTime}
            unit="Việc xong"
          />
        </StatTile>
        <StatTile
          label="Tỷ lệ xong đúng hạn"
          value={completed.length ? `${scope.onTimeRate}%` : "—"}
          icon={Clock}
          iconTone="bg-sky-100 text-sky-600 dark:bg-sky-500/15"
          delta={
            completed.length
              ? deltaOf(scope.onTimeRate, scope.prevOnTimeRate, true, " điểm")
              : null
          }
          prevLabel={prevLabel}
          sub={`${lateN} việc xong trễ hạn`}
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${scope.onTimeRate}%` }}
            />
          </div>
        </StatTile>
        <StatTile
          label="Việc mới giao"
          value={scope.created.length}
          icon={ListPlus}
          iconTone="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15"
          delta={deltaOf(scope.created.length, scope.prevCreated?.length, null)}
          prevLabel={prevLabel}
          sub={prevLabel && `so với ${prevLabel}`}
        >
          <Sparkline
            values={series.map((s) => s.created)}
            buckets={buckets}
            color={SERIES.created}
            unit="Việc mới"
          />
        </StatTile>
        <StatTile
          label="Đang thực hiện"
          value={open.length}
          icon={Loader2}
          iconTone="bg-blue-100 text-blue-600 dark:bg-blue-500/15"
          prevLabel={prevLabel}
          sub={`Tiến độ trung bình ${scope.avgProgress}%`}
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-700"
              style={{ width: `${scope.avgProgress}%` }}
            />
          </div>
        </StatTile>
        <StatTile
          label="Quá hạn"
          value={overdue.length}
          icon={AlertTriangle}
          iconTone="bg-red-100 text-red-600 dark:bg-red-500/15"
          prevLabel={prevLabel}
          sub={`${pct(overdue.length, open.length)}% số việc đang mở`}
        >
          <div className="flex -space-x-1.5">
            {[...new Set(overdue.map((t) => t.assignee_id))]
              .slice(0, 5)
              .map((id) => {
                const p = people.find((x) => x.id === id);
                return p ? (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpenPerson(p.id)}
                    title={p.name}
                  >
                    <PersonAvatar
                      p={p}
                      className="h-7 w-7 text-[10px] ring-2 ring-card transition-transform hover:z-10 hover:scale-110"
                    />
                  </button>
                ) : null;
              })}
          </div>
        </StatTile>
      </div>

      {/* ------------------------------------------------ nhịp + trạng thái */}
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">Nhịp hoàn thành</p>
                <p className="text-xs text-muted-foreground">
                  Việc xong và việc mới giao theo từng{" "}
                  {mode === "week"
                    ? "ngày"
                    : mode === "year" || mode === "all"
                      ? "tháng"
                      : "tuần"}
                </p>
              </div>
              <ChartLegend
                items={[
                  { label: "Xong đúng hạn", color: SERIES.onTime },
                  { label: "Xong trễ hạn", color: SERIES.late },
                  {
                    label: "Việc mới giao",
                    color: SERIES.created,
                    kind: "line",
                  },
                ]}
              />
            </div>
            <ThroughputChart series={series} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="font-medium">Trạng thái công việc</p>
              <p className="text-xs text-muted-foreground">
                Rê vào từng phần để xem chi tiết
              </p>
            </div>
            <StatusDonut segments={segments} total={rows.length} />
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------ nhân viên / phòng / cần chú ý */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <p className="font-medium">Nhân viên</p>
              <button
                type="button"
                onClick={onShowPeople}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Tất cả nhân viên <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <ul className="max-h-[300px] space-y-0.5 overflow-y-auto">
                {staff.map((p) => (
                  <li key={p.id}>
                    <PersonHoverCard p={p} buckets={buckets}>
                      <button
                        type="button"
                        onClick={() => onOpenPerson(p.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/70"
                      >
                        <PersonAvatar p={p} className="h-8 w-8" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">
                              {p.name}
                            </p>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              <b className="text-foreground">
                                {p.byStatus.done}
                              </b>
                              /{p.total} xong
                            </span>
                          </div>
                          <StackedBar
                            segments={statusSegments(p)}
                            className="mt-1.5 h-1.5"
                          />
                        </div>
                        {p.overdue.length > 0 ? (
                          <span
                            className="inline-flex w-10 shrink-0 items-center justify-end gap-0.5 text-xs font-medium text-red-600"
                            title={`${p.overdue.length} việc quá hạn`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {p.overdue.length}
                          </span>
                        ) : (
                          <span className="w-10 shrink-0" />
                        )}
                      </button>
                    </PersonHoverCard>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="font-medium">Tiến độ theo phòng</p>
            <DeptProgressBars rows={deptRows} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardContent className="space-y-3 p-5">
            <p className="font-medium">Cần chú ý</p>
            <Tabs defaultValue="overdue">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="overdue"
                  className="px-1 text-xs sm:text-sm"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> Quá hạn (
                  {overdue.length})
                </TabsTrigger>
                <TabsTrigger value="soon" className="px-1 text-xs sm:text-sm">
                  <CalendarClock className="h-3.5 w-3.5" /> 7 ngày tới (
                  {scope.dueSoon.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overdue">
                <AttentionList
                  tasks={overdue}
                  nameOf={nameOf}
                  tone="text-red-600"
                  empty="Không có việc quá hạn 🎉"
                />
              </TabsContent>
              <TabsContent value="soon">
                <AttentionList
                  tasks={scope.dueSoon}
                  nameOf={nameOf}
                  tone="text-amber-600"
                  empty="Không có việc sắp đến hạn."
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AttentionList({
  tasks,
  nameOf,
  tone,
  empty,
}: {
  tasks: Task[];
  nameOf: (id: string | null) => string;
  tone: string;
  empty: string;
}) {
  if (tasks.length === 0)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
    );
  return (
    <ul className="max-h-[272px] divide-y overflow-y-auto">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link
            href={`/tasks?task=${t.id}`}
            className="flex items-center gap-3 rounded-md px-1 py-2 text-sm transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate">{t.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {nameOf(t.assignee_id) || "—"}
                {t.department && ` · ${t.department}`}
              </p>
            </div>
            <span className={cn("shrink-0 text-xs font-medium", tone)}>
              {dueLabel(t.due_date).text}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
