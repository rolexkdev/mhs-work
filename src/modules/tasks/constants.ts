import type {
  TaskStatus,
  TaskPriority,
  MeetingStatus,
} from "@/types/database";

type Meta = {
  label: string;
  /** class cho badge/cột (nền nhạt + chữ đậm) */
  badge: string;
  /** class cho chấm tròn / accent */
  dot: string;
};

export const TASK_STATUS_META: Record<TaskStatus, Meta> = {
  todo: {
    label: "Cần làm",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  },
  in_progress: {
    label: "Đang làm",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  review: {
    label: "Chờ duyệt",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  done: {
    label: "Hoàn thành",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  blocked: {
    label: "Bị chặn",
    badge: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

/** Thứ tự cột trên Kanban */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
];

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
