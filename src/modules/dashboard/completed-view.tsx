"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Search, X } from "lucide-react";
import { getQuarter, startOfQuarter } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { Period } from "@/lib/period";
import { TipBody, useTooltip } from "@/modules/dashboard/tooltip";
import {
  SERIES,
  UNASSIGNED,
  completedDate,
  isOnTime,
  leadDays,
  pct,
  type PersonStats,
  type Scope,
} from "@/modules/dashboard/metrics";
import { PersonAvatar, PersonHoverCard } from "@/modules/dashboard/person";
import type { Task } from "@/types/database";

const PAGE = 20;

type QStat = {
  q: number;
  done: Task[];
  months: { m: number; onTime: number; late: number }[];
};

export function CompletedView({
  tasks,
  scope,
  people,
  period,
  onPeriodChange,
  nameOf,
}: {
  tasks: Task[];
  scope: Scope;
  people: PersonStats[];
  period: Period;
  onPeriodChange: (p: Period) => void;
  nameOf: (id: string | null) => string;
}) {
  const [person, setPerson] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const tip = useTooltip();

  const anchor = new Date(period.anchor);
  const year = anchor.getFullYear();
  const activeQ = period.mode === "quarter" ? getQuarter(anchor) : null;

  // 4 quý của năm đang xem (+ Q4 năm trước để so sánh Q1)
  const quarters = useMemo(() => {
    const stat = (y: number, q: number): QStat => {
      const done = tasks.filter((t) => {
        const d = completedDate(t);
        return d && d.getFullYear() === y && getQuarter(d) === q;
      });
      return {
        q,
        done,
        months: [0, 1, 2].map((k) => {
          const m = (q - 1) * 3 + k;
          const list = done.filter((t) => completedDate(t)!.getMonth() === m);
          return {
            m: m + 1,
            onTime: list.filter(isOnTime).length,
            late: list.filter((t) => !isOnTime(t)).length,
          };
        }),
      };
    };
    return {
      list: [1, 2, 3, 4].map((q) => stat(year, q)),
      prevQ4: stat(year - 1, 4).done.length,
    };
  }, [tasks, year]);
  const qMax = Math.max(
    1,
    ...quarters.list.flatMap((s) => s.months.map((m) => m.onTime + m.late)),
  );

  const ranking = [...people]
    .filter((p) => p.completed.length > 0)
    .sort((a, b) => b.completed.length - a.completed.length);
  const rankMax = Math.max(1, ...ranking.map((p) => p.completed.length));

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return scope.completed
      .filter((t) => !person || (t.assignee_id ?? UNASSIGNED) === person)
      .filter((t) => !kw || t.title.toLowerCase().includes(kw))
      .sort(
        (a, b) => completedDate(b)!.getTime() - completedDate(a)!.getTime(),
      );
  }, [scope.completed, person, q]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ------------------------------------------------ 4 quý */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Hoàn thành theo quý · {year}{" "}
          <span className="font-normal">(bấm để xem quý đó)</span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*]:min-w-0">
          {quarters.list.map((s, i) => {
            const prev =
              i === 0 ? quarters.prevQ4 : quarters.list[i - 1].done.length;
            const d = s.done.length - prev;
            const active = activeQ === s.q;
            const future = new Date(year, (s.q - 1) * 3, 1) > new Date();
            const onTime = pct(s.done.filter(isOnTime).length, s.done.length);
            return (
              <button
                key={s.q}
                type="button"
                onClick={() =>
                  onPeriodChange({
                    mode: "quarter",
                    anchor: startOfQuarter(
                      new Date(year, (s.q - 1) * 3, 1),
                    ).toISOString(),
                  })
                }
                className="text-left"
              >
                <Card
                  className={cn(
                    "h-full transition-all hover:-translate-y-0.5 hover:shadow-md",
                    active && "border-primary ring-1 ring-primary",
                    future && "opacity-60",
                  )}
                >
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted",
                        )}
                      >
                        Quý {s.q}
                      </span>
                      {future ? (
                        <span className="text-xs text-muted-foreground">
                          Chưa tới
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center text-xs font-medium",
                            d > 0 && "text-emerald-600",
                            d < 0 && "text-red-600",
                            d === 0 && "text-muted-foreground",
                          )}
                          title="So với quý trước"
                        >
                          {d > 0 ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : d < 0 ? (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          ) : null}
                          {d > 0 ? "+" : ""}
                          {d}
                        </span>
                      )}
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-3xl font-semibold tracking-tight">
                          {s.done.length}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          việc xong ·{" "}
                          {s.done.length ? `${onTime}% đúng hạn` : "—"}
                        </p>
                      </div>
                      <div className="flex h-12 items-end gap-1">
                        {s.months.map((m) => {
                          const total = m.onTime + m.late;
                          const key = `${s.q}:${m.m}`;
                          return (
                            <div
                              key={m.m}
                              className="flex h-full w-3.5 flex-col-reverse gap-px"
                              {...tip.bind(
                                key,
                                <TipBody
                                  title={`Tháng ${m.m}/${year}`}
                                  rows={[
                                    {
                                      color: SERIES.onTime,
                                      label: "Đúng hạn",
                                      value: m.onTime,
                                    },
                                    {
                                      color: SERIES.late,
                                      label: "Trễ hạn",
                                      value: m.late,
                                    },
                                  ]}
                                />,
                              )}
                            >
                              {total === 0 && (
                                <div className="h-0.5 rounded-full bg-muted" />
                              )}
                              {m.onTime > 0 && (
                                <div
                                  className={cn(
                                    "rounded-[2px]",
                                    tip.active === key && "brightness-110",
                                  )}
                                  style={{
                                    height: `${(m.onTime / qMax) * 100}%`,
                                    backgroundColor: SERIES.onTime,
                                  }}
                                />
                              )}
                              {m.late > 0 && (
                                <div
                                  className="rounded-[2px]"
                                  style={{
                                    height: `${(m.late / qMax) * 100}%`,
                                    backgroundColor: SERIES.late,
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
        {tip.node}
      </div>

      <div className="grid gap-4 xl:grid-cols-5 [&>*]:min-w-0">
        {/* ------------------------------------------------ theo nhân viên */}
        <Card className="xl:col-span-2">
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="font-medium">Đóng góp theo nhân viên</p>
              <p className="text-xs text-muted-foreground">
                Bấm để lọc danh sách · rê để xem nhanh
              </p>
            </div>
            {ranking.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Chưa có việc hoàn thành trong kỳ.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {ranking.map((p) => {
                  const onTimeN = p.completed.filter(isOnTime).length;
                  const selected = person === p.id;
                  return (
                    <li key={p.id}>
                      <PersonHoverCard p={p} buckets={scope.buckets}>
                        <button
                          type="button"
                          onClick={() => {
                            setPerson(selected ? null : p.id);
                            setLimit(PAGE);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/70",
                            selected && "bg-primary/10 hover:bg-primary/15",
                          )}
                        >
                          <PersonAvatar p={p} className="h-7 w-7" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate font-medium">
                                {p.name}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                <b className="text-foreground">
                                  {p.completed.length}
                                </b>{" "}
                                việc
                              </span>
                            </div>
                            <div
                              className="mt-1 flex h-1.5 gap-px overflow-hidden rounded-full"
                              style={{
                                width: `${(p.completed.length / rankMax) * 100}%`,
                              }}
                            >
                              {onTimeN > 0 && (
                                <div
                                  className="h-full"
                                  style={{
                                    flexGrow: onTimeN,
                                    backgroundColor: SERIES.onTime,
                                  }}
                                />
                              )}
                              {p.completed.length - onTimeN > 0 && (
                                <div
                                  className="h-full"
                                  style={{
                                    flexGrow: p.completed.length - onTimeN,
                                    backgroundColor: SERIES.late,
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </button>
                      </PersonHoverCard>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ danh sách */}
        <Card className="xl:col-span-3">
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                Việc đã hoàn thành{" "}
                <span className="text-muted-foreground">({list.length})</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {person && (
                  <button
                    type="button"
                    onClick={() => setPerson(null)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    {nameOf(person === UNASSIGNED ? null : person) ||
                      "Không rõ"}
                    <X className="h-3 w-3" />
                  </button>
                )}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm công việc…"
                    className="h-8 w-44 pl-8 text-xs"
                  />
                </div>
              </div>
            </div>
            {list.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Không có việc hoàn thành phù hợp.
              </p>
            ) : (
              <>
                <ul className="max-h-[560px] divide-y overflow-y-auto pr-1">
                  {list.slice(0, limit).map((t) => {
                    const at = completedDate(t)!;
                    const onTime = isOnTime(t);
                    const lead = leadDays(t);
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/tasks?task=${t.id}`}
                          className="flex items-center gap-3 rounded-md px-1 py-2.5 text-sm transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{t.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {nameOf(t.assignee_id) || "—"}
                              {t.department && ` · ${t.department}`}
                              {lead !== null && ` · ${lead} ngày xử lý`}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs tabular-nums">
                              {formatDate(at.toISOString())}
                            </p>
                            <span
                              className={cn(
                                "inline-block rounded-full px-1.5 py-px text-[10px] font-medium",
                                onTime
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
                              )}
                            >
                              {onTime ? "✓ Đúng hạn" : "⏱ Trễ hạn"}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {list.length > limit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setLimit((l) => l + PAGE)}
                  >
                    Xem thêm {Math.min(PAGE, list.length - limit)} việc
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
