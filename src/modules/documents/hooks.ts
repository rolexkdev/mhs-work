"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import type { DocumentEventWithActor, DocumentWithSteps } from "@/types/database";

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
 * Lịch sử xử lý của một hồ sơ, cũ nhất trước, kèm tên người thao tác.
 * Chỉ đọc: mọi thay đổi do RPC ghi.
 */
export function useDocumentEvents(documentId: string | null) {
  return useQuery({
    queryKey: queryKeys.documentEvents(documentId ?? ""),
    queryFn: async (): Promise<DocumentEventWithActor[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_events")
        .select(
          "*, actor:profiles!document_events_created_by_fkey(id, full_name, email, avatar_url)",
        )
        .eq("document_id", documentId!)
        .returns<DocumentEventWithActor[]>()
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!documentId,
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
  /** Omit to let the database default the sender to the creator. */
  sender_id?: string | null;
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

export interface SetDocumentRouteInput {
  documentId: string;
  /** Full ordered route: locked steps first, unchanged, then upcoming steps. */
  departments: string[];
}

/**
 * Sửa lộ trình qua RPC doc_set_route: các bước đã tới bị khoá, chỉ phần chưa
 * tới được thay thế. Lỗi cũng invalidate vì lộ trình có thể đã đổi ở máy khác.
 */
export function useSetDocumentRoute() {
  const qc = useQueryClient();

  const invalidate = (documentId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.documents });
    qc.invalidateQueries({ queryKey: queryKeys.documentEvents(documentId) });
  };

  return useMutation({
    mutationFn: async ({ documentId, departments }: SetDocumentRouteInput) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("doc_set_route", {
        p_document_id: documentId,
        p_departments: departments,
      });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      invalidate(input.documentId);
      toast.success("Đã cập nhật lộ trình");
    },
    onError: (e: Error, input) => {
      invalidate(input.documentId);
      toast.error(friendlyError(e));
    },
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
      // RLS turns a forbidden delete into "0 rows deleted" without an error,
      // so read back the deleted ids and fail when nothing was removed.
      const { data, error } = await supabase
        .from("documents")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "Không xoá được hồ sơ: hồ sơ đã được gửi đi hoặc bạn không có quyền xoá.",
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documents });
      toast.success("Đã xoá hồ sơ");
    },
    onError: (e: Error) => {
      // The list may be stale (e.g. the document was sent meanwhile).
      qc.invalidateQueries({ queryKey: queryKeys.documents });
      toast.error(friendlyError(e));
    },
  });
}

/** Progress actions exposed by the RPCs in 0018_document_actions.sql. */
export type DocumentActionKey =
  | "send"
  | "forward"
  | "return"
  | "resend"
  | "finish_early";

export type DocumentActionInput =
  | { action: "send"; documentId: string; note: string | null }
  | {
      action: "forward";
      documentId: string;
      stepId: string;
      handlerName: string | null;
      note: string | null;
    }
  | {
      action: "return";
      documentId: string;
      stepId: string;
      reason: string;
    }
  | {
      action: "resend";
      documentId: string;
      stepId: string;
      note: string | null;
    }
  | {
      action: "finish_early";
      documentId: string;
      stepId: string;
      handlerName: string | null;
      note: string | null;
    };

const DOCUMENT_ACTION_SUCCESS: Record<DocumentActionKey, string> = {
  send: "Đã gửi hồ sơ",
  forward: "Đã chuyển tiếp hồ sơ",
  return: "Đã trả lại hồ sơ",
  resend: "Đã gửi lại hồ sơ",
  finish_early: "Đã kết thúc hồ sơ",
};

/**
 * Thao tác tiến trình qua RPC. p_step_id là bước hiện tại người dùng đang
 * thấy; RPC từ chối khi bước đã đổi (hai người thao tác cùng lúc).
 * Cả thành công lẫn lỗi đều invalidate để UI hiện trạng thái mới nhất.
 */
export function useDocumentAction() {
  const qc = useQueryClient();

  const invalidate = (documentId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.documents });
    qc.invalidateQueries({ queryKey: queryKeys.documentEvents(documentId) });
  };

  return useMutation({
    mutationFn: async (input: DocumentActionInput): Promise<void> => {
      const supabase = createClient();

      switch (input.action) {
        case "send": {
          const { error } = await supabase.rpc("doc_send", {
            p_document_id: input.documentId,
            p_note: input.note,
          });
          if (error) throw error;
          return;
        }
        case "forward": {
          const { error } = await supabase.rpc("doc_forward", {
            p_document_id: input.documentId,
            p_step_id: input.stepId,
            p_handler_name: input.handlerName,
            p_note: input.note,
          });
          if (error) throw error;
          return;
        }
        case "return": {
          const { error } = await supabase.rpc("doc_return", {
            p_document_id: input.documentId,
            p_step_id: input.stepId,
            p_reason: input.reason,
          });
          if (error) throw error;
          return;
        }
        case "resend": {
          const { error } = await supabase.rpc("doc_resend", {
            p_document_id: input.documentId,
            p_step_id: input.stepId,
            p_note: input.note,
          });
          if (error) throw error;
          return;
        }
        case "finish_early": {
          const { error } = await supabase.rpc("doc_finish_early", {
            p_document_id: input.documentId,
            p_step_id: input.stepId,
            p_handler_name: input.handlerName,
            p_note: input.note,
          });
          if (error) throw error;
          return;
        }
      }
    },
    onSuccess: (_data, input) => {
      invalidate(input.documentId);
      toast.success(DOCUMENT_ACTION_SUCCESS[input.action]);
    },
    onError: (e: Error, input) => {
      // Another manager may have moved the document meanwhile.
      invalidate(input.documentId);
      toast.error(friendlyError(e));
    },
  });
}

export interface UndoDocumentActionInput {
  documentId: string;
  /**
   * Latest undoable event the user saw. Pinned when the confirm dialog opens
   * so a refetch cannot change which action is undone.
   */
  eventId: string;
}

/**
 * Hoàn tác thao tác tiến trình gần nhất. RPC tự chọn event mới nhất chưa bị
 * hoàn tác và từ chối khi p_event_id đã cũ (hai quản lý bấm cùng lúc).
 */
export function useUndoDocumentAction() {
  const qc = useQueryClient();

  const invalidate = (documentId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.documents });
    qc.invalidateQueries({ queryKey: queryKeys.documentEvents(documentId) });
  };

  return useMutation({
    mutationFn: async ({ documentId, eventId }: UndoDocumentActionInput) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("doc_undo", {
        p_document_id: documentId,
        p_event_id: eventId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      invalidate(input.documentId);
      toast.success("Đã hoàn tác");
    },
    onError: (e: Error, input) => {
      invalidate(input.documentId);
      toast.error(friendlyError(e));
    },
  });
}
