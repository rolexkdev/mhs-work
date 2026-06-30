/**
 * Kiểu dữ liệu DB viết tay khớp với supabase/migrations/0001_init.sql.
 *
 * Khi schema ổn định, có thể sinh tự động bằng:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 */

export type UserRole = "admin" | "leader" | "member";

export type MeetingStatus = "planned" | "ongoing" | "closed";

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
};

export type Meeting = Timestamps & {
  id: string;
  title: string;
  description: string | null;
  meeting_date: string;
  status: MeetingStatus;
  created_by: string;
};

export type Task = Timestamps & {
  id: string;
  meeting_id: string | null;
  title: string;
  description: string | null;
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
          "created_at" | "full_name" | "avatar_url" | "role"
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
      tasks: {
        Row: Row<Task>;
        Insert: Insert<
          Task,
          | "id"
          | "created_at"
          | "updated_at"
          | "description"
          | "meeting_id"
          | "assignee_id"
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      meeting_status: MeetingStatus;
      task_priority: TaskPriority;
      task_status: TaskStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
