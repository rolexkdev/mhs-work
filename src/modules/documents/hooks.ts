"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
