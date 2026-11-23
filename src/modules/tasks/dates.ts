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
