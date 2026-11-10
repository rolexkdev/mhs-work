"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import type { DocumentWithSteps } from "@/types/database";

/**
 * Document list with its route and sender.
 * Steps are sorted by step_order on the client so the embedded order from
 * PostgREST does not matter.
 */
export function useDocuments() {
  return useQuery({
    queryKey: queryKeys.documents,
    queryFn: async (): Promise<DocumentWithSteps[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("documents")
        .select(
          "*, sender:profiles!documents_sender_id_fkey(id, full_name, email, avatar_url), steps:document_steps(*)",
        )
        .returns<DocumentWithSteps[]>()
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((doc) => ({
        ...doc,
        steps: [...doc.steps].sort((a, b) => a.step_order - b.step_order),
      }));
    },
  });
}

/**
 * True when the signed-in user may manage document progress: role 'admin'
 * or profiles.is_doc_manager (mirrors can_manage_documents() from 0017).
 * Invalidated together with the profiles list when an admin edits accounts.
 */
export function useCanManageDocuments(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.currentProfile,
    queryFn: async (): Promise<boolean> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, is_doc_manager")
        .eq("id", user.id)
        .single();
      if (error) throw error;

      return profile.role === "admin" || profile.is_doc_manager;
    },
    staleTime: 5 * 60_000,
  });

  return data ?? false;
}

export interface CreateDocumentInput {
  name: string;
  sender_id: string | null;
  note: string | null;
  /** Ordered route; only sent by callers allowed to manage documents. */
  departments?: string[];
}

/**
 * Tạo hồ sơ mới. Bản ghi documents do DB gán created_by/sender_id mặc định,
 * nhưng sender_id được gửi tường minh để người tạo chọn được người gửi khác.
 * Lộ trình (nếu có) ghi qua RPC doc_set_route sau khi insert.
 */
export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      sender_id,
      note,
      departments,
    }: CreateDocumentInput): Promise<string> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("documents")
        .insert({ name, sender_id, note })
        .select("id")
        .single();
      if (error) throw error;

      if (departments && departments.length > 0) {
        const { error: routeError } = await supabase.rpc("doc_set_route", {
          p_document_id: data.id,
          p_departments: departments,
        });
        if (routeError) {
          // Do not leave a route-less draft behind when the RPC was rejected
          // (e.g. the manager flag was just removed): the user would retry and
          // create a duplicate. Best effort only; the original error is shown.
          await supabase.from("documents").delete().eq("id", data.id);
          throw routeError;
        }
      }

      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documents });
      toast.success("Đã thêm hồ sơ");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export interface UpdateDocumentInput {
  id: string;
  name: string;
  sender_id: string | null;
  note: string | null;
}

/**
 * Sửa tên / người gửi / ghi chú. Route changes go through doc_set_route in a
 * later step, so this only touches the documents row.
 * `.select().single()` surfaces the RLS rejection: PostgREST returns success
 * when an update matches zero rows.
 */
export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateDocumentInput) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("documents")
        .update(patch)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documents });
      toast.success("Đã cập nhật hồ sơ");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Xoá hồ sơ (cascade steps and events). Permission is enforced by RLS. */
export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documents });
      toast.success("Đã xoá hồ sơ");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
