"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TipBody, useTooltip } from "@/modules/dashboard/tooltip";
import {
  SERIES,
  type Bucket,
  type SeriesPoint,
} from "@/modules/dashboard/metrics";

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

/** Làm tròn trục lên số "đẹp" (1, 2, 5 × 10ⁿ) để gridline dễ đọc. */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// ------------------------------------------------------------------- Donut

/** Donut trạng thái — rê vào lát/chú thích thì lát đó nổi lên, tâm hiện số của lát. */
export function StatusDonut({
  segments,
  total,
  unit = "công việc",
}: {
  segments: DonutSegment[];
  total: number;
  unit?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const size = 188;
  const stroke = 22;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  const gap =
    total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  const active = segments.find((s) => s.key === hover);

  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col 2xl:flex-row">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        onPointerLeave={() => setHover(null)}
      >
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        {total > 0 &&
          segments.map((s) => {
            if (s.value === 0) return null;
            const len = (s.value / total) * c;
            const node = (
              <circle
                key={s.key}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.key ? stroke + 8 : stroke}
                strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`}
                strokeDashoffset={-acc}
                transform={`rotate(-90 ${center} ${center})`}
                className="cursor-pointer transition-all duration-200"
                style={{ opacity: hover && hover !== s.key ? 0.35 : 1 }}
                onPointerEnter={() => setHover(s.key)}
              />
            );
            acc += len;
            return node;
          })}
        <text
          x={center}
          y={center - 4}
          textAnchor="middle"
          className="fill-foreground text-3xl font-semibold"
        >
          {active ? active.value : total}
        </text>
        <text
          x={center}
          y={center + 18}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          {active
            ? `${active.label.replace(/^\S+\s/, "")} · ${Math.round((active.value / Math.max(total, 1)) * 100)}%`
            : unit}
        </text>
      </svg>

      <ul className="w-full min-w-0 flex-1 space-y-0.5">
        {segments.map((s) => {
          const p = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li
              key={s.key}
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                hover === s.key && "bg-muted",
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="font-semibold tabular-nums">{s.value}</span>
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                {p}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------- StackedBar

/** Thanh ngang xếp chồng (cơ cấu trạng thái) — rê từng đoạn để xem số. */
export function StackedBar({
  segments,
  className,
}: {
  segments: DonutSegment[];
  className?: string;
}) {
  const tip = useTooltip();
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div
      className={cn(
        "flex h-2 gap-[2px] overflow-hidden rounded-full",
        className,
      )}
    >
      {total === 0 && <div className="h-full w-full bg-muted" />}
      {segments.map((s) =>
        s.value > 0 ? (
          <div
            key={s.key}
            className="h-full transition-opacity"
            style={{
              flexGrow: s.value,
              backgroundColor: s.color,
              opacity: tip.active && tip.active !== s.key ? 0.4 : 1,
            }}
            {...tip.bind(
              s.key,
              <TipBody
                title={s.label}
                rows={[
                  { label: "Số việc", value: s.value },
                  {
                    label: "Tỷ lệ",
                    value: `${Math.round((s.value / total) * 100)}%`,
                  },
                ]}
              />,
            )}
          />
        ) : null,
      )}
      {tip.node}
    </div>
  );
}

// ------------------------------------------------------------------- Sparkline

/** Đường xu hướng nhỏ trong thẻ số liệu — rê để xem giá trị từng mốc. */
export function Sparkline({
  values,
  buckets,
  color,
  unit,
  className,
}: {
  values: number[];
  buckets: Bucket[];
  color: string;
  unit: string;
  className?: string;
}) {
  const tip = useTooltip();
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [
    (i / (n - 1)) * 100,
    30 - (v / max) * 26 - 2,
  ]);
  const line = pts.map((p) => p.join(",")).join(" ");
  const activeIdx = tip.active === null ? -1 : Number(tip.active);

  return (
    <div className={cn("relative h-8 w-full", className)}>
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <polygon points={`0,30 ${line} 100,30`} fill={color} opacity={0.12} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {/* chấm đang rê + vùng bắt chuột theo từng mốc */}
      {activeIdx >= 0 && (
        <span
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-card"
          style={{
            left: `${pts[activeIdx][0]}%`,
            bottom: `${100 - (pts[activeIdx][1] / 30) * 100}%`,
            backgroundColor: color,
          }}
        />
      )}
      <div className="absolute inset-0 flex">
        {values.map((v, i) => (
          <div
            key={i}
            className="h-full flex-1"
            {...tip.bind(
              String(i),
              <TipBody
                title={buckets[i]?.label}
                rows={[{ color, label: unit, value: v }]}
              />,
            )}
          />
        ))}
      </div>
      {tip.node}
    </div>
  );
}

// ------------------------------------------------------------------- Throughput

/**
 * Nhịp hoàn thành theo mốc thời gian: cột xếp chồng (đúng hạn / trễ hạn)
 * + đường "việc mới giao" trên cùng một trục số lượng.
 */
export function ThroughputChart({
  series,
  showCreated = true,
  height = 220,
}: {
  series: SeriesPoint[];
  showCreated?: boolean;
  height?: number;
}) {
  const tip = useTooltip();
  const n = series.length;
  const max = niceMax(
    Math.max(
      1,
      ...series.map((s) => s.onTime + s.late),
      ...(showCreated ? series.map((s) => s.created) : []),
    ),
  );
  const ticks = [max, max / 2, 0];
  const step = n > 8 ? 2 : 1;
  const linePts = series
    .map((s, i) => `${i + 0.5},${100 - (s.created / max) * 100}`)
    .join(" ");

  return (
    <div className="flex gap-2">
      {/* trục Y */}
      <div
        className="flex shrink-0 flex-col justify-between pb-6 text-right text-[10px] tabular-nums text-muted-foreground"
        style={{ height }}
      >
        {ticks.map((t) => (
          <span
            key={t}
            className="-translate-y-1/2 leading-none last:translate-y-0"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="relative" style={{ height: height - 24 }}>
          {/* gridline */}
          {ticks.map((t) => (
            <div
              key={t}
              className={cn(
                "absolute inset-x-0 border-t",
                t === 0 ? "border-border" : "border-dashed border-border/60",
              )}
              style={{ bottom: `${(t / max) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex">
            {series.map((s, i) => {
              const done = s.onTime + s.late;
              const key = String(i);
              const active = tip.active === key;
              return (
                <div
                  key={i}
                  tabIndex={0}
                  className={cn(
                    "relative flex h-full flex-1 cursor-default items-end justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active && "bg-muted/70",
                  )}
                  {...tip.bind(
                    key,
                    <TipBody
                      title={s.bucket.label}
                      rows={[
                        {
                          color: SERIES.onTime,
                          label: "Xong đúng hạn",
                          value: s.onTime,
                        },
                        {
                          color: SERIES.late,
                          label: "Xong trễ hạn",
                          value: s.late,
                        },
                        ...(showCreated
                          ? [
                              {
                                color: SERIES.created,
                                label: "Việc mới giao",
                                value: s.created,
                              },
                            ]
                          : []),
                      ]}
                    />,
                  )}
                >
                  <div
                    className="flex w-[58%] max-w-[30px] flex-col-reverse gap-[2px] transition-all duration-500"
                    style={{ height: `${(done / max) * 100}%` }}
                  >
                    {s.onTime > 0 && (
                      <div
                        className={cn(
                          "w-full",
                          s.late === 0 ? "rounded-t" : "rounded-t-[2px]",
                        )}
                        style={{
                          flexGrow: s.onTime,
                          backgroundColor: SERIES.onTime,
                        }}
                      />
                    )}
                    {s.late > 0 && (
                      <div
                        className="w-full rounded-t"
                        style={{
                          flexGrow: s.late,
                          backgroundColor: SERIES.late,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {showCreated && (
            <>
              <svg
                viewBox={`0 0 ${n} 100`}
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              >
                <polyline
                  points={linePts}
                  fill="none"
                  stroke={SERIES.created}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {series.map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    "pointer-events-none absolute h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-card transition-transform",
                    tip.active === String(i) && "scale-150",
                  )}
                  style={{
                    left: `${((i + 0.5) / n) * 100}%`,
                    bottom: `${(s.created / max) * 100}%`,
                    backgroundColor: SERIES.created,
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* trục X */}
        <div className="flex h-6 items-end">
          {series.map((s, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 truncate text-center text-[10px] text-muted-foreground",
                i % step !== 0 && "invisible sm:visible",
              )}
            >
              {s.bucket.short}
            </span>
          ))}
        </div>
      </div>
      {tip.node}
    </div>
  );
}

export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; kind?: "bar" | "line" }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            className={
              it.kind === "line"
                ? "h-0.5 w-3.5 rounded-full"
                : "h-2.5 w-2.5 rounded-sm"
            }
            style={{ backgroundColor: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- Dept bars

export type DeptRow = {
  label: string;
  total: number;
  done: number;
  overdue: number;
  segments: DonutSegment[];
};

/** Tiến độ theo phòng — rê vào dòng để xem cơ cấu trạng thái. */
export function DeptProgressBars({ rows }: { rows: DeptRow[] }) {
  const tip = useTooltip();
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có dữ liệu phòng/nhóm.
      </p>
    );

  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const p = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
        return (
          <div
            key={r.label}
            tabIndex={0}
            className={cn(
              "rounded-md px-2 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              tip.active === r.label && "bg-muted/70",
            )}
            {...tip.bind(
              r.label,
              <TipBody
                title={r.label}
                rows={[
                  ...r.segments
                    .filter((s) => s.value > 0)
                    .map((s) => ({
                      color: s.color,
                      label: s.label,
                      value: s.value,
                    })),
                  ...(r.overdue > 0
                    ? [{ label: "⚠️ Quá hạn", value: r.overdue }]
                    : []),
                ]}
              />,
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">{r.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {r.done}/{r.total} ·{" "}
                <span className="font-semibold text-foreground">{p}%</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  p === 100 ? "bg-emerald-500" : "bg-primary",
                )}
                style={{ width: `${p}%` }}
              />
            </div>
          </div>
        );
      })}
      {tip.node}
    </div>
  );
}

// ------------------------------------------------------------------- Heatmap

/** Ramp tuần tự 1 màu (xanh dương) cho độ lớn — nhạt = ít, đậm = nhiều. */
const HEAT = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];

export type HeatRow = { id: string; name: string; values: number[] };

/** Ma trận nhân viên × mốc thời gian: số việc hoàn thành mỗi ô. */
export function HeatGrid({
  rows,
  buckets,
  onRowClick,
}: {
  rows: HeatRow[];
  buckets: Bucket[];
  onRowClick?: (id: string) => void;
}) {
  const tip = useTooltip();
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  const colorOf = (v: number) =>
    v === 0
      ? undefined
      : HEAT[
          Math.min(HEAT.length - 1, Math.floor((v / max) * (HEAT.length - 1)))
        ];
  const step = buckets.length > 8 ? 2 : 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card" />
            {buckets.map((b, i) => (
              <th
                key={i}
                className="min-w-[26px] pb-1 text-center text-[10px] font-normal text-muted-foreground"
              >
                {i % step === 0 ? b.short : ""}
              </th>
            ))}
            <th className="pb-1 pl-2 text-right text-[10px] font-medium text-muted-foreground">
              Tổng
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = r.values.reduce((a, b) => a + b, 0);
            return (
              <tr key={r.id} className="group">
                <td className="sticky left-0 max-w-[140px] truncate bg-card pr-2">
                  <button
                    type="button"
                    onClick={() => onRowClick?.(r.id)}
                    className="truncate font-medium hover:text-primary group-hover:text-primary"
                  >
                    {r.name}
                  </button>
                </td>
                {r.values.map((v, i) => {
                  const key = `${r.id}:${i}`;
                  const bg = colorOf(v);
                  return (
                    <td
                      key={i}
                      className={cn(
                        "h-7 rounded-[4px] text-center text-[10px] font-medium tabular-nums transition-transform",
                        !bg && "bg-muted/60 text-transparent",
                        tip.active === key &&
                          "scale-110 ring-2 ring-foreground/70",
                      )}
                      style={
                        bg
                          ? {
                              backgroundColor: bg,
                              color: HEAT.indexOf(bg) >= 3 ? "#fff" : "#0d366b",
                            }
                          : undefined
                      }
                      {...tip.bind(
                        key,
                        <TipBody
                          title={`${r.name} · ${buckets[i].label}`}
                          rows={[
                            {
                              color: HEAT[3],
                              label: "Việc hoàn thành",
                              value: v,
                            },
                          ]}
                        />,
                      )}
                    >
                      {v || ""}
                    </td>
                  );
                })}
                <td className="pl-2 text-right font-semibold tabular-nums">
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tip.node}
    </div>
  );
}

// ------------------------------------------------------------------- Percent ring

/** Vòng % nhỏ (vd tỷ lệ hoàn thành). */
export function PercentRing({
  value,
  size = 40,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={SERIES.onTime}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
        {value}%
      </span>
    </div>
  );
}
