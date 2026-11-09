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
import { DEPARTMENTS } from "@/modules/tasks/constants";
import { dueIso, resolveDeadline } from "@/modules/meetings/resolve-deadline";
import type { Database, MeetingItem, Profile } from "@/types/database";
import type { ParsedItem } from "@/modules/meetings/parse-minutes";

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

const DEPT_ALIASES: { re: RegExp; value: string }[] = [
  { re: /(^|[^\p{L}])mt($|[^\p{L}])/iu, value: "Môi trường" },
  { re: /xlnt/i, value: "NM Xử lý nước thải" },
];

/**
 * Phòng của công việc từ "Đơn vị phụ trách" trong biên bản: lấy phòng được nhắc
 * tới đầu tiên trong danh sách phòng; không có thì giữ nguyên chữ trong biên bản.
 */
export function taskDepartment(text: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const hits = [
    ...DEPARTMENTS.map((d) => ({
      at: t.indexOf(d.value.toLowerCase()),
      value: d.value,
    })),
    ...DEPT_ALIASES.map((a) => ({ at: t.search(a.re), value: a.value })),
  ].filter((h) => h.at >= 0);
  hits.sort((a, b) => a.at - b.at);
  return hits[0]?.value ?? text;
}

type TaskFields = Pick<
  MeetingItem,
  "title" | "content" | "department" | "deadline"
>;

const taskTitle = (it: TaskFields) =>
  it.title ? `${it.title}: ${it.content}` : it.content;

/** Công việc của 1 đầu mục: giao theo phòng, chưa chọn người thực hiện. */
function taskFromItem(
  item: MeetingItem,
  userId: string,
  meetingDate: string,
): TaskInsert {
  return {
    title: taskTitle(item),
    description:
      [
        item.department && `Đơn vị phụ trách (biên bản): ${item.department}`,
        item.deadline && `Thời hạn (biên bản): ${item.deadline}`,
      ]
        .filter(Boolean)
        .join("\n") || null,
    meeting_id: item.meeting_id,
    meeting_item_id: item.id,
    department: taskDepartment(item.department),
    due_date: dueIso(resolveDeadline(item.deadline, meetingDate)?.due),
    created_by: userId,
  };
}

async function currentUserId() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) throw new Error("Chưa đăng nhập");
  return user.id;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["meeting-items"] });
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
}

/** Thêm đầu mục và tạo luôn công việc cho từng đầu mục. */
export function useAddMeetingItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      meetingId,
      meetingDate,
      items,
    }: {
      meetingId: string;
      meetingDate: string;
      items: ParsedItem[];
    }) => {
      const supabase = createClient();
      const userId = await currentUserId();
      // Nối tiếp sau các đầu mục đã có
      const { data: last } = await supabase
        .from("meeting_items")
        .select("sort_order")
        .eq("meeting_id", meetingId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const base = (last?.sort_order ?? -1) + 1;
      const { data, error } = await supabase
        .from("meeting_items")
        .insert(
          items.map((it, i) => ({
            meeting_id: meetingId,
            section: it.section,
            title: it.title,
            content: it.content,
            department: it.department,
            deadline: it.deadline,
            sort_order: base + i,
          })),
        )
        .select();
      if (error) throw error;

      const { error: taskError } = await supabase
        .from("tasks")
        .insert((data ?? []).map((it) => taskFromItem(it, userId, meetingDate)));
      if (taskError) throw taskError;
      return items.length;
    },
    onSuccess: (n) => {
      invalidateAll(qc);
      toast.success(`Đã tạo ${n} công việc`);
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Tạo bù công việc cho các đầu mục chưa có (họp import trước đây). */
export function useCreateMissingTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      meetingDate,
    }: {
      items: MeetingItem[];
      meetingDate: string;
    }) => {
      const userId = await currentUserId();
      const { error } = await createClient()
        .from("tasks")
        .insert(items.map((it) => taskFromItem(it, userId, meetingDate)));
      if (error) throw error;
      return items.length;
    },
    onSuccess: (n) => {
      invalidateAll(qc);
      toast.success(`Đã tạo ${n} công việc`);
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Đặt hạn chót cho công việc đã tạo trước khi có quy đổi thời hạn theo ngày họp. */
export function useFillDueDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { id: string; due_date: string }[]) => {
      const supabase = createClient();
      const results = await Promise.all(
        rows.map((r) =>
          supabase
            .from("tasks")
            .update({ due_date: r.due_date })
            .eq("id", r.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      return rows.length;
    },
    onSuccess: (n) => {
      invalidateAll(qc);
      toast.success(`Đã đặt hạn chót cho ${n} công việc`);
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/**
 * Sửa đầu mục, cập nhật theo tên + phòng của công việc đi kèm. Hạn chót chỉ đổi
 * khi "Thời hạn" đổi, để không đè lên hạn đã chỉnh tay trong công việc.
 */
export function useUpdateMeetingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      prevDeadline,
      meetingDate,
      ...fields
    }: { id: string; prevDeadline: string | null; meetingDate: string } & TaskFields) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("meeting_items")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
      const { error: taskError } = await supabase
        .from("tasks")
        .update({
          title: taskTitle(fields),
          department: taskDepartment(fields.department),
          ...(fields.deadline !== prevDeadline && {
            due_date: dueIso(resolveDeadline(fields.deadline, meetingDate)?.due),
          }),
        })
        .eq("meeting_item_id", id);
      if (taskError) throw taskError;
    },
    onSuccess: () => invalidateAll(qc),
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Xoá đầu mục cùng công việc đi kèm. */
export function useDeleteMeetingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error: taskError } = await supabase
        .from("tasks")
        .delete()
        .eq("meeting_item_id", id);
      if (taskError) throw taskError;
      const { error } = await supabase
        .from("meeting_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(qc);
      toast.success("Đã xoá đầu mục");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
