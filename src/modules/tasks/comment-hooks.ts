"use client";

import { useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import type { TaskComment, TaskCommentEdit } from "@/types/database";

const key = queryKeys.taskComments;

export function useComments(taskId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: key(taskId ?? ""),
    queryFn: async (): Promise<TaskComment[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!taskId,
  });

  // Realtime: cập nhật bình luận mới ngay lập tức
  useEffect(() => {
    if (!taskId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`comments:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${taskId}`,
        },
        () => qc.invalidateQueries({ queryKey: key(taskId) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, qc]);

  return query;
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");
      const { error } = await supabase
        .from("task_comments")
        .insert({ task_id: taskId, user_id: user.id, content });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(taskId) });
    },
    onError: (e: unknown) => toast.error(friendlyError(e)),
  });
}

export function useUpdateComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("task_comments")
        .update({ content })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(taskId) });
    },
    onError: (e: unknown) => toast.error(friendlyError(e)),
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("task_comments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(taskId) });
    },
    onError: (e: unknown) => toast.error(friendlyError(e)),
  });
}

/** Previous texts of a comment, oldest first. Fetched only while `enabled`. */
export function useCommentEdits(commentId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.taskCommentEdits(commentId),
    queryFn: async (): Promise<TaskCommentEdit[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_comment_edits")
        .select("*")
        .eq("comment_id", commentId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
    staleTime: 0,
  });
}
