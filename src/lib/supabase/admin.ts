import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Supabase client dùng service role: bỏ qua RLS và gọi được Auth Admin API
 * (tạo user, đổi mật khẩu, xoá user).
 *
 * CHỈ được import từ Server Action / Route Handler. Tuyệt đối không import
 * vào Client Component — service role key sẽ bị đóng gói vào bundle browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Thiếu SUPABASE_SERVICE_ROLE_KEY trong .env.local — không thể quản lý tài khoản.",
    );
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
