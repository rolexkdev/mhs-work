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

type Timestamps = {
  created_at: string;
};

// LƯU Ý: các Row type phải là `type` (object literal), KHÔNG dùng `interface`.
// Interface không có index signature ngầm nên không thỏa `Record<string, unknown>`
// mà supabase-js yêu cầu → query sẽ resolve thành `never`.
export type Profile = Timestamps & {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  /** Admin can toggle this in /accounts; grants document progress actions (0017). */
  is_doc_manager: boolean;
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

export type DocumentEventAction =
  | "created"
  | "edit"
  | "route"
  | "send"
  | "forward"
  | "return"
  | "resend"
  | "finish_early"
  | "undo";

/** A paper document tracked through departments (0017). */
export type DocumentRecord = Timestamps & {
  id: string;
  name: string;
  sender_id: string | null;
  note: string | null;
  created_by: string | null;
  /** Completion marker written only by the progress RPCs. Status derives from it. */
  finished_at: string | null;
};

/** One step of a document route (0017). */
export type DocumentStep = Timestamps & {
  id: string;
  document_id: string;
  step_order: number;
  department: string;
  received_at: string | null;
  done_at: string | null;
  /** Set when the step returns the document; cleared on resend. */
  returned_at: string | null;
  handler_name: string | null;
  note: string | null;
};

/** Append-only action log, written only by RPCs and triggers (0017). */
export type DocumentEvent = Timestamps & {
  id: string;
  document_id: string;
  action: DocumentEventAction;
  step_order: number | null;
  department: string | null;
  handler_name: string | null;
  note: string | null;
  payload: unknown | null;
  undo_data: unknown | null;
  undo_of: string | null;
  created_by: string | null;
};

/** Sender fields embedded with a document. */
export type DocumentSender = Pick<
  Profile,
  "id" | "full_name" | "email" | "avatar_url"
>;

/** Document row with its route and sender, as loaded by useDocuments(). */
export type DocumentWithSteps = DocumentRecord & {
  sender: DocumentSender | null;
  steps: DocumentStep[];
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
      profiles: {
        Row: Row<Profile>;
        Insert: Insert<
          Profile,
          "created_at" | "full_name" | "avatar_url" | "role" | "is_doc_manager"
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
        // created_by and sender_id default to the caller in the database.
        Insert: Insert<
          DocumentRecord,
          | "id"
          | "created_at"
          | "created_by"
          | "sender_id"
          | "note"
          | "finished_at"
        >;
        Update: Update<DocumentRecord>;
        Relationships: Rel[];
      };
      document_steps: {
        Row: Row<DocumentStep>;
        Insert: Insert<
          DocumentStep,
          | "id"
          | "created_at"
          | "received_at"
          | "done_at"
          | "returned_at"
          | "handler_name"
          | "note"
        >;
        Update: Update<DocumentStep>;
        Relationships: Rel[];
      };
      document_events: {
        Row: Row<DocumentEvent>;
        Insert: Insert<
          DocumentEvent,
          | "id"
          | "created_at"
          | "step_order"
          | "department"
          | "handler_name"
          | "note"
          | "payload"
          | "undo_data"
          | "undo_of"
          | "created_by"
        >;
        Update: Update<DocumentEvent>;
        Relationships: Rel[];
      };
    };
    Views: Record<string, never>;
    Functions: {
      can_manage_documents: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      doc_set_route: {
        Args: { p_document_id: string; p_departments: string[] };
        Returns: undefined;
      };
      doc_send: {
        Args: { p_document_id: string; p_note?: string | null };
        Returns: undefined;
      };
      // p_step_id / p_event_id: the current step or latest event the client
      // saw; the RPC rejects the call if it changed meanwhile.
      doc_forward: {
        Args: {
          p_document_id: string;
          p_step_id: string;
          p_handler_name?: string | null;
          p_note?: string | null;
        };
        Returns: undefined;
      };
      doc_return: {
        Args: { p_document_id: string; p_step_id: string; p_reason: string };
        Returns: undefined;
      };
      doc_resend: {
        Args: { p_document_id: string; p_step_id: string; p_note?: string | null };
        Returns: undefined;
      };
      doc_finish_early: {
        Args: {
          p_document_id: string;
          p_step_id: string;
          p_handler_name?: string | null;
          p_note?: string | null;
        };
        Returns: undefined;
      };
      doc_undo: {
        Args: { p_document_id: string; p_event_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      meeting_status: MeetingStatus;
      meeting_item_status: MeetingItemStatus;
      task_priority: TaskPriority;
      task_status: TaskStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
