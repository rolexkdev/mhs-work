import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  max as maxDate,
  min as minDate,
  startOfMonth,
  subMonths,
  differenceInCalendarDays,
} from "date-fns";
import { vi } from "date-fns/locale";
import {
  type Period,
  isTaskInPeriod,
  periodRange,
  shiftPeriod,
} from "@/lib/period";
import type { Profile, Task, TaskStatus } from "@/types/database";

/** Màu trạng thái dùng cho biểu đồ (SVG/inline style cần mã màu). */
export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  blocked: "#f97316",
  review: "#f59e0b",
  done: "#10b981",
};

/** Màu series của biểu đồ nhịp hoàn thành. */
export const SERIES = {
  onTime: "#10b981",
  late: "#f59e0b",
  created: "#6366f1",
} as const;

export const UNASSIGNED = "__none__";

const MON = { weekStartsOn: 1 } as const;

// ---------------------------------------------------------------- task helpers

export function isOverdue(t: Task, now = Date.now()): boolean {
  return (
    t.status !== "done" && !!t.due_date && new Date(t.due_date).getTime() < now
  );
}

/** Mốc hoàn thành thực tế (null nếu chưa xong). */
export function completedDate(t: Task): Date | null {
  if (t.status !== "done") return null;
  return new Date(t.completed_at ?? t.updated_at);
}

/** Xong đúng hạn: không có hạn, hoặc xong trước hết ngày hạn. */
export function isOnTime(t: Task): boolean {
  const done = completedDate(t);
  if (!done || !t.due_date) return true;
  return done <= endOfDay(new Date(t.due_date));
}

/** Số ngày xử lý: từ ngày bắt đầu (hoặc ngày tạo) đến lúc xong. */
export function leadDays(t: Task): number | null {
  const done = completedDate(t);
  if (!done) return null;
  return Math.max(
    0,
    differenceInCalendarDays(done, new Date(t.start_date ?? t.created_at)),
  );
}

export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

// ---------------------------------------------------------------- time buckets

export type Bucket = { start: Date; end: Date; short: string; label: string };

/**
 * Chia kỳ thành các mốc để vẽ biểu đồ:
 * tuần → ngày, tháng/quý → tuần, năm → tháng, tất cả → 12 tháng gần nhất.
 */
export function periodBuckets(p: Period): Bucket[] {
  const { start, end } = periodRange(p);

  if (p.mode === "week" && start && end)
    return eachDayOfInterval({ start, end }).map((d) => ({
      start: d,
      end: endOfDay(d),
      short: format(d, "EEEEEE", { locale: vi }),
      label: format(d, "EEEE, dd/MM", { locale: vi }),
    }));

  if ((p.mode === "month" || p.mode === "quarter") && start && end)
    return eachWeekOfInterval({ start, end }, MON).map((w) => {
      const s = maxDate([w, start]);
      const e = minDate([endOfWeek(w, MON), end]);
      return {
        start: s,
        end: e,
        short: format(s, "dd/MM"),
        label: `Tuần ${format(s, "dd/MM")} – ${format(e, "dd/MM")}`,
      };
    });

  const s = start ?? startOfMonth(subMonths(new Date(), 11));
  const e = end ?? endOfMonth(new Date());
  return eachMonthOfInterval({ start: s, end: e }).map((m) => ({
    start: m,
    end: endOfMonth(m),
    short: `T${format(m, "M")}`,
    label: format(m, "'Tháng' M/yyyy"),
  }));
}

export function bucketIndex(d: Date, buckets: Bucket[]): number {
  return buckets.findIndex((b) => d >= b.start && d <= b.end);
}

function inRange(d: Date | null, start: Date | null, end: Date | null) {
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

// ---------------------------------------------------------------- scope metrics

export type SeriesPoint = {
  bucket: Bucket;
  onTime: number;
  late: number;
  created: number;
};

export type Scope = {
  /** Việc thuộc kỳ (đang mở trong kỳ, hoặc xong trong/sau kỳ). */
  rows: Task[];
  /** Việc hoàn thành trong kỳ. */
  completed: Task[];
  /** Việc hoàn thành ở kỳ liền trước (null khi xem "Tất cả"). */
  prevCompleted: Task[] | null;
  prevOnTimeRate: number | null;
  created: Task[];
  prevCreated: Task[] | null;
  open: Task[];
  overdue: Task[];
  dueSoon: Task[];
  onTimeRate: number;
  avgProgress: number;
  avgLeadDays: number | null;
  buckets: Bucket[];
  series: SeriesPoint[];
};

export function computeScope(tasks: Task[], period: Period): Scope {
  const now = Date.now();
  const { start, end } = periodRange(period);
  const rows = tasks.filter((t) => isTaskInPeriod(t, period));

  const completed = tasks.filter((t) => inRange(completedDate(t), start, end));
  const created = tasks.filter((t) =>
    inRange(new Date(t.created_at), start, end),
  );

  let prevCompleted: Task[] | null = null;
  let prevCreated: Task[] | null = null;
  if (period.mode !== "all") {
    const prev = periodRange(shiftPeriod(period, -1));
    prevCompleted = tasks.filter((t) =>
      inRange(completedDate(t), prev.start, prev.end),
    );
    prevCreated = tasks.filter((t) =>
      inRange(new Date(t.created_at), prev.start, prev.end),
    );
  }

  const open = rows.filter((t) => t.status !== "done");
  const overdue = open
    .filter((t) => isOverdue(t, now))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const dueSoon = open
    .filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date).getTime();
      return d >= now && d <= now + 7 * 86400_000;
    })
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));

  const leads = completed.map(leadDays).filter((n): n is number => n !== null);

  const buckets = periodBuckets(period);
  const series: SeriesPoint[] = buckets.map((bucket) => ({
    bucket,
    onTime: 0,
    late: 0,
    created: 0,
  }));
  for (const t of completed) {
    const i = bucketIndex(completedDate(t)!, buckets);
    if (i >= 0) series[i][isOnTime(t) ? "onTime" : "late"]++;
  }
  for (const t of created) {
    const i = bucketIndex(new Date(t.created_at), buckets);
    if (i >= 0) series[i].created++;
  }

  return {
    rows,
    completed,
    prevCompleted,
    prevOnTimeRate:
      prevCompleted && prevCompleted.length
        ? pct(prevCompleted.filter(isOnTime).length, prevCompleted.length)
        : null,
    created,
    prevCreated,
    open,
    overdue,
    dueSoon,
    onTimeRate: pct(completed.filter(isOnTime).length, completed.length),
    avgProgress: open.length
      ? Math.round(
          open.reduce((s, t) => s + (t.manual_progress || t.progress || 0), 0) /
            open.length,
        )
      : 0,
    avgLeadDays: leads.length
      ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length)
      : null,
    buckets,
    series,
  };
}

// ---------------------------------------------------------------- per person stats

export type PersonStats = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  rows: Task[];
  open: Task[];
  completed: Task[];
  overdue: Task[];
  byStatus: Record<TaskStatus, number>;
  total: number;
  completionRate: number;
  onTimeRate: number | null;
  avgProgress: number | null;
  avgLeadDays: number | null;
  /** Số việc xong theo từng mốc thời gian của kỳ. */
  trend: number[];
};

export function personStats(scope: Scope, profiles: Profile[]): PersonStats[] {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const keyOf = (t: Task) => t.assignee_id ?? UNASSIGNED;

  const ids = new Set([...scope.rows, ...scope.completed].map(keyOf));
  const now = Date.now();

  return [...ids].map((id) => {
    const p = profileById.get(id);
    const rows = scope.rows.filter((t) => keyOf(t) === id);
    const completed = scope.completed.filter((t) => keyOf(t) === id);
    const open = rows.filter((t) => t.status !== "done");
    const overdue = open.filter((t) => isOverdue(t, now));

    const byStatus: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      review: 0,
      done: 0,
    };
    for (const t of rows) byStatus[t.status]++;

    const completionRate = pct(byStatus.done, rows.length);
    const onTimeRate = completed.length
      ? pct(completed.filter(isOnTime).length, completed.length)
      : null;
    const avgProgress = open.length
      ? Math.round(
          open.reduce((s, t) => s + (t.manual_progress || t.progress || 0), 0) /
            open.length,
        )
      : null;
    const leads = completed
      .map(leadDays)
      .filter((n): n is number => n !== null);

    const trend = scope.buckets.map(() => 0);
    for (const t of completed) {
      const i = bucketIndex(completedDate(t)!, scope.buckets);
      if (i >= 0) trend[i]++;
    }

    return {
      id,
      name:
        id === UNASSIGNED
          ? "Chưa giao"
          : p?.full_name || p?.email || "Không rõ",
      email: p?.email ?? null,
      avatarUrl: p?.avatar_url ?? null,
      rows,
      open,
      completed,
      overdue,
      byStatus,
      total: rows.length,
      completionRate,
      onTimeRate,
      avgProgress,
      avgLeadDays: leads.length
        ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length)
        : null,
      trend,
    };
  });
}
