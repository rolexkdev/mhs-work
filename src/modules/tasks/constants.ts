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
 * Phòng/Nhóm, Hạng mục, Người phụ trách...
 */
export type TagColor =
  | "gray"
  | "blue"
  | "green"
  | "orange"
  | "red"
  | "purple"
  | "brown"
  | "pink"
  | "sky"
  | "yellow";

export const TAG_COLOR_CLASS: Record<TagColor, string> = {
  gray: "bg-slate-100 text-slate-700 border-slate-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  red: "bg-red-100 text-red-700 border-red-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  brown: "bg-amber-100 text-amber-800 border-amber-200",
  pink: "bg-pink-100 text-pink-700 border-pink-200",
  sky: "bg-sky-100 text-sky-700 border-sky-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
};

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

/** Thứ tự trạng thái hiển thị (Chưa bắt đầu → Đang làm → Dừng → Chờ duyệt → Xong). */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
];

// ----- Phòng/Nhóm -----
export const DEPARTMENTS: { value: string; color: TagColor }[] = [
  { value: "Cây xanh", color: "green" },
  { value: "Hạ tầng", color: "orange" },
  { value: "Nguyên Vũ", color: "brown" },
  { value: "Môi trường", color: "blue" },
  { value: "NM Xử lý nước thải", color: "red" },
  { value: "NM Cấp nước", color: "purple" },
  { value: "Hành chính", color: "gray" },
];

// ----- Hạng mục -----
export const CATEGORIES: { value: string; color: TagColor }[] = [
  { value: "HC", color: "blue" },
  { value: "IT", color: "purple" },
  { value: "Bảo trì", color: "green" },
];

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
