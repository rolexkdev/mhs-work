"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Rows3, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  HeatGrid,
  PercentRing,
  Sparkline,
  StackedBar,
} from "@/modules/dashboard/charts";
import {
  SERIES,
  type PersonStats,
  type Scope,
} from "@/modules/dashboard/metrics";
import {
  PersonAvatar,
  PersonHoverCard,
  statusSegments,
} from "@/modules/dashboard/person";
import type { Profile } from "@/types/database";

type SortKey = "total" | "completed" | "overdue" | "name";
type Layout = "table" | "cards";

const SORTERS: Record<SortKey, (a: PersonStats, b: PersonStats) => number> = {
  total: (a, b) => b.total - a.total,
  completed: (a, b) => b.completed.length - a.completed.length,
  overdue: (a, b) => b.overdue.length - a.overdue.length || b.total - a.total,
  name: (a, b) => a.name.localeCompare(b.name, "vi"),
};

export function PeopleView({
  scope,
  people,
  profiles,
  onOpenPerson,
}: {
  scope: Scope;
  people: PersonStats[];
  profiles: Profile[];
  onOpenPerson: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("total");
  const [layout, setLayout] = useState<Layout>("table");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return people
      .filter((p) => !kw || p.name.toLowerCase().includes(kw))
      .sort(SORTERS[sort]);
  }, [people, q, sort]);

  const idle = profiles.filter((pr) => !people.some((p) => p.id === pr.id));
  const openN = people.reduce((s, p) => s + p.open.length, 0);
  const withOverdue = people.filter((p) => p.overdue.length > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tóm tắt đội */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <SummaryTile
          label="Nhân viên có việc"
          value={people.length}
          sub={`${openN} việc đang mở`}
        />
        <SummaryTile
          label="Việc đang mở / người"
          value={people.length ? (openN / people.length).toFixed(1) : "0"}
          sub="trung bình trong kỳ"
        />
        <SummaryTile
          label="Người có việc quá hạn"
          value={withOverdue.length}
          tone={withOverdue.length ? "text-red-600" : undefined}
          sub={withOverdue.map((p) => p.name).join(", ") || "Không ai"}
        />
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Không có việc trong kỳ
            </p>
            <p className="text-2xl font-semibold">{idle.length}</p>
            <p
              className="truncate text-[11px] text-muted-foreground"
              title={idle.map((p) => p.full_name || p.email).join(", ")}
            >
              {idle.map((p) => p.full_name || p.email).join(", ") ||
                "Ai cũng có việc"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm nhân viên…"
            className="h-9 pl-8"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-9 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="total">Nhiều việc nhất</SelectItem>
            <SelectItem value="completed">Hoàn thành nhiều nhất</SelectItem>
            <SelectItem value="overdue">Quá hạn nhiều nhất</SelectItem>
            <SelectItem value="name">Theo tên A–Z</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto hidden rounded-md border p-0.5 md:flex">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", layout === "table" && "bg-muted")}
            onClick={() => setLayout("table")}
            title="Dạng bảng"
          >
            <Rows3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", layout === "cards" && "bg-muted")}
            onClick={() => setLayout("cards")}
            title="Dạng thẻ"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Không có nhân viên phù hợp.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Điện thoại luôn dùng thẻ; máy tính chọn bảng/thẻ */}
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
              layout === "table" && "md:hidden",
            )}
          >
            {list.map((p) => (
              <PersonCard
                key={p.id}
                p={p}
                scope={scope}
                onOpen={() => onOpenPerson(p.id)}
              />
            ))}
          </div>
          {layout === "table" && (
            <div className="hidden md:block">
              <StaffTable people={list} scope={scope} onOpen={onOpenPerson} />
            </div>
          )}
        </>
      )}

      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-medium">Bản đồ nhiệt hoàn thành</p>
            <p className="text-xs text-muted-foreground">
              Số việc mỗi người hoàn thành theo từng mốc thời gian · ô càng đậm
              càng nhiều
            </p>
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <HeatGrid
              rows={[...list]
                .sort((a, b) => b.completed.length - a.completed.length)
                .map((p) => ({ id: p.id, name: p.name, values: p.trend }))}
              buckets={scope.buckets}
              onRowClick={onOpenPerson}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PersonCard({
  p,
  scope,
  onOpen,
}: {
  p: PersonStats;
  scope: Scope;
  onOpen: () => void;
}) {
  return (
    <PersonHoverCard p={p} buckets={scope.buckets}>
      <button type="button" onClick={onOpen} className="text-left">
        <Card
          className={cn(
            "h-full transition-all hover:-translate-y-0.5 hover:shadow-md",
            p.overdue.length > 0 && "border-red-200 dark:border-red-900/60",
          )}
        >
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <PersonAvatar p={p} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.open.length} việc đang mở
                </p>
              </div>
              <PercentRing
                value={p.completionRate}
                size={44}
                className="[&_span]:text-[10px]"
              />
            </div>
            <StackedBar segments={statusSegments(p)} />
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                { label: "Việc", value: p.total },
                {
                  label: "Xong kỳ",
                  value: p.completed.length,
                  tone: "text-emerald-600",
                },
                {
                  label: "Đúng hạn",
                  value: p.onTimeRate === null ? "—" : `${p.onTimeRate}%`,
                },
                {
                  label: "Quá hạn",
                  value: p.overdue.length,
                  tone: p.overdue.length
                    ? "text-red-600"
                    : "text-muted-foreground",
                },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-muted/50 py-1.5">
                  <p
                    className={cn("text-sm font-semibold tabular-nums", s.tone)}
                  >
                    {s.value}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </button>
    </PersonHoverCard>
  );
}

function StaffTable({
  people,
  scope,
  onOpen,
}: {
  people: PersonStats[];
  scope: Scope;
  onOpen: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-3 text-left font-medium">Nhân viên</th>
              <th className="px-3 py-3 text-right font-medium">Việc</th>
              <th className="px-3 py-3 text-right font-medium">Xong kỳ</th>
              <th className="w-32 px-3 py-3 text-left font-medium">Tỷ lệ HT</th>
              <th className="px-3 py-3 text-right font-medium">Đúng hạn</th>
              <th className="px-3 py-3 text-right font-medium">Quá hạn</th>
              <th className="px-3 py-3 text-right font-medium">Tiến độ TB</th>
              <th className="w-28 px-3 py-3 text-left font-medium">Xu hướng</th>
              <th className="w-32 px-3 py-3 text-left font-medium">Cơ cấu</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr
                key={p.id}
                onClick={() => onOpen(p.id)}
                className="group cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
              >
                <td className="px-3 py-2.5">
                  <PersonHoverCard p={p} buckets={scope.buckets}>
                    <span className="inline-flex max-w-[200px] items-center gap-2.5">
                      <PersonAvatar p={p} className="h-8 w-8" />
                      <span className="truncate font-medium group-hover:text-primary">
                        {p.name}
                      </span>
                    </span>
                  </PersonHoverCard>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {p.total}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-emerald-600">
                  {p.completed.length}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                        style={{ width: `${p.completionRate}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums">
                      {p.completionRate}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {p.onTimeRate === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    `${p.onTimeRate}%`
                  )}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-medium tabular-nums",
                    p.overdue.length
                      ? "text-red-600"
                      : "text-muted-foreground/50",
                  )}
                >
                  {p.overdue.length}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {p.avgProgress === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    `${p.avgProgress}%`
                  )}
                </td>
                <td
                  className="px-3 py-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Sparkline
                    values={p.trend}
                    buckets={scope.buckets}
                    color={SERIES.onTime}
                    unit="Việc xong"
                    className="h-6"
                  />
                </td>
                <td
                  className="px-3 py-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <StackedBar segments={statusSegments(p)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold", tone)}>{value}</p>
        <p className="truncate text-[11px] text-muted-foreground" title={sub}>
          {sub}
        </p>
      </CardContent>
    </Card>
  );
}
