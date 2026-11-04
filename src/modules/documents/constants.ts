import {
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
} from "@/modules/tasks/constants";
import type {
  DocumentStatus,
  HandoffKind,
  HandoffStatus,
  TaskPriority,
} from "@/types/database";

export type DocumentMeta = {
  label: string;
  badge: string;
  dot: string;
};

export const DOCUMENT_STATUS_META: Record<DocumentStatus, DocumentMeta> = {
  draft: {
    label: "Mới tạo",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  },
  at_office: {
    label: "Tại văn phòng",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  distributing: {
    label: "Đang phân phối",
    badge: "bg-purple-100 text-purple-700 border-purple-200",
    dot: "bg-purple-500",
  },
  assigned: {
    label: "Đã phân công",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  done: {
    label: "Hoàn thành",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  archived: {
    label: "Lưu trữ",
    badge: "bg-zinc-100 text-zinc-600 border-zinc-200",
    dot: "bg-zinc-400",
  },
};

export const DOCUMENT_STATUS_ORDER: DocumentStatus[] = [
  "draft",
  "at_office",
  "distributing",
  "assigned",
  "done",
  "archived",
];

export const NON_HANDOFFABLE_DOCUMENT_STATUSES: ReadonlySet<DocumentStatus> =
  new Set<DocumentStatus>(["archived"]);

export const HANDOFF_KIND_META: Record<
  HandoffKind,
  DocumentMeta & { description: string }
> = {
  collect: {
    label: "Tổng hợp",
    description: "Thu nhận hồ sơ về văn phòng / đầu mối điều phối",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  assign: {
    label: "Phân công",
    description: "Giao hồ sơ cho phòng ban hoặc người phụ trách xử lý",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  forward: {
    label: "Chuyển tiếp",
    description: "Chuyển tiếp hồ sơ cho người khác tiếp tục xử lý",
    badge: "bg-purple-100 text-purple-700 border-purple-200",
    dot: "bg-purple-500",
  },
  return: {
    label: "Trả lại",
    description: "Trả hồ sơ về cho người điều phối hoặc văn phòng",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
  },
};

export const HANDOFF_KIND_ORDER: HandoffKind[] = ["assign", "forward"];

export const HANDOFF_STATUS_META: Record<HandoffStatus, DocumentMeta> = {
  pending: {
    label: "Chờ xác nhận",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  accepted: {
    label: "Đã nhận",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Từ chối",
    badge: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
  cancelled: {
    label: "Đã huỷ",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
};

export const HANDOFF_STATUS_ORDER: HandoffStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
];

export const DOCUMENT_LOG_ACTION_LABELS: Record<string, string> = {
  created: "Tạo hồ sơ",
  status: "Đổi trạng thái",
  current_holder_id: "Chuyển người giữ chính",
  title: "Đổi tiêu đề",
  handoff_created: "Tạo lượt bàn giao",
  handoff_accepted: "Xác nhận nhận bàn giao",
  handoff_rejected: "Từ chối bàn giao",
  handoff_cancelled: "Huỷ bàn giao",
  shipment_sent: "Gửi vận chuyển",
  shipment_received: "Xác nhận nhận vận chuyển",
  shipment_lost: "Thất lạc trong chuyến vận chuyển",
  shipment_cancelled: "Huỷ chuyến vận chuyển",
  marked_lost: "Báo thất lạc hồ sơ",
};

// Reuse task priority labels and badge colors
export const DOCUMENT_PRIORITY_META: Record<TaskPriority, DocumentMeta> =
  TASK_PRIORITY_META;
export const DOCUMENT_PRIORITY_ORDER: TaskPriority[] = TASK_PRIORITY_ORDER;

export const DOCUMENT_CATEGORY_SUGGESTIONS = [
  "Công văn đến",
  "Công văn đi",
  "Tờ trình",
  "Hợp đồng",
  "Biên bản",
  "Hồ sơ thanh toán",
  "Hồ sơ pháp lý",
  "Khác",
] as const;
