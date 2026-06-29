"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TaskLog } from "@/types/database";

/** Lịch sử thay đổi của 1 task (mới nhất trước). */
export function useTaskLogs(taskId: string | null) {
  return useQuery({
    queryKey: ["task-logs", taskId ?? ""],
    queryFn: async (): Promise<TaskLog[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_logs")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!taskId,
  });
}
