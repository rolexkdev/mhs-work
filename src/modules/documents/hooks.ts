"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys, type DocumentQueryFilters } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import type { DocumentRecord, TaskPriority } from "@/types/database";

export type { DocumentQueryFilters };

export function useDocuments(filters: DocumentQueryFilters = {}) {
  return useQuery({
    queryKey: queryKeys.documents(filters),
    queryFn: async (): Promise<DocumentRecord[]> => {
      const supabase = createClient();
      let q = supabase.from("documents").select("*");

      if (filters.status) {
        q = q.eq("status", filters.status);
      }
      if (filters.officeId) {
        q = q.eq("current_office_id", filters.officeId);
      }
      if (filters.priority) {
        q = q.eq("priority", filters.priority);
      }
      if (filters.category && filters.category.trim()) {
        q = q.ilike("category", `%${filters.category.trim()}%`);
      }

      const { data, error } = await q.order("created_at", {
        ascending: false,
      });
      if (error) throw error;

      let rows = data ?? [];
      if (filters.search && filters.search.trim()) {
        const needle = filters.search.trim().toLowerCase();
        rows = rows.filter(
          (doc) =>
            doc.code.toLowerCase().includes(needle) ||
            doc.title.toLowerCase().includes(needle),
        );
      }
      return rows;
    },
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: queryKeys.document(id ?? ""),
    queryFn: async (): Promise<DocumentRecord | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export interface CreateDocumentInput {
  title: string;
  description?: string | null;
  category?: string | null;
  origin_office_id?: string | null;
  intended_recipient_id?: string | null;
  priority?: TaskPriority;
  quantity?: number;
  received_at?: string | null;
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDocumentInput): Promise<DocumentRecord> => {
      const supabase = createClient();
      // Only send permitted columns; server trigger fills code, status,
      // created_by, current_holder_id, and current_office_id.
      const payload = {
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        origin_office_id: input.origin_office_id ?? null,
        intended_recipient_id: input.intended_recipient_id ?? null,
        priority: input.priority ?? ("medium" as TaskPriority),
        quantity: input.quantity ?? 1,
        ...(input.received_at ? { received_at: input.received_at } : {}),
      };
      const { data, error } = await supabase
        .from("documents")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
      toast.success("Đã tạo hồ sơ");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useCreateDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      inputs: CreateDocumentInput[],
    ): Promise<DocumentRecord[]> => {
      if (inputs.length === 0) return [];
      const supabase = createClient();
      const payloads = inputs.map((input) => ({
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        origin_office_id: input.origin_office_id ?? null,
        intended_recipient_id: input.intended_recipient_id ?? null,
        priority: input.priority ?? ("medium" as TaskPriority),
        quantity: input.quantity ?? 1,
        ...(input.received_at ? { received_at: input.received_at } : {}),
      }));
      const { data, error } = await supabase
        .from("documents")
        .insert(payloads)
        .select();
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export interface UpdateDocumentInput {
  id: string;
  title?: string;
  description?: string | null;
  category?: string | null;
  intended_recipient_id?: string | null;
  priority?: TaskPriority;
  quantity?: number;
  received_at?: string;
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateDocumentInput): Promise<DocumentRecord> => {
      const supabase = createClient();
      // Never send protected/immutable columns (status, current_holder_id,
      // current_office_id, delivered_at, delivered_to, created_by, code).
      const patch: {
        title?: string;
        description?: string | null;
        category?: string | null;
        intended_recipient_id?: string | null;
        priority?: TaskPriority;
        quantity?: number;
        received_at?: string;
      } = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.category !== undefined) patch.category = input.category;
      if (input.intended_recipient_id !== undefined) {
        patch.intended_recipient_id = input.intended_recipient_id;
      }
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.quantity !== undefined) patch.quantity = input.quantity;
      if (input.received_at !== undefined) patch.received_at = input.received_at;

      const { data, error } = await supabase
        .from("documents")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    // Optimistic update covering both list queries (DocumentRecord[]) and
    // detail queries (DocumentRecord | null) under queryKeys.documentsAll.
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.documentsAll });
      const snapshots = qc.getQueriesData({ queryKey: queryKeys.documentsAll });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        if (Array.isArray(data)) {
          qc.setQueryData<DocumentRecord[]>(
            key,
            (data as DocumentRecord[]).map((doc) =>
              doc.id === id ? { ...doc, ...patch } : doc,
            ),
          );
        } else if (
          typeof data === "object" &&
          (data as DocumentRecord).id === id
        ) {
          qc.setQueryData<DocumentRecord>(key, {
            ...(data as DocumentRecord),
            ...patch,
          });
        }
      }
      return { snapshots };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(friendlyError(e));
    },
    onSettled: (_data, _error, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
      qc.invalidateQueries({ queryKey: queryKeys.documentLogs(vars.id) });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
      qc.invalidateQueries({ queryKey: queryKeys.myPendingHandoffs });
      qc.invalidateQueries({
        queryKey: queryKeys.documentsWithPendingHandoffs,
      });
      toast.success("Đã xoá hồ sơ");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
