"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { Office } from "@/types/database";

export function useOffices() {
  return useQuery({
    queryKey: queryKeys.offices,
    queryFn: async (): Promise<Office[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("offices")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
