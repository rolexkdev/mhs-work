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
import type { Database, MeetingItem, Profile } from "@/types/database";
import type { ParsedItem } from "@/modules/meetings/parse-minutes";

type ItemUpdate = Database["public"]["Tables"]["meeting_items"]["Update"];
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

/** User đang đăng nhập (id + role) — để hiện nút theo quyền. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Pick<Profile, "id" | "role"> | null> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();
      return data ?? { id: user.id, role: "member" };
    },
    staleTime: Infinity,
  });
}

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

export type ItemStats = { total: number; done: number; inProgress: number };

/** Số đầu mục theo từng cuộc họp (cho thẻ ở trang danh sách). */
export function useMeetingItemStats() {
  return useQuery({
    queryKey: queryKeys.meetingItemStats,
    queryFn: async (): Promise<Record<string, ItemStats>> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meeting_items")
        .select("meeting_id, status");
      if (error) throw error;
      const stats: Record<string, ItemStats> = {};
      for (const row of data ?? []) {
        const s = (stats[row.meeting_id] ??= { total: 0, done: 0, inProgress: 0 });
        s.total += 1;
        if (row.status === "done") s.done += 1;
        else if (row.status === "in_progress") s.inProgress += 1;
      }
      return stats;
    },
  });
}

function invalidateItems(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["meeting-items"] });
}

export function useAddMeetingItems(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: ParsedItem[]) => {
      const supabase = createClient();
      // Nối tiếp sau các đầu mục đã có
      const { data: last } = await supabase
        .from("meeting_items")
        .select("sort_order")
        .eq("meeting_id", meetingId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const base = (last?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("meeting_items").insert(
        items.map((it, i) => ({
          meeting_id: meetingId,
          section: it.section,
          title: it.title,
          content: it.content,
          department: it.department,
          deadline: it.deadline,
          sort_order: base + i,
        })),
      );
      if (error) throw error;
      return items.length;
    },
    onSuccess: (n) => {
      invalidateItems(qc);
      toast.success(`Đã thêm ${n} đầu mục`);
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useUpdateMeetingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & ItemUpdate) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("meeting_items")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateItems(qc),
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Đánh dấu đã xử lý (kèm kết quả) hoặc mở lại. */
export function useResolveMeetingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      done,
      result,
    }: {
      id: string;
      done: boolean;
      result?: string | null;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const patch: ItemUpdate = done
        ? {
            status: "done",
            result: result ?? null,
            handled_by: user?.id ?? null,
            handled_at: new Date().toISOString(),
          }
        : { status: "in_progress", handled_by: null, handled_at: null };
      const { error } = await supabase
        .from("meeting_items")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      return done;
    },
    onSuccess: (done) => {
      invalidateItems(qc);
      toast.success(done ? "Đã đánh dấu xử lý xong" : "Đã mở lại đầu mục");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useDeleteMeetingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("meeting_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateItems(qc);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Đã xoá đầu mục");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/**
 * Giao việc từ 1 đầu mục: tạo task (mỗi người 1 task) gắn với cuộc họp + đầu mục,
 * rồi chuyển đầu mục sang "Đang xử lý" nếu đang "Chưa nhận".
 */
export function useAssignMeetingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      item: MeetingItem;
      title: string;
      description: string | null;
      assigneeIds: string[];
      department: string | null;
      due_date: string | null;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");

      const assignees = input.assigneeIds.length ? input.assigneeIds : [null];
      const rows: TaskInsert[] = assignees.map((assignee_id) => ({
        title: input.title,
        description: input.description,
        meeting_id: input.item.meeting_id,
        meeting_item_id: input.item.id,
        assignee_id,
        department: input.department,
        due_date: input.due_date,
        created_by: user.id,
      }));
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;

      if (input.item.status === "open") {
        await supabase
          .from("meeting_items")
          .update({ status: "in_progress" })
          .eq("id", input.item.id);
      }
      return rows.length;
    },
    onSuccess: (n) => {
      invalidateItems(qc);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
      toast.success(n > 1 ? `Đã tạo ${n} công việc` : "Đã tạo công việc");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
