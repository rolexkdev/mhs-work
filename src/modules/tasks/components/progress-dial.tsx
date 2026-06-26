"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Biểu đồ tròn (donut) thể hiện % hoàn thành.
 * Kéo quanh vòng để chỉnh giá trị; phát onChange khi thả chuột.
 */
export function ProgressDial({
  value,
  onChange,
  size = 96,
  strokeWidth = 9,
  step = 1,
  readOnly = false,
  className,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  strokeWidth?: number;
  step?: number;
  readOnly?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [temp, setTemp] = useState(value);

  const shown = dragging ? temp : value;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (shown / 100) * circ;

  // Vị trí núm kéo ở cuối cung (gốc 12 giờ, chiều kim đồng hồ).
  const handleAngle = (shown / 100) * 2 * Math.PI - Math.PI / 2;
  const handleX = center + radius * Math.cos(handleAngle);
  const handleY = center + radius * Math.sin(handleAngle);

  const toValue = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      const norm = (deg + 90 + 360) % 360; // 0 ở đỉnh, tăng theo chiều kim đồng hồ
      const pct = Math.round(norm / 360 / (step / 100)) * step;
      return Math.max(0, Math.min(100, pct));
    },
    [step, value],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    setTemp(toValue(e.clientX, e.clientY));
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    setTemp(toValue(e.clientX, e.clientY));
  };
  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const final = toValue(e.clientX, e.clientY);
    setDragging(false);
    if (final !== value) onChange?.(final);
  };

  const tone =
    shown >= 100
      ? "stroke-emerald-500"
      : shown >= 50
        ? "stroke-blue-500"
        : "stroke-amber-500";

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(
        "touch-none select-none",
        !readOnly && "cursor-pointer",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role={readOnly ? "img" : "slider"}
      aria-valuenow={shown}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* vòng nền */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-muted"
      />
      {/* cung tiến độ (bắt đầu từ 12 giờ) */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${center} ${center})`}
        className={cn("transition-[stroke-dasharray]", tone, dragging && "transition-none")}
      />
      {/* núm kéo */}
      {!readOnly && (
        <circle
          cx={handleX}
          cy={handleY}
          r={strokeWidth / 2 + 1}
          className="fill-background stroke-foreground/40"
          strokeWidth={1.5}
        />
      )}
      {/* % ở giữa */}
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground font-semibold"
        style={{ fontSize: size * 0.24 }}
      >
        {shown}%
      </text>
    </svg>
  );
}
