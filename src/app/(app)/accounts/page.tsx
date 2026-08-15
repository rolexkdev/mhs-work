import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountsManager } from "@/modules/admin/accounts-manager";

/**
 * Trang chỉ dành cho quản trị viên. Chặn ngay ở server để người không đủ
 * quyền không tải được nội dung, kể cả khi gõ thẳng URL.
 */
export default async function AccountsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role !== "admin") redirect("/");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Quản lý tài khoản
        </h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Tạo tài khoản cho nhân viên trong ban, đặt lại mật khẩu khi quên, khoá
          đăng nhập khi nghỉ việc.
        </p>
      </div>
      <AccountsManager currentUserId={userId} />
    </div>
  );
}
