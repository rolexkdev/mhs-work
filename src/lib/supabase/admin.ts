import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const INVALID_SERVICE_ROLE_KEY_MESSAGE =
  "SUPABASE_SERVICE_ROLE_KEY trong .env.local không hợp lệ: cần dùng khoá service_role (secret), không phải khoá anon/publishable. Vui lòng kiểm tra lại trong Supabase Dashboard > Project Settings > API.";

/** Decode the `role` claim from a legacy 3-part Supabase JWT, if present. */
function getJwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Convert raw GoTrue / PostgREST admin errors (such as "User not allowed" when
 * SUPABASE_SERVICE_ROLE_KEY is an anon/publishable key) into a clear Vietnamese
 * message for administrators.
 */
export function formatAdminError(error: unknown): string {
  const err = error as { message?: string; code?: string } | null;
  const message =
    typeof error === "string"
      ? error
      : err?.message ?? "Có lỗi xảy ra khi thực hiện thao tác quản trị.";
  const lower = message.toLowerCase();

  if (
    err?.code === "not_admin" ||
    lower.includes("user not allowed") ||
    lower.includes("not_admin")
  ) {
    return INVALID_SERVICE_ROLE_KEY_MESSAGE;
  }

  return message;
}

/**
 * Supabase client dùng service role: bỏ qua RLS và gọi được Auth Admin API
 * (tạo user, đổi mật khẩu, xoá user).
 *
 * CHỈ được import từ Server Action / Route Handler. Tuyệt đối không import
 * vào Client Component — service role key sẽ bị đóng gói vào bundle browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "Thiếu SUPABASE_SERVICE_ROLE_KEY trong .env.local — vui lòng cấu hình khoá service_role (secret) từ Supabase Dashboard > Project Settings > API.",
    );
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const jwtRole = getJwtRole(key);
  if (
    key.startsWith("sb_publishable_") ||
    (anonKey && key === anonKey) ||
    (jwtRole !== null && jwtRole !== "service_role")
  ) {
    throw new Error(INVALID_SERVICE_ROLE_KEY_MESSAGE);
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
