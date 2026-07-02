"use client";

import { useQuery } from "@tanstack/react-query";
import { startOfDay, endOfDay } from "date-fns";
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

/** Các lần cập nhật "Cập nhật mới nhất" trong 1 ngày (mọi task). */
export function useDailyUpdates(dateISO: string) {
  return useQuery({
    queryKey: ["daily-updates", dateISO.slice(0, 10)],
    queryFn: async (): Promise<TaskLog[]> => {
      const supabase = createClient();
      const day = new Date(dateISO);
      const { data, error } = await supabase
        .from("task_logs")
        .select("*")
        .eq("action", "latest_update")
        .gte("created_at", startOfDay(day).toISOString())
        .lte("created_at", endOfDay(day).toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
