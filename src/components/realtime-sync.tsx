"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

type ChangeRow = {
  task_id?: string;
} | null;

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
          qc.invalidateQueries({ queryKey: queryKeys.meetings });
          qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_items" },
        () => qc.invalidateQueries({ queryKey: ["meeting-items"] }),
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
      );

    // Join with the user's JWT, not the anon key: every table policy is
    // `to authenticated`, so an anon join gets SUBSCRIBED but no events.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });

    // Keep the socket's token fresh after the hourly refresh.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) supabase.realtime.setAuth(session.access_token);
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return null;
}
