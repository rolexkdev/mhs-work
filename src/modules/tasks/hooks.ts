"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import type { Task, Database } from "@/types/database";

type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export interface TaskQueryFilters {
  meetingId?: string | null;
  assigneeId?: string | null;
  status?: Task["status"] | null;
  priority?: Task["priority"] | null;
  /** Also return trashed tasks (the meeting page needs them to hide items). */
  withDeleted?: boolean;
}

export function useTasks(filters: TaskQueryFilters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks(filters),
    queryFn: async (): Promise<Task[]> => {
      const supabase = createClient();
      let q = supabase.from("tasks").select("*");
      if (!filters.withDeleted) q = q.is("deleted_at", null);
      if (filters.meetingId) q = q.eq("meeting_id", filters.meetingId);
      if (filters.assigneeId) q = q.contains("assignee_ids", [filters.assigneeId]);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.priority) q = q.eq("priority", filters.priority);
      const { data, error } = await q.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: queryKeys.task(id ?? ""),
    queryFn: async (): Promise<Task | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  meeting_id?: string | null;
  meeting_item_id?: string | null;
  assignee_ids?: string[];
  priority?: Task["priority"];
  status?: Task["status"];
  start_date?: string | null;
  due_date?: string | null;
  department?: string | null;
  latest_update?: string | null;
  note?: string | null;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");

      const payload: TaskInsert = {
        title: input.title,
        description: input.description ?? null,
        meeting_id: input.meeting_id ?? null,
        meeting_item_id: input.meeting_item_id ?? null,
        assignee_ids: input.assignee_ids ?? [],
        priority: input.priority ?? "medium",
        status: input.status ?? "todo",
        start_date: input.start_date ?? null,
        due_date: input.due_date ?? null,
        department: input.department ?? null,
        latest_update: input.latest_update ?? null,
        note: input.note ?? null,
        created_by: user.id,
      };
      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
      toast.success("Đã tạo công việc");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & TaskUpdate) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    // Optimistic update để Kanban kéo-thả / dial tiến độ mượt.
    // Khớp cả query danh sách (mảng Task) lẫn query chi tiết (1 Task).
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = qc.getQueriesData({ queryKey: ["tasks"] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        if (Array.isArray(data)) {
          qc.setQueryData<Task[]>(
            key,
            (data as Task[]).map((t) =>
              t.id === id ? { ...t, ...patch } : t,
            ),
          );
        } else if ((data as Task).id === id) {
          qc.setQueryData<Task>(key, { ...(data as Task), ...patch });
        }
      }
      return { snapshots };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, list]) => qc.setQueryData(key, list));
      toast.error(friendlyError(e));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/** Moves a task to the trash; an admin can restore it from /tasks/trash. */
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("task_trash", { p_ids: [id] });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
      toast.success("Đã chuyển công việc vào thùng rác");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Trashed tasks, most recently deleted first. */
export function useTrashedTasks() {
  return useQuery({
    queryKey: queryKeys.taskTrash,
    queryFn: async (): Promise<Task[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("task_restore", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
      toast.success("Đã khôi phục công việc");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Deletes a trashed task for good (admin only, enforced by RLS). */
export function usePurgeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id)
        .not("deleted_at", "is", null)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Không có quyền xoá vĩnh viễn công việc này");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Đã xoá vĩnh viễn công việc");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
