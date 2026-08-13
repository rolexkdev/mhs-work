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

/**
 * Diễn biến trong 1 ngày của mọi task, phục vụ trang Báo cáo công việc:
 * nội dung báo cáo (`latest_update`) và thay đổi % tiến độ (`manual_progress`).
 * Lấy cả hai trong một truy vấn để đỡ một vòng gọi mạng.
 */
export function useDailyUpdates(dateISO: string) {
  return useQuery({
    queryKey: ["daily-updates", dateISO.slice(0, 10)],
    queryFn: async (): Promise<TaskLog[]> => {
      const supabase = createClient();
      const day = new Date(dateISO);
      const { data, error } = await supabase
        .from("task_logs")
        .select("*")
        .in("action", ["latest_update", "manual_progress"])
        .gte("created_at", startOfDay(day).toISOString())
        .lte("created_at", endOfDay(day).toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
