"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { TaskAttachment } from "@/types/database";

const BUCKET = "task-attachments";
const key = (taskId: string) => ["attachments", taskId] as const;

export function useAttachments(taskId: string | null) {
  return useQuery({
    queryKey: key(taskId ?? ""),
    queryFn: async (): Promise<TaskAttachment[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!taskId,
  });
}

export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");

      const path = `${taskId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file);
      if (upErr) throw upErr;

      const { error } = await supabase.from("task_attachments").insert({
        task_id: taskId,
        file_name: file.name,
        file_url: path,
        uploaded_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(taskId) });
      toast.success("Đã tải lên tệp");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (att: TaskAttachment) => {
      const supabase = createClient();
      await supabase.storage.from(BUCKET).remove([att.file_url]);
      const { error } = await supabase
        .from("task_attachments")
        .delete()
        .eq("id", att.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(taskId) });
      toast.success("Đã xoá tệp");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Tạo signed URL để tải/xem tệp (bucket private). */
export async function getAttachmentUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
