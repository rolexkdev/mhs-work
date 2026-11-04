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
  priority?: TaskPriority;
  due_date?: string | null;
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
        priority: input.priority ?? ("medium" as TaskPriority),
        due_date: input.due_date ?? null,
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

export interface UpdateDocumentInput {
  id: string;
  title?: string;
  description?: string | null;
  category?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateDocumentInput): Promise<DocumentRecord> => {
      const supabase = createClient();
      // Never send protected/immutable columns (status, current_holder_id,
      // current_office_id, created_by, code).
      const patch: {
        title?: string;
        description?: string | null;
        category?: string | null;
        priority?: TaskPriority;
        due_date?: string | null;
      } = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.category !== undefined) patch.category = input.category;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.due_date !== undefined) patch.due_date = input.due_date;

      const { data, error } = await supabase
        .from("documents")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
      qc.invalidateQueries({ queryKey: queryKeys.document(doc.id) });
      qc.invalidateQueries({ queryKey: queryKeys.documentLogs(doc.id) });
      toast.success("Đã cập nhật hồ sơ");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
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
