"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { MeetingItem } from "@/types/database";

export function useMeetingItems(meetingId: string) {
  return useQuery({
    queryKey: queryKeys.meetingItems(meetingId),
    queryFn: async (): Promise<MeetingItem[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meeting_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!meetingId,
  });
}
