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
import type { Meeting } from "@/types/database";
import type { Database } from "@/types/database";

type MeetingInsert = Database["public"]["Tables"]["meetings"]["Insert"];
type MeetingUpdate = Database["public"]["Tables"]["meetings"]["Update"];

export function useMeetings() {
  return useQuery({
    queryKey: queryKeys.meetings,
    queryFn: async (): Promise<Meeting[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: queryKeys.meeting(id),
    queryFn: async (): Promise<Meeting | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export type MeetingTaskCount = { total: number; done: number };

/** Số công việc hoàn thành / tổng theo từng cuộc họp (client-side aggregate). */
export function useMeetingTaskCounts() {
  return useQuery({
    queryKey: ["meeting-task-counts"],
    queryFn: async (): Promise<Record<string, MeetingTaskCount>> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("meeting_id, status")
        .not("meeting_id", "is", null);
      if (error) throw error;
      const counts: Record<string, MeetingTaskCount> = {};
      for (const row of data ?? []) {
        if (!row.meeting_id) continue;
        const c = (counts[row.meeting_id] ??= { total: 0, done: 0 });
        c.total += 1;
        if (row.status === "done") c.done += 1;
      }
      return counts;
    },
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string | null;
      meeting_date: string;
      created_by: string;
    }) => {
      const supabase = createClient();
      const payload: MeetingInsert = { ...input };
      const { data, error } = await supabase
        .from("meetings")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings });
      toast.success("Đã tạo cuộc họp");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & MeetingUpdate) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meetings")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings });
      qc.invalidateQueries({ queryKey: queryKeys.meeting(m.id) });
      toast.success("Đã cập nhật cuộc họp");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
