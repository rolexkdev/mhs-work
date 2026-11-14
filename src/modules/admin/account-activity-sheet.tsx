"use client";

import { useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Eye,
  LogIn,
  MessageSquare,
  Pencil,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useProfiles } from "@/modules/auth/use-profiles";
import { describeLog } from "@/modules/tasks/components/task-detail-panel";
import type { AccountRow } from "@/modules/admin/constants";
import {
  useAccountActivity,
  type ActivityEvent,
} from "@/modules/admin/activity-hooks";

const PERIODS = [
  { days: 7, label: "7 ngày qua" },
  { days: 30, label: "30 ngày qua" },
  { days: 90, label: "90 ngày qua" },
];

type Filter = "all" | "access" | "work" | "assigned";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "access", label: "Truy cập" },
  { value: "work", label: "Cập nhật việc" },
  { value: "assigned", label: "Được giao" },
];

function matchesFilter(e: ActivityEvent, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "access":
      return e.type === "login" || e.type === "page_view";
    case "work":
      return e.type === "task_change" || e.type === "comment";
    case "assigned":
      return e.type === "assigned";
  }
}

/** Longest prefix wins, so /meetings/<id> maps to the meeting detail label. */
const PAGE_LABELS: { prefix: string; label: string }[] = [
  { prefix: "/meetings/", label: "Chi tiết cuộc họp" },
  { prefix: "/meetings", label: "Họp giao ban" },
  { prefix: "/tasks", label: "Công việc" },
  { prefix: "/documents", label: "Hồ sơ" },
  { prefix: "/updates", label: "Báo cáo công việc" },
  { prefix: "/accounts", label: "Quản lý tài khoản" },
];

function pageLabel(path: string): string {
  if (path === "/") return "Dashboard";
  return PAGE_LABELS.find((p) => path.startsWith(p.prefix))?.label ?? path;
}

const EVENT_STYLE: Record<
  ActivityEvent["type"],
  { icon: LucideIcon; className: string }
> = {
  login: { icon: LogIn, className: "bg-emerald-50 text-emerald-700" },
  page_view: { icon: Eye, className: "bg-slate-100 text-slate-600" },
  task_change: { icon: Pencil, className: "bg-blue-50 text-blue-700" },
  comment: { icon: MessageSquare, className: "bg-violet-50 text-violet-700" },
  assigned: { icon: UserPlus, className: "bg-amber-50 text-amber-700" },
};

function dayLabel(d: Date): string {
  if (isToday(d)) return "Hôm nay";
  if (isYesterday(d)) return "Hôm qua";
  return format(d, "EEEE, dd/MM/yyyy", { locale: vi });
}

const B = ({ children }: { children: React.ReactNode }) => (
  <span className="font-medium text-foreground">{children}</span>
);

function TaskName({ title }: { title: string | null }) {
  return title ? (
    <B>“{title}”</B>
  ) : (
    <span className="italic">(công việc đã xoá)</span>
  );
}

export function AccountActivitySheet({
  account,
  onOpenChange,
}: {
  account: AccountRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, error } = useAccountActivity(
    account?.id ?? null,
    days,
  );
  const { data: profiles = [] } = useProfiles();

  const nameOf = useMemo(() => {
    const byId = new Map(profiles.map((p) => [p.id, p.full_name ?? p.email]));
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null);
  }, [profiles]);

  const events = useMemo(() => data?.events ?? [], [data]);

  const stats = useMemo(() => {
    const activeDays = new Set<string>();
    let logins = 0;
    let views = 0;
    let work = 0;
    let assigned = 0;
    for (const e of events) {
      if (e.type === "login") logins++;
      else if (e.type === "page_view") views++;
      else if (e.type === "assigned") assigned++;
      else work++;
      // A day counts as active only for things the person did themselves.
      if (e.type !== "assigned") {
        activeDays.add(format(new Date(e.at), "yyyy-MM-dd"));
      }
    }
    return { activeDays: activeDays.size, logins, views, work, assigned };
  }, [events]);

  const groups = useMemo(() => {
    const result: { key: string; label: string; items: ActivityEvent[] }[] =
      [];
    for (const e of events) {
      if (!matchesFilter(e, filter)) continue;
      const d = new Date(e.at);
      const key = format(d, "yyyy-MM-dd");
      const last = result[result.length - 1];
      if (last?.key === key) last.items.push(e);
      else result.push({ key, label: dayLabel(d), items: [e] });
    }
    return result;
  }, [events, filter]);

  const describe = (e: ActivityEvent): React.ReactNode => {
    switch (e.type) {
      case "login":
        return <>Đăng nhập</>;
      case "page_view":
        return (
          <>
            Mở trang <B>{pageLabel(e.path)}</B>
          </>
        );
      case "task_change":
        return (
          <>
            {describeLog(e.log, nameOf)} · <TaskName title={e.taskTitle} />
          </>
        );
      case "comment":
        return (
          <>
            bình luận ở <TaskName title={e.taskTitle} />
            <span className="mt-0.5 block line-clamp-2 text-xs">
              {e.content}
            </span>
          </>
        );
      case "assigned": {
        const by = e.byId && e.byId !== account?.id ? nameOf(e.byId) : null;
        return (
          <>
            Được giao <TaskName title={e.taskTitle} />
            {by && (
              <>
                {" "}
                bởi <B>{by}</B>
              </>
            )}
          </>
        );
      }
    }
  };

  const displayName = account ? (account.fullName ?? account.email) : "";

  return (
    <Sheet open={!!account} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <div className="space-y-4 border-b p-5 pr-14">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {account?.avatarUrl && (
                <AvatarImage src={account.avatarUrl} alt={displayName} />
              )}
              <AvatarFallback className="text-xs">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="truncate">{displayName}</SheetTitle>
              <SheetDescription className="truncate text-xs">
                {account?.lastSignInAt
                  ? `Đăng nhập gần nhất ${formatDateTime(account.lastSignInAt)}`
                  : "Chưa đăng nhập lần nào"}
              </SheetDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(days)}
              onValueChange={(v) => setDays(Number(v))}
            >
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.days} value={String(p.days)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === f.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {!isLoading && !error && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Ngày có hoạt động" value={stats.activeDays} />
              <Stat
                label="Đăng nhập · mở trang"
                value={`${stats.logins} · ${stats.views}`}
              />
              <Stat label="Cập nhật việc" value={stats.work} />
              <Stat label="Được giao" value={stats.assigned} />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {data?.trackingUnavailable && (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              Chưa ghi nhận được lịch sử đăng nhập và mở trang (cần chạy
              migration 0021). Bên dưới chỉ có hoạt động trên công việc.
            </p>
          )}

          {error ? (
            <p className="text-sm text-destructive">
              {(error as Error).message}
            </p>
          ) : isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Không có hoạt động nào trong khoảng thời gian này.
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.key} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground first-letter:uppercase">
                    {g.label}
                    <span className="ml-2 font-normal normal-case">
                      ({g.items.length})
                    </span>
                  </h3>
                  <ol className="space-y-1">
                    {g.items.map((e) => {
                      const { icon: Icon, className } = EVENT_STYLE[e.type];
                      return (
                        <li
                          key={e.id}
                          className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                        >
                          <span className="w-10 shrink-0 pt-1 text-xs tabular-nums text-muted-foreground">
                            {format(new Date(e.at), "HH:mm")}
                          </span>
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                              className,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <p className="min-w-0 flex-1 pt-0.5 text-sm text-muted-foreground first-letter:uppercase">
                            {describe(e)}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] leading-tight text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
