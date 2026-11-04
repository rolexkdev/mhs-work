/**
 * Kiểu dữ liệu DB viết tay khớp với supabase/migrations/0001_init.sql.
 *
 * Khi schema ổn định, có thể sinh tự động bằng:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 */

export type UserRole = "admin" | "leader" | "member";

export type MeetingStatus = "planned" | "ongoing" | "closed";

export type MeetingItemStatus = "open" | "in_progress" | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";

export type DocumentStatus =
  | "draft"
  | "in_transit"
  | "at_office"
  | "distributing"
  | "assigned"
  | "done"
  | "archived"
  | "delivered_external"
  | "lost";

export type HandoffKind = "collect" | "assign" | "forward" | "return";

export type HandoffStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type ShipmentMethod = "courier" | "company_car" | "hand" | "post";

export type ShipmentStatus = "in_transit" | "delivered" | "lost" | "cancelled";

export type ShipmentItemStatus =
  | "in_transit"
  | "received"
  | "lost"
  | "cancelled";

type Timestamps = {
  created_at: string;
};

// LƯU Ý: các Row type phải là `type` (object literal), KHÔNG dùng `interface`.
// Interface không có index signature ngầm nên không thỏa `Record<string, unknown>`
// mà supabase-js yêu cầu → query sẽ resolve thành `never`.
export type Office = Timestamps & {
  id: string;
  code: string;
  name: string;
  address: string | null;
};

export type Profile = Timestamps & {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  office_id: string | null;
  department: string | null;
};

export type Meeting = Timestamps & {
  id: string;
  title: string;
  description: string | null;
  meeting_date: string;
  status: MeetingStatus;
  created_by: string;
};

/** Đầu mục chỉ đạo trong 1 cuộc họp giao ban (0014). */
export type MeetingItem = Timestamps & {
  id: string;
  meeting_id: string;
  /** Mảng trong biên bản, VD "I. Mảng xử lý nước thải" */
  section: string | null;
  /** Hạng mục công việc, VD "Ống hóa chất Javel" */
  title: string | null;
  /** Nội dung chỉ đạo / hành động */
  content: string;
  /** Đơn vị phụ trách ghi trong biên bản */
  department: string | null;
  /** Thời hạn ghi trong biên bản (chữ tự do) */
  deadline: string | null;
  due_date: string | null;
  sort_order: number;
  status: MeetingItemStatus;
  /** Kết quả xử lý */
  result: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_by: string;
  updated_at: string;
};

export type Task = Timestamps & {
  id: string;
  meeting_id: string | null;
  /** Đầu mục cuộc họp sinh ra task này (0014). */
  meeting_item_id: string | null;
  title: string;
  description: string | null;
  /** Người phụ trách, ngang hàng nhau (0015). */
  assignee_ids: string[];
  /** Người đầu assignee_ids, DB tự đồng bộ. Code mới dùng assignee_ids. */
  assignee_id: string | null;
  created_by: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Tiến độ tự tính từ checklist (việc con). */
  progress: number;
  /** Tiến độ thủ công do chủ task báo cáo (dial tròn). */
  manual_progress: number;
  /** Lưu tiến độ trước khi hoàn thành, để khôi phục khi bỏ 'done'. */
  manual_progress_prev: number | null;
  start_date: string | null;
  due_date: string | null;
  // Trường theo "Công việc KCN" (Notion)
  department: string | null;
  category: string | null;
  latest_update: string | null;
  note: string | null;
  /** Việc lặp lại: luôn hiện ở mọi tuần. */
  recurrence: TaskRecurrence;
  /** Mốc hoàn thành (set khi status = done). */
  completed_at: string | null;
  /** Các tuần (yyyy-mm-dd của Thứ 2) admin ẩn task thủ công. */
  hidden_weeks: string[];
  updated_at: string;
};

export type TaskRecurrence = "none" | "daily" | "weekly";

export type TaskComment = Timestamps & {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
};

export type TaskChecklist = Timestamps & {
  id: string;
  task_id: string;
  content: string;
  is_done: boolean;
};

export type TaskAttachment = Timestamps & {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  uploaded_by: string;
};

export type TaskLog = Timestamps & {
  id: string;
  task_id: string;
  action: string;
  old_value: unknown | null;
  new_value: unknown | null;
  created_by: string | null;
};

/** Document record (0016). Named DocumentRecord to avoid clashing with DOM Document. */
export type DocumentRecord = Timestamps & {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  origin_office_id: string | null;
  current_office_id: string | null;
  current_holder_id: string | null;
  status: DocumentStatus;
  priority: TaskPriority;
  due_date: string | null;
  task_id: string | null;
  created_by: string;
  updated_at: string;
};

export type DocumentHandoff = Timestamps & {
  id: string;
  document_id: string;
  from_user: string;
  to_user: string;
  kind: HandoffKind;
  status: HandoffStatus;
  note: string | null;
  response_note: string | null;
  responded_at: string | null;
};

export type DocumentAttachment = Timestamps & {
  id: string;
  document_id: string | null;
  handoff_id: string | null;
  shipment_id: string | null;
  file_name: string;
  file_url: string;
  uploaded_by: string;
};

export type DocumentLog = Timestamps & {
  id: string;
  document_id: string;
  action: string;
  old_value: unknown | null;
  new_value: unknown | null;
  created_by: string | null;
};

export type DocumentHolder = {
  document_id: string;
  user_id: string;
  office_id: string | null;
  accepted_at: string | null;
  handoff_id: string;
};

export type ExternalUnit = Timestamps & {
  id: string;
  name: string;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  note: string | null;
  is_active: boolean;
  created_by: string;
  updated_at: string;
};

export type DocumentShipment = Timestamps & {
  id: string;
  code: string;
  method: ShipmentMethod;
  carrier: string | null;
  tracking_no: string | null;
  driver_note: string | null;
  from_office_id: string;
  to_office_id: string | null;
  to_external_unit_id: string | null;
  recipient_name: string | null;
  note: string | null;
  status: ShipmentStatus;
  sent_by: string;
  sent_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type DocumentShipmentItem = {
  shipment_id: string;
  document_id: string;
  status: ShipmentItemStatus;
  prev_status: DocumentStatus;
  received_by: string | null;
  received_at: string | null;
  lost_reason: string | null;
  note: string | null;
};

type Row<T> = T;
type Insert<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;
type Update<T> = Partial<T>;

type Rel = {
  foreignKeyName: string;
  columns: string[];
  referencedRelation: string;
  referencedColumns: string[];
  isOneToOne?: boolean;
};

export interface Database {
  public: {
    Tables: {
      offices: {
        Row: Row<Office>;
        Insert: Insert<Office, "id" | "created_at" | "address">;
        Update: Update<Office>;
        Relationships: Rel[];
      };
      profiles: {
        Row: Row<Profile>;
        Insert: Insert<
          Profile,
          | "created_at"
          | "full_name"
          | "avatar_url"
          | "role"
          | "office_id"
          | "department"
        >;
        Update: Update<Profile>;
        Relationships: Rel[];
      };
      meetings: {
        Row: Row<Meeting>;
        Insert: Insert<
          Meeting,
          "id" | "created_at" | "description" | "status"
        >;
        Update: Update<Meeting>;
        Relationships: Rel[];
      };
      meeting_items: {
        Row: Row<MeetingItem>;
        Insert: Insert<
          MeetingItem,
          | "id"
          | "created_at"
          | "updated_at"
          | "created_by"
          | "section"
          | "title"
          | "department"
          | "deadline"
          | "due_date"
          | "sort_order"
          | "status"
          | "result"
          | "handled_by"
          | "handled_at"
        >;
        Update: Update<MeetingItem>;
        Relationships: Rel[];
      };
      tasks: {
        Row: Row<Task>;
        Insert: Insert<
          Task,
          | "id"
          | "created_at"
          | "updated_at"
          | "description"
          | "meeting_id"
          | "meeting_item_id"
          | "assignee_id"
          | "assignee_ids"
          | "priority"
          | "status"
          | "progress"
          | "manual_progress"
          | "manual_progress_prev"
          | "start_date"
          | "due_date"
          | "department"
          | "category"
          | "latest_update"
          | "note"
          | "recurrence"
          | "completed_at"
          | "hidden_weeks"
        >;
        Update: Update<Task>;
        Relationships: Rel[];
      };
      task_comments: {
        Row: Row<TaskComment>;
        Insert: Insert<TaskComment, "id" | "created_at">;
        Update: Update<TaskComment>;
        Relationships: Rel[];
      };
      task_checklists: {
        Row: Row<TaskChecklist>;
        Insert: Insert<TaskChecklist, "id" | "created_at" | "is_done">;
        Update: Update<TaskChecklist>;
        Relationships: Rel[];
      };
      task_attachments: {
        Row: Row<TaskAttachment>;
        Insert: Insert<TaskAttachment, "id" | "created_at">;
        Update: Update<TaskAttachment>;
        Relationships: Rel[];
      };
      task_logs: {
        Row: Row<TaskLog>;
        Insert: Insert<TaskLog, "id" | "created_at">;
        Update: Update<TaskLog>;
        Relationships: Rel[];
      };
      documents: {
        Row: Row<DocumentRecord>;
        Insert: Insert<
          DocumentRecord,
          | "id"
          | "code"
          | "description"
          | "category"
          | "origin_office_id"
          | "current_office_id"
          | "current_holder_id"
          | "status"
          | "priority"
          | "due_date"
          | "task_id"
          | "created_by"
          | "created_at"
          | "updated_at"
        >;
        Update: Update<DocumentRecord>;
        Relationships: Rel[];
      };
      document_handoffs: {
        Row: Row<DocumentHandoff>;
        Insert: Insert<
          DocumentHandoff,
          | "id"
          | "status"
          | "note"
          | "response_note"
          | "created_at"
          | "responded_at"
        >;
        Update: Update<DocumentHandoff>;
        Relationships: Rel[];
      };
      document_attachments: {
        Row: Row<DocumentAttachment>;
        Insert: Insert<
          DocumentAttachment,
          | "id"
          | "document_id"
          | "handoff_id"
          | "shipment_id"
          | "uploaded_by"
          | "created_at"
        >;
        Update: Update<DocumentAttachment>;
        Relationships: Rel[];
      };
      document_logs: {
        Row: Row<DocumentLog>;
        Insert: Insert<
          DocumentLog,
          "id" | "old_value" | "new_value" | "created_by" | "created_at"
        >;
        Update: Update<DocumentLog>;
        Relationships: Rel[];
      };
      external_units: {
        Row: Row<ExternalUnit>;
        Insert: Insert<
          ExternalUnit,
          | "id"
          | "address"
          | "contact_name"
          | "phone"
          | "note"
          | "is_active"
          | "created_by"
          | "created_at"
          | "updated_at"
        >;
        Update: Update<ExternalUnit>;
        Relationships: Rel[];
      };
      document_shipments: {
        Row: Row<DocumentShipment>;
        Insert: Insert<
          DocumentShipment,
          | "id"
          | "code"
          | "carrier"
          | "tracking_no"
          | "driver_note"
          | "to_office_id"
          | "to_external_unit_id"
          | "recipient_name"
          | "note"
          | "status"
          | "sent_at"
          | "completed_at"
          | "created_at"
          | "updated_at"
        >;
        Update: Update<DocumentShipment>;
        Relationships: Rel[];
      };
      document_shipment_items: {
        Row: Row<DocumentShipmentItem>;
        Insert: Insert<
          DocumentShipmentItem,
          "status" | "received_by" | "received_at" | "lost_reason" | "note"
        >;
        Update: Update<DocumentShipmentItem>;
        Relationships: Rel[];
      };
    };
    Views: {
      document_holders: {
        Row: Row<DocumentHolder>;
        Relationships: Rel[];
      };
    };
    Functions: {
      create_handoff: {
        Args: {
          p_document_id: string;
          p_to_users: string[];
          p_kind: HandoffKind;
          p_note?: string | null;
        };
        Returns: DocumentHandoff[];
      };
      respond_handoff: {
        Args: {
          p_handoff_id: string;
          p_accept: boolean;
          p_note?: string | null;
        };
        Returns: DocumentHandoff;
      };
      cancel_handoff: {
        Args: {
          p_handoff_id: string;
          p_note?: string | null;
        };
        Returns: DocumentHandoff;
      };
      create_shipment: {
        Args: {
          p_document_ids: string[];
          p_method: ShipmentMethod;
          p_to_office_id?: string | null;
          p_to_external_unit_id?: string | null;
          p_carrier?: string | null;
          p_tracking_no?: string | null;
          p_driver_note?: string | null;
          p_note?: string | null;
          p_from_office_id?: string | null;
        };
        Returns: DocumentShipment;
      };
      confirm_shipment_items: {
        Args: {
          p_shipment_id: string;
          p_document_ids: string[];
          p_recipient_name?: string | null;
          p_note?: string | null;
        };
        Returns: DocumentShipment;
      };
      mark_document_lost: {
        Args: {
          p_document_id: string;
          p_reason: string;
        };
        Returns: DocumentRecord;
      };
      cancel_shipment: {
        Args: {
          p_shipment_id: string;
          p_note?: string | null;
        };
        Returns: DocumentShipment;
      };
    };
    Enums: {
      user_role: UserRole;
      meeting_status: MeetingStatus;
      meeting_item_status: MeetingItemStatus;
      task_priority: TaskPriority;
      task_status: TaskStatus;
      document_status: DocumentStatus;
      handoff_kind: HandoffKind;
      handoff_status: HandoffStatus;
      shipment_method: ShipmentMethod;
      shipment_status: ShipmentStatus;
      shipment_item_status: ShipmentItemStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
