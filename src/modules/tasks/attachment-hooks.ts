"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import type { TaskAttachment } from "@/types/database";

const BUCKET = "task-attachments";
const key = (taskId: string) => ["attachments", taskId] as const;

/**
 * Storage keys only accept safe ASCII, so "Báo cáo #2.docx" fails with
 * "Invalid key". Strip diacritics and replace anything else with "-".
 * The original name is kept in task_attachments.file_name for display.
 */
export function storageSafeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot + 1)] : [name, ""];
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  const safeBase = clean(base).slice(0, 80) || "file";
  const safeExt = clean(ext).slice(0, 10);
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

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

      const path = `${taskId}/${Date.now()}-${storageSafeName(file.name)}`;
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
    onError: (e: Error) => toast.error(friendlyError(e)),
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
    onError: (e: Error) => toast.error(friendlyError(e)),
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
