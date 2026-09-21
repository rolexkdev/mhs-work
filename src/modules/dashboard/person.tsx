"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Timer, Target } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { dueLabel, formatDate, initials } from "@/lib/format";
import {
  ChartLegend,
  PercentRing,
  Sparkline,
  StackedBar,
  ThroughputChart,
  type DonutSegment,
} from "@/modules/dashboard/charts";
import {
  SERIES,
  STATUS_COLOR,
  UNASSIGNED,
  bucketIndex,
  completedDate,
  isOnTime,
  isOverdue,
  type Bucket,
  type PersonStats,
  type SeriesPoint,
} from "@/modules/dashboard/metrics";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/modules/tasks/constants";
import type { Task } from "@/types/database";

export function statusSegments(p: PersonStats): DonutSegment[] {
  return TASK_STATUS_ORDER.map((s) => ({
    key: s,
    label: TASK_STATUS_META[s].label,
    value: p.byStatus[s],
    color: STATUS_COLOR[s],
  }));
}

export function PersonAvatar({
  p,
  className,
}: {
  p: Pick<PersonStats, "id" | "name" | "avatarUrl">;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.name} />}
      <AvatarFallback className="bg-secondary text-[0.7em] font-semibold text-secondary-foreground">
        {p.id === UNASSIGNED ? "?" : initials(p.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <p className={cn("text-sm font-semibold tabular-nums", tone)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Rê chuột vào nhân viên → thẻ tóm tắt số liệu, việc quá hạn, việc vừa xong. */
export function PersonHoverCard({
  p,
  buckets,
  children,
}: {
  p: PersonStats;
  buckets: Bucket[];
  children: ReactNode;
}) {
  const recent = [...p.completed]
    .sort((a, b) => completedDate(b)!.getTime() - completedDate(a)!.getTime())
    .slice(0, 3);

  return (
    <HoverCard openDelay={250} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-80 space-y-3">
        <div className="flex items-center gap-3">
          <PersonAvatar p={p} className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{p.name}</p>
            {p.email && (
              <p className="truncate text-xs text-muted-foreground">
                {p.email}
              </p>
            )}
          </div>
          <PercentRing
            value={p.completionRate}
            size={44}
            className="[&_span]:text-[10px]"
          />
        </div>

        <div className="grid grid-cols-4 gap-1.5 text-center">
          <MiniStat label="Tổng việc" value={p.total} />
          <MiniStat
            label="Xong kỳ"
            value={p.completed.length}
            tone="text-emerald-600"
          />
          <MiniStat
            label="Đúng hạn"
            value={p.onTimeRate === null ? "—" : `${p.onTimeRate}%`}
          />
          <MiniStat
            label="Quá hạn"
            value={p.overdue.length}
            tone={p.overdue.length ? "text-red-600" : "text-muted-foreground"}
          />
        </div>

        <StackedBar segments={statusSegments(p)} />

        {p.trend.some((v) => v > 0) && (
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">
              Nhịp hoàn thành
            </p>
            <Sparkline
              values={p.trend}
              buckets={buckets}
              color={SERIES.onTime}
              unit="Việc xong"
            />
          </div>
        )}

        {p.overdue.length > 0 && (
          <TaskMiniList
            title="Quá hạn"
            tone="text-red-600"
            tasks={p.overdue.slice(0, 3)}
            right={(t) => dueLabel(t.due_date).text}
          />
        )}
        {recent.length > 0 && (
          <TaskMiniList
            title="Vừa hoàn thành"
            tone="text-emerald-600"
            tasks={recent}
            right={(t) => formatDate(completedDate(t)!.toISOString())}
          />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function TaskMiniList({
  title,
  tone,
  tasks,
  right,
}: {
  title: string;
  tone: string;
  tasks: Task[];
  right: (t: Task) => string;
}) {
  return (
    <div>
      <p className={cn("mb-1 text-[11px] font-medium", tone)}>{title}</p>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <span className="shrink-0 text-muted-foreground">{right(t)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Sheet chi tiết

export function PersonSheet({
  p,
  buckets,
  onClose,
}: {
  p: PersonStats | null;
  buckets: Bucket[];
  onClose: () => void;
}) {
  return (
    <Sheet open={!!p} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="overflow-y-auto sm:max-w-2xl"
        // Không tự focus vào cột biểu đồ đầu tiên (sẽ bật tooltip ngay khi mở)
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {p && <PersonDetail p={p} buckets={buckets} />}
      </SheetContent>
    </Sheet>
  );
}

function PersonDetail({ p, buckets }: { p: PersonStats; buckets: Bucket[] }) {
  const series = useMemo<SeriesPoint[]>(() => {
    const s = buckets.map((bucket) => ({
      bucket,
      onTime: 0,
      late: 0,
      created: 0,
    }));
    for (const t of p.completed) {
      const i = bucketIndex(completedDate(t)!, buckets);
      if (i >= 0) s[i][isOnTime(t) ? "onTime" : "late"]++;
    }
    return s;
  }, [p, buckets]);

  const tiles = [
    {
      icon: Target,
      label: "Tỷ lệ hoàn thành",
      value: `${p.completionRate}%`,
      sub: `${p.byStatus.done}/${p.total} việc`,
    },
    {
      icon: CheckCircle2,
      label: "Xong đúng hạn",
      value: p.onTimeRate === null ? "—" : `${p.onTimeRate}%`,
      sub: `${p.completed.length} việc xong trong kỳ`,
    },
    {
      icon: Timer,
      label: "Xử lý TB",
      value: p.avgLeadDays === null ? "—" : `${p.avgLeadDays} ngày`,
      sub: "bắt đầu → hoàn thành",
    },
    {
      icon: AlertTriangle,
      label: "Quá hạn",
      value: p.overdue.length,
      sub: `trên ${p.open.length} việc đang mở`,
    },
  ];

  const done = [...p.completed].sort(
    (a, b) => completedDate(b)!.getTime() - completedDate(a)!.getTime(),
  );

  return (
    <div className="space-y-6 p-5 sm:p-6">
      <div className="flex items-center gap-4 pr-10">
        <PersonAvatar p={p} className="h-14 w-14 text-base" />
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-lg">{p.name}</SheetTitle>
          <SheetDescription className="truncate">
            {p.email ?? "—"}
          </SheetDescription>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </div>
            <p className="mt-1 text-xl font-semibold">{t.value}</p>
            <p className="text-[11px] text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Cơ cấu công việc</p>
        <StackedBar segments={statusSegments(p)} className="h-3" />
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {statusSegments(p)
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.key}
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                {s.label} <b className="text-foreground">{s.value}</b>
              </span>
            ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Nhịp hoàn thành trong kỳ</p>
          <ChartLegend
            items={[
              { label: "Đúng hạn", color: SERIES.onTime },
              { label: "Trễ hạn", color: SERIES.late },
            ]}
          />
        </div>
        <ThroughputChart series={series} showCreated={false} height={170} />
      </div>

      <Tabs defaultValue={p.overdue.length ? "overdue" : "open"}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="open">Đang mở ({p.open.length})</TabsTrigger>
          <TabsTrigger value="overdue">
            Quá hạn ({p.overdue.length})
          </TabsTrigger>
          <TabsTrigger value="done">Đã xong ({done.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open">
          <TaskRows tasks={p.open} />
        </TabsContent>
        <TabsContent value="overdue">
          <TaskRows tasks={p.overdue} />
        </TabsContent>
        <TabsContent value="done">
          <TaskRows tasks={done} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function TaskRows({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Không có việc nào.
      </p>
    );
  return (
    <ul className="divide-y rounded-xl border">
      {tasks.map((t) => {
        const doneAt = completedDate(t);
        const late = isOverdue(t);
        const progress = t.manual_progress || t.progress || 0;
        return (
          <li key={t.id}>
            <Link
              href={`/tasks?task=${t.id}`}
              className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  TASK_STATUS_META[t.status].dot,
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate">{t.title}</p>
                {t.department && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t.department}
                  </p>
                )}
              </div>
              {!doneAt && (
                <div className="hidden w-16 sm:block">
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-right text-[10px] tabular-nums text-muted-foreground">
                    {progress}%
                  </p>
                </div>
              )}
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap text-right text-xs",
                  late ? "font-medium text-red-600" : "text-muted-foreground",
                  doneAt && !isOnTime(t) && "text-amber-600",
                )}
              >
                {doneAt
                  ? formatDate(doneAt.toISOString())
                  : dueLabel(t.due_date).text}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
