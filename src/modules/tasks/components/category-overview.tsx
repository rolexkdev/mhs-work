"use client";

import { useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Eye,
  ListTodo,
  Loader,
  PauseCircle,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DepartmentTaskGroups,
  TaskSheetHeading,
  groupByDepartment,
} from "@/modules/tasks/components/department-task-groups";
import {
  DEPARTMENTS,
  TAG_ACCENT_CLASS,
  TASK_DEPARTMENTS,
  TASK_STATUS_ORDER,
  categoryColor,
  colorOf,
  type TagColor,
} from "@/modules/tasks/constants";
import { NO_DEPARTMENT } from "@/modules/tasks/hooks";
import type { Task, TaskCategory, TaskStatus } from "@/types/database";

/** URL value of the "Chưa phân hạng mục" bucket of a department. */
export function uncategorizedKey(department: string | null): string {
  return `none:${department ?? NO_DEPARTMENT}`;
}

/** Department of an uncategorized key, or undefined for a category id. */
export function uncategorizedDepartment(
  key: string,
): string | null | undefined {
  if (!key.startsWith("none:")) return undefined;
  const dept = key.slice("none:".length);
  return dept === NO_DEPARTMENT ? null : dept;
}

/** Tasks of a category key (category id or uncategorizedKey). */
export function tasksOfCategoryKey(tasks: Task[], key: string): Task[] {
  const dept = uncategorizedDepartment(key);
  if (dept === undefined) return tasks.filter((t) => t.category_id === key);
  return tasks.filter(
    (t) => !t.category_id && (t.department ?? null) === dept,
  );
}

export function isOverdue(t: Task): boolean {
  return dueLabel(t.due_date, { done: t.status === "done" }).tone === "overdue";
}

const SHORT_STATUS: Record<TaskStatus, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  blocked: "Tạm dừng",
  review: "Chờ duyệt",
  done: "Xong",
};

type Stats = {
  total: number;
  overdue: number;
  byStatus: Record<TaskStatus, number>;
};

function statsOf(tasks: Task[]): Stats {
  const byStatus = { todo: 0, in_progress: 0, blocked: 0, review: 0, done: 0 };
  let overdue = 0;
  for (const t of tasks) {
    byStatus[t.status] += 1;
    if (isOverdue(t)) overdue += 1;
  }
  return { total: tasks.length, overdue, byStatus };
}

type Card = {
  key: string;
  name: string;
  stats: Stats;
  /** Category color; undefined for the uncategorized bucket. */
  color?: TagColor;
  uncategorized?: boolean;
};

type Section = {
  /** null = tasks with no department. */
  department: string | null;
  stats: Stats;
  cards: Card[];
};

function buildSections(
  tasks: Task[],
  categories: TaskCategory[],
  departmentFilter: string | null,
): Section[] {
  const byDept = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const k = t.department ?? null;
    byDept.set(k, [...(byDept.get(k) ?? []), t]);
  }

  // Task departments first, then legacy ones that still have tasks.
  const order: (string | null)[] = TASK_DEPARTMENTS.map((d) => d.value);
  for (const k of byDept.keys()) if (k && !order.includes(k)) order.push(k);
  order.push(null);

  const wanted =
    departmentFilter === null
      ? order
      : [departmentFilter === NO_DEPARTMENT ? null : departmentFilter];

  const sections: Section[] = [];
  for (const department of wanted) {
    const deptTasks = byDept.get(department) ?? [];
    const deptCategories = department
      ? categories.filter((c) => c.department === department)
      : [];
    const showEmpty = departmentFilter !== null;
    if (!deptTasks.length && !deptCategories.length && !showEmpty) continue;

    const known = new Set(deptCategories.map((c) => c.id));
    const cards: Card[] = deptCategories.map((c) => ({
      key: c.id,
      name: c.name,
      color: categoryColor(c),
      stats: statsOf(deptTasks.filter((t) => t.category_id === c.id)),
    }));
    // category_id outside this department should not happen (DB trigger),
    // but count such tasks as uncategorized rather than lose them.
    const rest = deptTasks.filter(
      (t) => !t.category_id || !known.has(t.category_id),
    );
    if (rest.length) {
      cards.push({
        key: uncategorizedKey(department),
        name: "Chưa phân hạng mục",
        stats: statsOf(rest),
        uncategorized: true,
      });
    }
    sections.push({ department, stats: statsOf(deptTasks), cards });
  }
  return sections;
}

export function CategoryOverview({
  tasks,
  categories,
  departmentFilter,
  onOpenCategory,
  canManage,
  onManage,
  nameOf,
  onOpenTask,
}: {
  /** Tasks after the period / status / assignee filters. */
  tasks: Task[];
  categories: TaskCategory[];
  /** null = all departments; NO_DEPARTMENT = tasks without one. */
  departmentFilter: string | null;
  onOpenCategory: (key: string) => void;
  canManage: boolean;
  onManage: (department: string | null) => void;
  nameOf: (id: string | null) => string;
  onOpenTask: (t: Task) => void;
}) {
  const [openStat, setOpenStat] = useState<StatKey | null>(null);
  const sections = useMemo(
    () => buildSections(tasks, categories, departmentFilter),
    [tasks, categories, departmentFilter],
  );
  const total = useMemo(() => statsOf(tasks), [tasks]);

  return (
    <div className="space-y-6">
      <SummaryStrip stats={total} onOpen={setOpenStat} />
      <StatSheet
        stat={openStat}
        tasks={tasks}
        nameOf={nameOf}
        onClose={() => setOpenStat(null)}
        onOpenTask={(t) => {
          // Close first: a second sheet on top would dismiss this one anyway.
          setOpenStat(null);
          onOpenTask(t);
        }}
      />

      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Chưa có hạng mục hay công việc nào.
        </div>
      )}

      {sections.map((s) => (
        <DepartmentSection
          key={s.department ?? NO_DEPARTMENT}
          section={s}
          canManage={canManage}
          onManage={onManage}
          onOpenCategory={onOpenCategory}
        />
      ))}
    </div>
  );
}

function DepartmentSection({
  section: s,
  canManage,
  onManage,
  onOpenCategory,
}: {
  section: Section;
  canManage: boolean;
  onManage: (department: string | null) => void;
  onOpenCategory: (key: string) => void;
}) {
  const color: TagColor = s.department
    ? colorOf(DEPARTMENTS, s.department)
    : "gray";
  const accent = TAG_ACCENT_CLASS[color];
  const categoryCount = s.cards.filter((c) => !c.uncategorized).length;
  const pct = percentDone(s.stats);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border-2 shadow-sm",
        accent.frame,
        accent.body,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5",
          accent.header,
        )}
      >
        <h2 className="text-lg font-bold tracking-tight">
          {s.department ?? "Chưa phân phòng"}
        </h2>
        <span className="text-sm opacity-90">
          {categoryCount} hạng mục · {s.stats.total} việc
          {s.stats.total > 0 && <> · xong {pct}%</>}
        </span>
        {s.stats.overdue > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {s.stats.overdue} trễ hạn
          </span>
        )}
        {canManage && s.department && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 bg-white/15 px-2 text-xs text-inherit hover:bg-white/30 hover:text-inherit"
            onClick={() => onManage(s.department)}
          >
            <Settings2 className="h-3.5 w-3.5" /> Hạng mục
          </Button>
        )}
      </div>

      <div className="p-3">
        {s.cards.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card/70 py-6 text-center text-sm text-muted-foreground">
            Phòng/nhóm này chưa có hạng mục nào.
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {s.cards.map((c) => (
              <CategoryCard
                key={c.key}
                card={c}
                onOpen={() => onOpenCategory(c.key)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function percentDone(stats: Stats): number {
  return stats.total ? Math.round((stats.byStatus.done / stats.total) * 100) : 0;
}

type StatKey = "total" | TaskStatus | "overdue";

type StatStyle = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Tile background, border and hover. */
  tile: string;
  /** Icon badge. */
  badge: string;
  /** Number color. */
  value: string;
};

// Literal class names so Tailwind can see them.
const STAT_STYLE: Record<StatKey, StatStyle> = {
  total: {
    label: "Tổng việc",
    icon: ListTodo,
    tile: "border-primary/30 bg-primary/5 hover:border-primary/60",
    badge: "bg-primary text-primary-foreground",
    value: "text-primary",
  },
  todo: {
    label: SHORT_STATUS.todo,
    icon: Circle,
    tile: "border-slate-200 bg-slate-50 hover:border-slate-400",
    badge: "bg-slate-500 text-white",
    value: "text-slate-700",
  },
  in_progress: {
    label: SHORT_STATUS.in_progress,
    icon: Loader,
    tile: "border-blue-200 bg-blue-50 hover:border-blue-400",
    badge: "bg-blue-500 text-white",
    value: "text-blue-700",
  },
  blocked: {
    label: SHORT_STATUS.blocked,
    icon: PauseCircle,
    tile: "border-orange-200 bg-orange-50 hover:border-orange-400",
    badge: "bg-orange-500 text-white",
    value: "text-orange-700",
  },
  review: {
    label: SHORT_STATUS.review,
    icon: Eye,
    tile: "border-amber-200 bg-amber-50 hover:border-amber-400",
    badge: "bg-amber-500 text-white",
    value: "text-amber-700",
  },
  done: {
    label: SHORT_STATUS.done,
    icon: CheckCircle2,
    tile: "border-emerald-200 bg-emerald-50 hover:border-emerald-400",
    badge: "bg-emerald-500 text-white",
    value: "text-emerald-700",
  },
  overdue: {
    label: "Trễ hạn",
    icon: AlertTriangle,
    tile: "border-red-200 bg-red-50 hover:border-red-400",
    badge: "bg-red-500 text-white",
    value: "text-red-600",
  },
};

const STAT_ORDER: StatKey[] = ["total", ...TASK_STATUS_ORDER, "overdue"];

function statValue(stats: Stats, key: StatKey): number {
  if (key === "total") return stats.total;
  if (key === "overdue") return stats.overdue;
  return stats.byStatus[key];
}

function statTasks(tasks: Task[], key: StatKey): Task[] {
  if (key === "total") return tasks;
  if (key === "overdue") return tasks.filter(isOverdue);
  return tasks.filter((t) => t.status === key);
}

function SummaryStrip({
  stats,
  onOpen,
}: {
  stats: Stats;
  onOpen: (key: StatKey) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {STAT_ORDER.map((key) => {
        const style = STAT_STYLE[key];
        const Icon = style.icon;
        const value = statValue(stats, key);
        const share =
          key !== "total" && stats.total
            ? Math.round((value / stats.total) * 100)
            : null;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onOpen(key)}
            disabled={value === 0}
            className={cn(
              "group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition",
              "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-60 disabled:shadow-none",
              style.tile,
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm",
                style.badge,
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-muted-foreground">
                {style.label}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-2xl font-bold leading-tight tabular-nums",
                    style.value,
                  )}
                >
                  {value}
                </span>
                {share !== null && value > 0 && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {share}%
                  </span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Right-hand sheet listing the tasks behind a summary tile, by department. */
function StatSheet({
  stat,
  tasks,
  nameOf,
  onClose,
  onOpenTask,
}: {
  stat: StatKey | null;
  tasks: Task[];
  nameOf: (id: string | null) => string;
  onClose: () => void;
  onOpenTask: (t: Task) => void;
}) {
  const list = useMemo(
    () =>
      stat
        ? [...statTasks(tasks, stat)].sort((a, b) => {
            if (a.due_date && b.due_date)
              return a.due_date.localeCompare(b.due_date);
            return a.due_date ? -1 : b.due_date ? 1 : 0;
          })
        : [],
    [stat, tasks],
  );
  const departmentCount = useMemo(() => groupByDepartment(list).length, [list]);

  const style = stat ? STAT_STYLE[stat] : null;
  const Icon = style?.icon;

  return (
    <Sheet open={!!stat} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        {stat && style && Icon && (
          <div className="space-y-5 p-5 sm:p-6">
            <TaskSheetHeading
              icon={Icon}
              badge={style.badge}
              title={`${style.label} (${list.length})`}
              description={`Theo bộ lọc và kỳ đang chọn · ${departmentCount} phòng/nhóm`}
            />
            <DepartmentTaskGroups
              tasks={list}
              nameOf={nameOf}
              onSelect={onOpenTask}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CategoryCard({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { stats } = card;
  const empty = stats.total === 0;
  const accent = card.color ? TAG_ACCENT_CLASS[card.color] : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-l-4 bg-card px-3 py-3 text-left shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        accent ? cn(accent.borderL, accent.hover) : "border-dashed border-l-slate-300 bg-card/70",
        empty && "opacity-70",
      )}
    >
      <ProgressRing
        pct={percentDone(stats)}
        stroke={accent?.stroke ?? "stroke-slate-400"}
        empty={empty}
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <p
          className={cn(
            "line-clamp-2 text-[15px] font-semibold leading-snug",
            card.uncategorized && "font-medium text-muted-foreground",
          )}
          title={card.name}
        >
          {card.name}
        </p>
        {empty ? (
          <p className="text-sm text-muted-foreground">Chưa có công việc</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Metric value={stats.total} label="việc" strong />
            {stats.byStatus.in_progress > 0 && (
              <Metric
                value={stats.byStatus.in_progress}
                label="đang làm"
                className="bg-blue-50 text-blue-700"
              />
            )}
            {stats.byStatus.review > 0 && (
              <Metric
                value={stats.byStatus.review}
                label="chờ duyệt"
                className="bg-amber-50 text-amber-700"
              />
            )}
            {stats.overdue > 0 && (
              <Metric
                value={stats.overdue}
                label="trễ hạn"
                className="bg-red-50 font-semibold text-red-600"
              />
            )}
          </div>
        )}
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </button>
  );
}

function Metric({
  value,
  label,
  strong,
  className,
}: {
  value: number;
  label: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5",
        strong ? "bg-muted font-semibold text-foreground" : className,
      )}
    >
      <span className="tabular-nums">{value}</span> {label}
    </span>
  );
}

/** Circle showing the share of done tasks. */
function ProgressRing({
  pct,
  stroke,
  empty,
}: {
  pct: number;
  /** Literal stroke class of the category color. */
  stroke: string;
  empty?: boolean;
}) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-14 w-14 shrink-0" aria-label={`Hoàn thành ${pct}%`}>
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        {!empty && pct > 0 && (
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            className={cn(stroke, "transition-[stroke-dashoffset] duration-500")}
          />
        )}
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums",
          empty && "text-muted-foreground",
        )}
      >
        {empty ? "–" : `${pct}%`}
      </span>
    </div>
  );
}
