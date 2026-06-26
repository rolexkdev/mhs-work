"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
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

/** Đếm số task theo từng cuộc họp (client-side aggregate). */
export function useMeetingTaskCounts() {
  return useQuery({
    queryKey: ["meeting-task-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("meeting_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.meeting_id)
          counts[row.meeting_id] = (counts[row.meeting_id] ?? 0) + 1;
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
    onError: (e: Error) => toast.error(e.message),
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
    onError: (e: Error) => toast.error(e.message),
  });
}
