// Tiện ích dùng chung cho các Edge Function tích hợp Zalo.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
}

/** Client quyền service role — bỏ qua RLS, chỉ dùng trong Edge Function. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client quyền anon — để đăng nhập/verifyOtp thay mặt người dùng. */
export function anonClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Xác minh access token lấy từ Mini App (zmp-sdk getAccessToken) bằng
 * Zalo Graph API. Trả về id người dùng theo Zalo App.
 */
export async function verifyZaloUser(
  accessToken: string,
): Promise<{ id: string; name: string | null }> {
  const proof = await hmacSha256Hex(env("ZALO_APP_SECRET"), accessToken);
  const res = await fetch("https://graph.zalo.me/v2.0/me?fields=id,name", {
    headers: { access_token: accessToken, appsecret_proof: proof },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.id) {
    throw new Error(`Zalo token không hợp lệ: ${data.message ?? res.status}`);
  }
  return { id: String(data.id), name: data.name ?? null };
}

/**
 * Lấy access token OA còn hạn; sắp hết hạn thì làm mới và GHI LẠI NGAY
 * refresh_token mới (refresh_token cũ chết ngay sau lời gọi).
 */
export async function getOaAccessToken(db: SupabaseClient): Promise<string> {
  const { data: row, error } = await db
    .from("zalo_oa_tokens")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Chưa có token OA — xem README phần khởi tạo token.");

  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() > 10 * 60_000) return row.access_token;

  const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: env("ZALO_APP_SECRET"),
    },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      app_id: env("ZALO_APP_ID"),
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token || !data.refresh_token) {
    throw new Error(
      `Làm mới token OA thất bại: ${data.error_description ?? data.message ?? res.status}`,
    );
  }

  const { error: saveErr } = await db.from("zalo_oa_tokens").upsert({
    id: 1,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (saveErr) throw saveErr;
  return data.access_token;
}

/** Gửi tin tư vấn (text) tới người dùng theo ID của OA. */
export async function sendOaText(
  oaAccessToken: string,
  oaUserId: string,
  text: string,
): Promise<void> {
  const res = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: oaAccessToken },
    body: JSON.stringify({ recipient: { user_id: oaUserId }, message: { text } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.error && data.error !== 0)) {
    throw new Error(`Gửi tin OA lỗi ${data.error ?? res.status}: ${data.message ?? ""}`);
  }
}
