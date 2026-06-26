"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { TaskChecklist } from "@/types/database";

const key = (taskId: string) => ["checklists", taskId] as const;

export function useChecklists(taskId: string | null) {
  return useQuery({
    queryKey: key(taskId ?? ""),
    queryFn: async (): Promise<TaskChecklist[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_checklists")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!taskId,
  });
}

export function useAddChecklist(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("task_checklists")
        .insert({ task_id: taskId, content });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(taskId) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleChecklist(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_done }: { id: string; is_done: boolean }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("task_checklists")
        .update({ is_done })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_done }) => {
      await qc.cancelQueries({ queryKey: key(taskId) });
      const prev = qc.getQueryData<TaskChecklist[]>(key(taskId));
      qc.setQueryData<TaskChecklist[]>(key(taskId), (list) =>
        (list ?? []).map((c) => (c.id === id ? { ...c, is_done } : c)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key(taskId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key(taskId) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteChecklist(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("task_checklists")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(taskId) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
