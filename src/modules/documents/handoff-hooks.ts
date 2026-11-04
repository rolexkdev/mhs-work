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
import type {
  DocumentHandoff,
  DocumentHolder,
  DocumentRecord,
  HandoffKind,
} from "@/types/database";

export type PendingHandoffWithDocument = DocumentHandoff & {
  document: DocumentRecord | null;
};

export function useDocumentHandoffs(documentId: string | null) {
  return useQuery({
    queryKey: queryKeys.documentHandoffs(documentId ?? ""),
    queryFn: async (): Promise<DocumentHandoff[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_handoffs")
        .select("*")
        .eq("document_id", documentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!documentId,
  });
}

export function useMyPendingHandoffs() {
  return useQuery({
    queryKey: queryKeys.myPendingHandoffs,
    queryFn: async (): Promise<PendingHandoffWithDocument[]> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: handoffs, error } = await supabase
        .from("document_handoffs")
        .select("*")
        .eq("to_user", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!handoffs || handoffs.length === 0) return [];

      const docIds = Array.from(new Set(handoffs.map((h) => h.document_id)));
      const { data: docs, error: docErr } = await supabase
        .from("documents")
        .select("*")
        .in("id", docIds);
      if (docErr) throw docErr;

      const docById = new Map((docs ?? []).map((d) => [d.id, d]));
      return handoffs.map((h) => ({
        ...h,
        document: docById.get(h.document_id) ?? null,
      }));
    },
  });
}

export function useDocumentHolders(documentId: string | null) {
  return useQuery({
    queryKey: queryKeys.documentHolders(documentId ?? ""),
    queryFn: async (): Promise<DocumentHolder[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_holders")
        .select("*")
        .eq("document_id", documentId!)
        .order("accepted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!documentId,
  });
}

/**
 * Document IDs where the currently signed-in user appears in `document_holders`.
 * Used by the "Tôi đang giữ" tab in DocumentsWorkspace.
 */
export function useMyHeldDocumentIds() {
  return useQuery({
    queryKey: queryKeys.documentHolders("me"),
    queryFn: async (): Promise<string[]> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("document_holders")
        .select("document_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.document_id)));
    },
  });
}

export interface CreateHandoffInput {
  documentId: string;
  toUsers: string[];
  kind: HandoffKind;
  note?: string | null;
}

export function useCreateHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateHandoffInput,
    ): Promise<DocumentHandoff[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_handoff", {
        p_document_id: input.documentId,
        p_to_users: input.toUsers,
        p_kind: input.kind,
        p_note: input.note?.trim() || null,
      });
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (_rows, vars) => {
      qc.invalidateQueries({
        queryKey: queryKeys.documentHandoffs(vars.documentId),
      });
      qc.invalidateQueries({
        queryKey: queryKeys.documentHolders(vars.documentId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.documentHoldersAll });
      qc.invalidateQueries({ queryKey: queryKeys.document(vars.documentId) });
      qc.invalidateQueries({
        queryKey: queryKeys.documentLogs(vars.documentId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
      qc.invalidateQueries({ queryKey: queryKeys.myPendingHandoffs });
      toast.success("Đã tạo lượt bàn giao");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export interface RespondHandoffInput {
  handoffId: string;
  accept: boolean;
  note?: string | null;
  documentId?: string;
}

export function useRespondHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: RespondHandoffInput,
    ): Promise<DocumentHandoff> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("respond_handoff", {
        p_handoff_id: input.handoffId,
        p_accept: input.accept,
        p_note: input.note?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (handoff, vars) => {
      const docId = handoff?.document_id ?? vars.documentId;
      if (docId) {
        qc.invalidateQueries({ queryKey: queryKeys.documentHandoffs(docId) });
        qc.invalidateQueries({ queryKey: queryKeys.documentHolders(docId) });
        qc.invalidateQueries({ queryKey: queryKeys.document(docId) });
        qc.invalidateQueries({ queryKey: queryKeys.documentLogs(docId) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.documentHoldersAll });
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
      qc.invalidateQueries({ queryKey: queryKeys.myPendingHandoffs });
      toast.success(
        vars.accept ? "Đã xác nhận nhận hồ sơ" : "Đã từ chối nhận hồ sơ",
      );
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export interface CancelHandoffInput {
  handoffId: string;
  note?: string | null;
  documentId?: string;
}

export function useCancelHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CancelHandoffInput): Promise<DocumentHandoff> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("cancel_handoff", {
        p_handoff_id: input.handoffId,
        p_note: input.note?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (handoff, vars) => {
      const docId = handoff?.document_id ?? vars.documentId;
      if (docId) {
        qc.invalidateQueries({ queryKey: queryKeys.documentHandoffs(docId) });
        qc.invalidateQueries({ queryKey: queryKeys.documentHolders(docId) });
        qc.invalidateQueries({ queryKey: queryKeys.document(docId) });
        qc.invalidateQueries({ queryKey: queryKeys.documentLogs(docId) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.documentHoldersAll });
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
      qc.invalidateQueries({ queryKey: queryKeys.myPendingHandoffs });
      toast.success("Đã huỷ lượt bàn giao");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
