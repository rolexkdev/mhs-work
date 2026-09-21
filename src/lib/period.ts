import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  format,
} from "date-fns";
import { vi } from "date-fns/locale";
import type { Task } from "@/types/database";

export type PeriodMode = "week" | "month" | "quarter" | "year" | "all";

/** Kỳ đang xem: chế độ + 1 ngày bất kỳ nằm trong kỳ. */
export interface Period {
  mode: PeriodMode;
  anchor: string; // ISO date
}

const MON = { weekStartsOn: 1 } as const; // tuần bắt đầu Thứ 2

export function currentPeriod(): Period {
  return { mode: "week", anchor: new Date().toISOString() };
}

export function periodRange(p: Period): { start: Date | null; end: Date | null } {
  if (p.mode === "all") return { start: null, end: null };
  const d = new Date(p.anchor);
  if (p.mode === "week")
    return { start: startOfWeek(d, MON), end: endOfWeek(d, MON) };
  if (p.mode === "quarter")
    return { start: startOfQuarter(d), end: endOfQuarter(d) };
  if (p.mode === "year") return { start: startOfYear(d), end: endOfYear(d) };
  return { start: startOfMonth(d), end: endOfMonth(d) };
}

/** Khoá tuần (yyyy-mm-dd của Thứ 2) — dùng cho hidden_weeks. */
export function weekKey(d: Date): string {
  return format(startOfWeek(d, MON), "yyyy-MM-dd");
}

export function shiftPeriod(p: Period, dir: -1 | 1): Period {
  const d = new Date(p.anchor);
  if (p.mode === "week") return { ...p, anchor: addWeeks(d, dir).toISOString() };
  if (p.mode === "month")
    return { ...p, anchor: addMonths(d, dir).toISOString() };
  if (p.mode === "quarter")
    return { ...p, anchor: addQuarters(d, dir).toISOString() };
  if (p.mode === "year") return { ...p, anchor: addYears(d, dir).toISOString() };
  return p;
}

export function periodLabel(p: Period): string {
  if (p.mode === "all") return "Tất cả";
  const { start, end } = periodRange(p);
  if (!start || !end) return "";
  if (p.mode === "month")
    return format(start, "'Tháng' M, yyyy", { locale: vi });
  if (p.mode === "quarter") return `Quý ${format(start, "Q, yyyy")}`;
  if (p.mode === "year") return `Năm ${format(start, "yyyy")}`;
  return `${format(start, "dd/MM")} – ${format(end, "dd/MM/yyyy")}`;
}

/**
 * Task có thuộc kỳ đang xem không?
 *  • Lặp lại → luôn hiện.
 *  • Chưa xong → carry-over: hiện từ lúc bắt đầu đến hiện tại & các tuần sau.
 *  • Đã xong → chỉ tính đến mốc hoàn thành (không kéo sang tuần sau khi xong).
 *  • Ẩn thủ công theo tuần (hidden_weeks) → không hiện ở tuần đó.
 */
export function isTaskInPeriod(task: Task, p: Period): boolean {
  if (task.recurrence !== "none") return true;

  const { start, end } = periodRange(p);
  if (!start || !end) return true; // 'all'

  if (p.mode === "week" && task.hidden_weeks?.includes(weekKey(start)))
    return false;

  const activeStart = new Date(task.start_date ?? task.created_at);
  const activeEnd =
    task.status === "done"
      ? new Date(task.completed_at ?? task.updated_at)
      : null; // chưa xong → mở (kéo dài tới hiện tại)

  if (activeStart > end) return false;
  if (activeEnd && activeEnd < start) return false;
  return true;
}
