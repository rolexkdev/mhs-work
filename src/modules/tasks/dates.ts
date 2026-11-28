import { addDays, startOfDay } from "date-fns";

export const DATE_RANGE_ERROR = "Ngày bắt đầu phải trước hạn chót";

/**
 * True when either date is empty or the start date is on or before the due
 * date. Dates are ISO strings or `YYYY-MM-DD`; compared by calendar day.
 */
export function isDateRangeValid(
  start: string | null | undefined,
  due: string | null | undefined,
): boolean {
  if (!start || !due) return true;
  return start.slice(0, 10) <= due.slice(0, 10);
}

/**
 * True when an unfinished task has a due date whose local calendar day is
 * strictly before today (local time). Due today is not overdue.
 */
export function isTaskOverdue(
  task: { status: string; due_date: string | null },
  now: Date | number = new Date(),
): boolean {
  if (task.status === "done" || !task.due_date) return false;
  return startOfDay(new Date(task.due_date)) < startOfDay(now);
}

/**
 * True when an unfinished task is due between today and `days` days ahead
 * (inclusive, local calendar days). Complements `isTaskOverdue` with no gap.
 */
export function isTaskDueSoon(
  task: { status: string; due_date: string | null },
  days = 7,
  now: Date | number = new Date(),
): boolean {
  if (task.status === "done" || !task.due_date) return false;
  const today = startOfDay(now);
  const due = startOfDay(new Date(task.due_date));
  return due >= today && due <= addDays(today, days);
}
