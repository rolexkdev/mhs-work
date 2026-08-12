import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import type { UserRole } from "@/types/database";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // getClaims() xác minh JWT cục bộ, không tốn một vòng gọi mạng như getUser().
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, avatar_url")
    .eq("id", userId)
    .single();

  return (
    <AppShell
      fullName={profile?.full_name ?? null}
      email={profile?.email ?? (claims?.claims.email as string) ?? ""}
      role={(profile?.role ?? "member") as UserRole}
      avatarUrl={profile?.avatar_url ?? null}
    >
      {children}
    </AppShell>
  );
}
