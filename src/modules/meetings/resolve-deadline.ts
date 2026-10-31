import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  lastDayOfMonth,
  startOfWeek,
} from "date-fns";
import { norm } from "@/modules/meetings/parse-minutes";

export type ResolvedDeadline = {
  /** Chữ hiển thị, đã quy ra ngày nếu quy được. */
  label: string;
  /** Hạn chót; null nếu biên bản không có mốc cụ thể ("Gấp", "Thực hiện ngay"). */
  due: Date | null;
};

const WEEK = { weekStartsOn: 1 } as const; // Tuần tính từ Thứ 2
const dm = (d: Date) => format(d, "dd/MM");
const my = (d: Date) => format(d, "MM/yyyy");

function week(d: Date): ResolvedDeadline {
  const end = endOfWeek(d, WEEK);
  return { label: `Tuần ${dm(startOfWeek(d, WEEK))} – ${dm(end)}`, due: end };
}

function month(d: Date, prefix = "Tháng"): ResolvedDeadline {
  return { label: `${prefix} ${my(d)}`, due: lastDayOfMonth(d) };
}

/** Thứ N ("thu 4" = Thứ 4, "cn"/"chu nhat" = Chủ nhật) trong tuần chứa `base`. */
function weekday(base: Date, n: number): Date {
  return addDays(startOfWeek(base, WEEK), n === 8 ? 6 : n - 2);
}

/**
 * Quy "Thời hạn" chữ trong biên bản về ngày, tính từ ngày họp. Chỉ nhận các cách
 * viết quen thuộc; không nhận ra thì giữ nguyên chữ và không đặt hạn.
 */
export function resolveDeadline(
  text: string | null,
  meetingDate: string | Date,
): ResolvedDeadline | null {
  const raw = text?.trim();
  if (!raw) return null;
  const t = norm(raw);
  const base = new Date(meetingDate);

  // Ngày cụ thể: "25/10", "Trước 25/10/2026"
  const exact = /(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?/.exec(t);
  if (exact && +exact[1] <= 31 && +exact[2] <= 12) {
    const [d, m] = [+exact[1], +exact[2]];
    let due = new Date(exact[3] ? +exact[3] : base.getFullYear(), m - 1, d);
    if (!exact[3] && due < base) due = addMonths(due, 12);
    return { label: raw, due };
  }

  // Thứ trong tuần: "Thứ 4 hoặc thứ 5 tuần sau", "Thứ 6"
  const days = [...t.matchAll(/thu\s*([2-7])|\b(cn|chu nhat)\b/g)].map((m) =>
    m[1] ? +m[1] : 8,
  );
  if (days.length) {
    const next = /tuan\s*(sau|toi)/.test(t);
    let dates = days.map((n) => weekday(next ? addWeeks(base, 1) : base, n));
    // Không ghi tuần mà thứ đã qua so với ngày họp → hiểu là tuần sau
    if (!next && !/tuan\s*nay/.test(t) && dates[0] < base) {
      dates = dates.map((d) => addWeeks(d, 1));
    }
    const last = dates[dates.length - 1];
    return {
      label: dates.length > 1 ? `${dm(dates[0])} – ${dm(last)}` : dm(last),
      due: last,
    };
  }

  if (/\bmai\b/.test(t)) {
    const d = addDays(base, 1);
    const part = /\bsang\b/.test(t) ? "Sáng " : /\bchieu\b/.test(t) ? "Chiều " : "";
    return { label: `${part}${dm(d)}`, due: d };
  }
  if (/\bhom nay\b/.test(t)) return { label: dm(base), due: base };

  // "Trong vòng 3 ngày", "2-3 tuần": lấy mốc xa nhất
  const span = /(\d+)(?:\s*(?:-|–|den)\s*(\d+))?\s*(ngay|tuan|thang)/.exec(t);
  if (span) {
    const n = +(span[2] ?? span[1]);
    const due =
      span[3] === "ngay"
        ? addDays(base, n)
        : span[3] === "tuan"
          ? addWeeks(base, n)
          : addMonths(base, n);
    // "Tháng 10" có chữ tháng đứng trước số nên không lọt vào đây
    return { label: `Trước ${dm(due)}`, due };
  }

  if (/tuan\s*(sau|toi)/.test(t)) return week(addWeeks(base, 1));
  if (/tuan\s*nay|trong\s*tuan/.test(t)) return week(base);

  if (/thang\s*(sau|toi)/.test(t)) return month(addMonths(base, 1));
  if (/cuoi\s*thang/.test(t)) {
    const due = lastDayOfMonth(base);
    return { label: `Trước ${dm(due)}`, due };
  }
  if (/thang\s*nay|trong\s*thang/.test(t)) return month(base);

  // "Tháng 12", "Tháng 12/2026": đã qua tháng họp thì là năm sau
  const named = /thang\s*(\d{1,2})(?:[/.-](\d{4}))?/.exec(t);
  if (named) {
    const m = +named[1];
    const year = named[2]
      ? +named[2]
      : base.getFullYear() + (m < base.getMonth() + 1 ? 1 : 0);
    return month(new Date(year, m - 1, 1));
  }

  return { label: raw, due: null };
}

/** Hạn chót dạng lưu trong tasks.due_date (cùng cách form công việc lưu). */
export function dueIso(due: Date | null | undefined): string | null {
  return due ? new Date(format(due, "yyyy-MM-dd")).toISOString() : null;
}
