import { cn } from "@/lib/utils";

export type DonutSegment = { label: string; value: number; color: string };

/** Biểu đồ tròn (donut) phân bố — vẽ bằng SVG, không cần thư viện. */
export function StatusDonut({
  segments,
  total,
}: {
  segments: DonutSegment[];
  total: number;
}) {
  const size = 184;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;

  let acc = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
                key={s.label}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c}`}
                strokeDashoffset={-acc}
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
            acc += len;
            return node;
          })}
        <text
          x={center}
          y={center - 6}
          textAnchor="middle"
          className="fill-foreground text-2xl font-bold"
        >
          {total}
        </text>
        <text
          x={center}
          y={center + 16}
          textAnchor="middle"
          className="fill-muted-foreground text-xs"
        >
          công việc
        </text>
      </svg>

      <ul className="flex-1 space-y-1.5">
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.label} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="font-medium">{s.value}</span>
              <span className="w-9 text-right text-xs text-muted-foreground">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type DeptRow = { label: string; total: number; done: number };

/** Thanh tiến độ hoàn thành theo phòng/nhóm. */
export function DeptProgressBars({ rows }: { rows: DeptRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">Chưa có dữ liệu phòng/nhóm.</p>
    );

  return (
    <div className="space-y-3.5">
      {rows.map((r) => {
        const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
        return (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="truncate font-medium">{r.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {r.done}/{r.total} xong · {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct === 100 ? "bg-emerald-500" : "bg-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
