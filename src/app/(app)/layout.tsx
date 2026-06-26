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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <AppShell
      fullName={profile?.full_name ?? null}
      email={profile?.email ?? user.email ?? ""}
      role={(profile?.role ?? "member") as UserRole}
      avatarUrl={profile?.avatar_url ?? null}
    >
      {children}
    </AppShell>
  );
}
