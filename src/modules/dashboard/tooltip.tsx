"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TipState = { key: string; x: number; y: number; content: ReactNode };

/**
 * Tooltip bám theo con trỏ cho các mark của biểu đồ (cột, ô, lát donut...).
 * `bind(key, content)` gắn vào mark (HTML hoặc SVG), `node` render 1 lần trong chart.
 * `active` = key của mark đang được rê → dùng để làm nổi mark đó.
 */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);

  const bind = (key: string, content: ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) =>
      setTip({ key, x: e.clientX, y: e.clientY, content }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<Element>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ key, x: r.left + r.width / 2, y: r.top, content });
    },
    onBlur: () => setTip(null),
  });

  const node =
    tip && typeof document !== "undefined"
      ? createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[60] min-w-[140px] max-w-[260px] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
            style={{
              // Giữ tooltip trong màn hình khi rê sát mép
              left: Math.min(Math.max(tip.x, 140), window.innerWidth - 140),
              top: tip.y,
              transform: "translate(-50%, calc(-100% - 12px))",
            }}
          >
            {tip.content}
          </div>,
          document.body,
        )
      : null;

  return { bind, node, active: tip?.key ?? null };
}

export type TipRow = { color?: string; label: string; value: ReactNode };

/** Nội dung tooltip chuẩn: tiêu đề + các dòng (giá trị đậm, nhãn mờ). */
export function TipBody({ title, rows }: { title: ReactNode; rows: TipRow[] }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-muted-foreground">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && (
            <span
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: r.color }}
            />
          )}
          <span className="flex-1 text-muted-foreground">{r.label}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
