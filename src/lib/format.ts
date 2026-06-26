import { format, isPast, isToday, isTomorrow, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy", { locale: vi });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "HH:mm · dd/MM/yyyy", { locale: vi });
}

/** Nhãn deadline thân thiện: "Hôm nay", "Quá hạn 3 ngày", ... */
export function dueLabel(value: string | null | undefined): {
  text: string;
  tone: "overdue" | "today" | "soon" | "normal" | "none";
} {
  if (!value) return { text: "Không hạn", tone: "none" };
  const date = new Date(value);
  if (isToday(date)) return { text: "Hôm nay", tone: "today" };
  if (isTomorrow(date)) return { text: "Ngày mai", tone: "soon" };
  if (isPast(date)) {
    const days = Math.abs(differenceInDays(date, new Date()));
    return { text: `Quá hạn ${days} ngày`, tone: "overdue" };
  }
  const days = differenceInDays(date, new Date());
  if (days <= 3) return { text: `Còn ${days} ngày`, tone: "soon" };
  return { text: formatDate(value), tone: "normal" };
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
