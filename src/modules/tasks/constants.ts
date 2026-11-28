import type {
  TaskStatus,
  TaskPriority,
  TaskRecurrence,
  MeetingStatus,
} from "@/types/database";

type Meta = {
  label: string;
  /** class cho badge/cột (nền nhạt + chữ đậm) */
  badge: string;
  /** class cho chấm tròn / accent */
  dot: string;
};

/**
 * Bảng màu pill kiểu Notion (nền nhạt + chữ đậm) cho các trường select:
 * Phòng/Nhóm, Người phụ trách...
 */
export type TagColor =
  | "gray"
  | "blue"
  | "green"
  | "orange"
  | "red"
  | "crimson"
  | "purple"
  | "brown"
  | "pink"
  | "sky"
  | "yellow"
  | "teal";

export const TAG_COLOR_CLASS: Record<TagColor, string> = {
  gray: "bg-slate-100 text-slate-700 border-slate-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  red: "bg-red-100 text-red-700 border-red-200",
  crimson: "bg-red-200 text-red-900 border-red-400",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  brown: "bg-amber-100 text-amber-800 border-amber-200",
  pink: "bg-pink-100 text-pink-700 border-pink-200",
  sky: "bg-sky-100 text-sky-700 border-sky-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
};

/**
 * Stronger accents of a tag color, for section headers and icon tiles where
 * the pill colors are too faint. Class names stay literal so Tailwind sees them.
 */
export const TAG_ACCENT_CLASS: Record<
  TagColor,
  {
    /** Tinted background + matching border. */
    soft: string;
    /** Bold text on the tinted background. */
    text: string;
    /** Solid fill (dot, swatch). */
    solid: string;
    /** Left / top border of a block. */
    borderL: string;
    borderT: string;
    /** Hover border of a card. */
    hover: string;
    /** Border color of a department frame. */
    frame: string;
    /** Solid header bar of a department frame, with readable text. */
    header: string;
    /** Background inside a department frame. */
    body: string;
    /** SVG stroke (progress ring). */
    stroke: string;
  }
> = {
  gray: {
    soft: "bg-slate-50 border-slate-200",
    text: "text-slate-800",
    solid: "bg-slate-500",
    borderL: "border-l-slate-500",
    borderT: "border-t-slate-500",
    hover: "hover:border-slate-400",
    frame: "border-slate-400",
    header: "bg-slate-600 text-white",
    body: "bg-slate-50",
    stroke: "stroke-slate-500",
  },
  blue: {
    soft: "bg-blue-50 border-blue-200",
    text: "text-blue-800",
    solid: "bg-blue-500",
    borderL: "border-l-blue-500",
    borderT: "border-t-blue-500",
    hover: "hover:border-blue-400",
    frame: "border-blue-400",
    header: "bg-blue-600 text-white",
    body: "bg-blue-50",
    stroke: "stroke-blue-500",
  },
  green: {
    soft: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
    solid: "bg-emerald-500",
    borderL: "border-l-emerald-500",
    borderT: "border-t-emerald-500",
    hover: "hover:border-emerald-400",
    frame: "border-emerald-400",
    header: "bg-emerald-600 text-white",
    body: "bg-emerald-50",
    stroke: "stroke-emerald-500",
  },
  orange: {
    soft: "bg-orange-50 border-orange-200",
    text: "text-orange-800",
    solid: "bg-orange-500",
    borderL: "border-l-orange-500",
    borderT: "border-t-orange-500",
    hover: "hover:border-orange-400",
    frame: "border-orange-400",
    header: "bg-orange-500 text-white",
    body: "bg-orange-50",
    stroke: "stroke-orange-500",
  },
  red: {
    soft: "bg-red-50 border-red-200",
    text: "text-red-800",
    solid: "bg-red-500",
    borderL: "border-l-red-500",
    borderT: "border-t-red-500",
    hover: "hover:border-red-400",
    frame: "border-red-400",
    header: "bg-red-600 text-white",
    body: "bg-red-50",
    stroke: "stroke-red-500",
  },
  crimson: {
    soft: "bg-red-100 border-red-300",
    text: "text-red-900",
    solid: "bg-red-800",
    borderL: "border-l-red-800",
    borderT: "border-t-red-800",
    hover: "hover:border-red-700",
    frame: "border-red-800",
    header: "bg-red-800 text-white",
    body: "bg-red-50",
    stroke: "stroke-red-800",
  },
  purple: {
    soft: "bg-purple-50 border-purple-200",
    text: "text-purple-800",
    solid: "bg-purple-500",
    borderL: "border-l-purple-500",
    borderT: "border-t-purple-500",
    hover: "hover:border-purple-400",
    frame: "border-purple-400",
    header: "bg-purple-600 text-white",
    body: "bg-purple-50",
    stroke: "stroke-purple-500",
  },
  brown: {
    soft: "bg-amber-50 border-amber-200",
    text: "text-amber-900",
    solid: "bg-amber-600",
    borderL: "border-l-amber-600",
    borderT: "border-t-amber-600",
    hover: "hover:border-amber-500",
    frame: "border-amber-600",
    header: "bg-amber-700 text-white",
    body: "bg-amber-50",
    stroke: "stroke-amber-600",
  },
  pink: {
    soft: "bg-pink-50 border-pink-200",
    text: "text-pink-800",
    solid: "bg-pink-500",
    borderL: "border-l-pink-500",
    borderT: "border-t-pink-500",
    hover: "hover:border-pink-400",
    frame: "border-pink-400",
    header: "bg-pink-600 text-white",
    body: "bg-pink-50",
    stroke: "stroke-pink-500",
  },
  sky: {
    soft: "bg-sky-50 border-sky-200",
    text: "text-sky-800",
    solid: "bg-sky-500",
    borderL: "border-l-sky-500",
    borderT: "border-t-sky-500",
    hover: "hover:border-sky-400",
    frame: "border-sky-400",
    header: "bg-sky-600 text-white",
    body: "bg-sky-50",
    stroke: "stroke-sky-500",
  },
  yellow: {
    soft: "bg-yellow-50 border-yellow-200",
    text: "text-yellow-900",
    solid: "bg-yellow-500",
    borderL: "border-l-yellow-500",
    borderT: "border-t-yellow-500",
    hover: "hover:border-yellow-400",
    frame: "border-yellow-400",
    header: "bg-yellow-400 text-yellow-950",
    body: "bg-yellow-50",
    stroke: "stroke-yellow-500",
  },
  teal: {
    soft: "bg-teal-50 border-teal-200",
    text: "text-teal-800",
    solid: "bg-teal-500",
    borderL: "border-l-teal-500",
    borderT: "border-t-teal-500",
    hover: "hover:border-teal-400",
    frame: "border-teal-400",
    header: "bg-teal-600 text-white",
    body: "bg-teal-50",
    stroke: "stroke-teal-500",
  },
};

/** Every tag color, in the order the category color picker shows them. */
export const TAG_COLORS: TagColor[] = [
  "blue",
  "sky",
  "teal",
  "green",
  "yellow",
  "orange",
  "brown",
  "red",
  "crimson",
  "pink",
  "purple",
  "gray",
];

export function isTagColor(v: unknown): v is TagColor {
  return typeof v === "string" && (TAG_COLORS as string[]).includes(v);
}

/**
 * Default colors of new categories, in order. Keep in sync with the backfill
 * in supabase/migrations/0031_task_categories.sql.
 */
export const CATEGORY_PALETTE: TagColor[] = [
  "blue",
  "orange",
  "purple",
  "green",
  "pink",
  "teal",
  "yellow",
  "sky",
  "brown",
  "red",
];

/** Color a leader picked for a category; blue if the value is unknown. */
export function categoryColor(category: { color: string }): TagColor {
  return isTagColor(category.color) ? category.color : "blue";
}

/** Suggested color for a new category: the first palette color its department does not use yet. */
export function nextCategoryColor(existing: { color: string }[]): TagColor {
  const used = new Set(existing.map((c) => c.color));
  return (
    CATEGORY_PALETTE.find((c) => !used.has(c)) ??
    CATEGORY_PALETTE[existing.length % CATEGORY_PALETTE.length]
  );
}

// ----- Trạng thái (đặt theo Notion "Công việc KCN") -----
// Lưu ý: giá trị lưu trong DB vẫn là mã nội bộ (todo/in_progress/blocked/done);
// nhãn hiển thị theo Notion. "Đang trễ hạn" được suy ra từ Ngày kết thúc.
export const TASK_STATUS_META: Record<TaskStatus, Meta> = {
  todo: {
    label: "✏️ Chưa bắt đầu",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  },
  in_progress: {
    label: "🛠️ Đang thực hiện",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  blocked: {
    label: "⏸️ Đang dừng lại",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
  },
  done: {
    label: "✅ Hoàn thành",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  review: {
    label: "👀 Chờ duyệt",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
};

/** Status label without the leading emoji (for places that already show an icon badge). */
export function statusLabelPlain(status: TaskStatus): string {
  return TASK_STATUS_META[status].label.replace(/^\S+\s+/, "");
}

/** Thứ tự trạng thái hiển thị (Chưa bắt đầu → Đang làm → Dừng → Chờ duyệt → Xong). */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
];

// ----- Phòng/Nhóm -----
export const DEPARTMENTS: {
  value: string;
  color: TagColor;
  /** Used for documents only; not offered for new tasks. */
  documentOnly?: boolean;
}[] = [
  { value: "Ban lãnh đạo", color: "pink" },
  { value: "Cây xanh", color: "green" },
  { value: "Hành chính", color: "gray" },
  { value: "Hạ tầng", color: "orange" },
  { value: "IT", color: "teal" },
  { value: "Kế toán", color: "sky", documentOnly: true },
  { value: "Môi trường", color: "blue" },
  { value: "Nguyên Vũ", color: "brown" },
  { value: "NM Cấp nước", color: "purple" },
  { value: "NM Xử lý nước thải", color: "red" },
  { value: "PCCC", color: "crimson" },
  { value: "Pháp chế", color: "yellow", documentOnly: true },
];

/** Departments a task can be assigned to (DEPARTMENTS minus the document-only ones). */
export const TASK_DEPARTMENTS = DEPARTMENTS.filter((d) => !d.documentOnly);

/**
 * TASK_DEPARTMENTS plus the task's current department when it is a
 * document-only one, so older tasks keep showing their department.
 */
export function taskDepartmentsFor(current: string | null) {
  const legacy =
    current && !TASK_DEPARTMENTS.some((d) => d.value === current)
      ? DEPARTMENTS.find((d) => d.value === current)
      : undefined;
  return legacy ? [...TASK_DEPARTMENTS, legacy] : TASK_DEPARTMENTS;
}

export function colorOf(
  options: { value: string; color: TagColor }[],
  value: string | null,
): TagColor {
  return options.find((o) => o.value === value)?.color ?? "gray";
}

// ----- Độ ưu tiên (giữ cho tương thích, không hiển thị trong bảng KCN) -----
export const TASK_PRIORITY_META: Record<TaskPriority, Meta> = {
  low: {
    label: "Thấp",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  medium: {
    label: "Trung bình",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  high: {
    label: "Cao",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
  },
  urgent: {
    label: "Khẩn cấp",
    badge: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

export const TASK_PRIORITY_ORDER: TaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
];

// ----- Lặp lại -----
export const RECURRENCE_LABEL: Record<TaskRecurrence, string> = {
  none: "Không lặp",
  daily: "Hàng ngày",
  weekly: "Hàng tuần",
};
export const RECURRENCE_ORDER: TaskRecurrence[] = ["none", "daily", "weekly"];

export const MEETING_STATUS_META: Record<MeetingStatus, Meta> = {
  planned: {
    label: "Dự kiến",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  },
  ongoing: {
    label: "Đang diễn ra",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  closed: {
    label: "Đã chốt",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
};
