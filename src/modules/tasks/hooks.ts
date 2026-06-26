"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { Task, Database } from "@/types/database";

type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export interface TaskQueryFilters {
  meetingId?: string | null;
  assigneeId?: string | null;
  status?: Task["status"] | null;
  priority?: Task["priority"] | null;
}

export function useTasks(filters: TaskQueryFilters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks(filters),
    queryFn: async (): Promise<Task[]> => {
      const supabase = createClient();
      let q = supabase.from("tasks").select("*");
      if (filters.meetingId) q = q.eq("meeting_id", filters.meetingId);
      if (filters.assigneeId) q = q.eq("assignee_id", filters.assigneeId);
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
  assignee_id?: string | null;
  priority?: Task["priority"];
  status?: Task["status"];
  start_date?: string | null;
  due_date?: string | null;
  department?: string | null;
  category?: string | null;
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
        assignee_id: input.assignee_id ?? null,
        priority: input.priority ?? "medium",
        status: input.status ?? "todo",
        start_date: input.start_date ?? null,
        due_date: input.due_date ?? null,
        department: input.department ?? null,
        category: input.category ?? null,
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
    onError: (e: Error) => toast.error(e.message),
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
    // Optimistic update để Kanban kéo-thả mượt
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      for (const [key, list] of snapshots) {
        if (!list) continue;
        qc.setQueryData<Task[]>(
          key,
          list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        );
      }
      return { snapshots };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, list]) => qc.setQueryData(key, list));
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
      toast.success("Đã xoá công việc");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
