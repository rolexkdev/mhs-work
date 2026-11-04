"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { DocumentLog } from "@/types/database";

/** Change history of a single document (newest first). */
export function useDocumentLogs(documentId: string | null) {
  return useQuery({
    queryKey: queryKeys.documentLogs(documentId ?? ""),
    queryFn: async (): Promise<DocumentLog[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_logs")
        .select("*")
        .eq("document_id", documentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!documentId,
  });
}
