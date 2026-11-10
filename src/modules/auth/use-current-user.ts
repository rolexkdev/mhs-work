"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Id of the signed-in user, or null when there is no session.
 * Used to compare ownership (`created_by`) without another hook.
 */
export function useCurrentUserId(): string | null {
  const { data } = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: async (): Promise<string | null> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
    staleTime: Infinity,
  });

  return data ?? null;
}
