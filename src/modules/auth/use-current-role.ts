"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { UserRole } from "@/types/database";

/** Role of the signed-in user, or null while loading / signed out. */
export function useCurrentRole(): UserRole | null {
  const { data } = useQuery({
    queryKey: queryKeys.currentRole,
    queryFn: async (): Promise<UserRole | null> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return profile.role;
    },
    staleTime: 5 * 60_000,
  });
  return data ?? null;
}

/** Leaders and admins manage task categories (mirrors is_leader_or_admin()). */
export function useCanManageCategories(): boolean {
  const role = useCurrentRole();
  return role === "admin" || role === "leader";
}
