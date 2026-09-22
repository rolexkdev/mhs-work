// Đăng nhập Zalo Mini App bằng tài khoản TaskApp.
//
// POST { zaloAccessToken, idByOA?, email?, password? }
//  → { status: "ok", access_token, refresh_token }   (phiên Supabase)
//  → { status: "need_link", zaloName }               (chưa liên kết)
//
// Deploy: supabase functions deploy zalo-auth --no-verify-jwt
// (hàm được gọi TRƯỚC khi có phiên; bảo vệ bằng xác minh token Zalo ở server)
import {
  adminClient,
  anonClient,
  corsHeaders,
  json,
  verifyZaloUser,
} from "../_shared/zalo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { zaloAccessToken, idByOA, email, password } = body as {
      zaloAccessToken?: string;
      idByOA?: string | null;
      email?: string;
      password?: string;
    };
    if (!zaloAccessToken) return json({ message: "Thiếu zaloAccessToken" }, 400);

    let zalo: { id: string; name: string | null };
    try {
      zalo = await verifyZaloUser(zaloAccessToken);
    } catch (e) {
      // Token hết hạn / giả → 401, không phải lỗi máy chủ.
      return json({ message: e instanceof Error ? e.message : "Token Zalo không hợp lệ" }, 401);
    }
    const db = adminClient();

    let profileId: string;

    if (email && password) {
      // --- Liên kết lần đầu: xác thực bằng tài khoản TaskApp ---
      const { data: signIn, error } = await anonClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error || !signIn.user) return json({ status: "need_link", zaloName: zalo.name });
      profileId = signIn.user.id;

      const { data: taken } = await db
        .from("zalo_links")
        .select("profile_id")
        .eq("zalo_user_id", zalo.id)
        .maybeSingle();
      if (taken && taken.profile_id !== profileId) {
        return json(
          { message: "Zalo này đã liên kết với tài khoản khác. Liên hệ quản trị viên." },
          409,
        );
      }

      const { error: linkErr } = await db.from("zalo_links").upsert(
        {
          profile_id: profileId,
          zalo_user_id: zalo.id,
          zalo_oa_user_id: idByOA ?? null,
          zalo_name: zalo.name,
        },
        { onConflict: "profile_id" },
      );
      if (linkErr) throw linkErr;

      return json({
        status: "ok",
        access_token: signIn.session!.access_token,
        refresh_token: signIn.session!.refresh_token,
      });
    }

    // --- Đăng nhập tự động bằng Zalo đã liên kết ---
    const { data: link } = await db
      .from("zalo_links")
      .select("profile_id, zalo_oa_user_id")
      .eq("zalo_user_id", zalo.id)
      .maybeSingle();
    if (!link) return json({ status: "need_link", zaloName: zalo.name });
    profileId = link.profile_id;

    // Cập nhật ID theo OA nếu mới có (vd người dùng vừa quan tâm OA).
    if (idByOA && idByOA !== link.zalo_oa_user_id) {
      await db
        .from("zalo_links")
        .update({ zalo_oa_user_id: idByOA, zalo_name: zalo.name })
        .eq("profile_id", profileId);
    }

    // Cấp phiên Supabase không cần mật khẩu: tạo magic link phía server rồi
    // xác minh ngay (không gửi email nào).
    const { data: user, error: userErr } = await db.auth.admin.getUserById(profileId);
    if (userErr || !user.user?.email) throw userErr ?? new Error("Không tìm thấy tài khoản");

    const { data: linkData, error: genErr } = await db.auth.admin.generateLink({
      type: "magiclink",
      email: user.user.email,
    });
    if (genErr) throw genErr;

    const { data: otp, error: otpErr } = await anonClient().auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (otpErr || !otp.session) throw otpErr ?? new Error("Không tạo được phiên");

    return json({
      status: "ok",
      access_token: otp.session.access_token,
      refresh_token: otp.session.refresh_token,
    });
  } catch (e) {
    console.error("zalo-auth", e);
    return json({ message: e instanceof Error ? e.message : "Lỗi không xác định" }, 500);
  }
});
