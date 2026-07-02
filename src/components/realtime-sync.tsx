"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type ChangeRow = { task_id?: string } | null;

/**
 * Đồng bộ realtime: lắng nghe thay đổi từ Supabase và làm mới cache react-query
 * → khi 1 người cập nhật, mọi máy khác tự cập nhật theo.
 * Mount 1 lần trong khu vực đã đăng nhập (AppShell).
 */
export function RealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const supabase = createClient();

    const taskIdFrom = (payload: { new: ChangeRow; old: ChangeRow }) =>
      payload.new?.task_id ?? payload.old?.task_id ?? null;

    const channel = supabase
      .channel("realtime-app")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
          qc.invalidateQueries({ queryKey: ["task-logs"] }); // task đổi → có log mới
          qc.invalidateQueries({ queryKey: ["daily-updates"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings" },
        () => {
          qc.invalidateQueries({ queryKey: ["meetings"] });
          qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments" },
        (payload) => {
          const id = taskIdFrom(payload);
          if (id) qc.invalidateQueries({ queryKey: ["comments", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_checklists" },
        (payload) => {
          const id = taskIdFrom(payload);
          if (id) qc.invalidateQueries({ queryKey: ["checklists", id] });
          qc.invalidateQueries({ queryKey: ["tasks"] }); // checklist đổi → progress đổi
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_attachments" },
        (payload) => {
          const id = taskIdFrom(payload);
          if (id) qc.invalidateQueries({ queryKey: ["attachments", id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return null;
}
