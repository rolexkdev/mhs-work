"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import type { AppNotification } from "@/types/database";

const LIMIT = 30;

/** Latest notifications of the signed-in user (RLS returns only their own). */
export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: async (): Promise<AppNotification[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return data ?? [];
    },
    // Realtime invalidates on new rows; poll as a fallback if the socket drops.
    refetchInterval: 5 * 60_000,
  });
}

/** Marks the given notifications read, or all unread ones when `ids` is omitted. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const supabase = createClient();
      let q = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (ids) q = q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications });
      const prev = qc.getQueryData<AppNotification[]>(queryKeys.notifications);
      const now = new Date().toISOString();
      qc.setQueryData<AppNotification[]>(queryKeys.notifications, (list) =>
        list?.map((n) =>
          !n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: now } : n,
        ),
      );
      return { prev };
    },
    onError: (e: Error, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.notifications, ctx.prev);
      toast.error(friendlyError(e));
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}
