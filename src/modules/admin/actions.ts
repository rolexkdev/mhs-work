"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_PASSWORD,
  MIN_PASSWORD_LENGTH,
  parseAccountLines,
  type AccountRow,
} from "@/modules/admin/constants";
import type { UserRole } from "@/types/database";

/**
 * Server Actions quản lý tài khoản.
 *
 * Mọi action đều tự kiểm tra người gọi có role 'admin' — không tin vào việc
 * client đã ẩn nút. Service role key chỉ tồn tại phía server.
 *
 * Lỗi trả về dưới dạng { error } thay vì throw, vì Next che nội dung lỗi
 * throw từ Server Action khi chạy production.
 */

type Guard =
  | { ok: true; callerId: string; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; error: string };

async function requireAdmin(): Promise<Guard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { ok: false, error: "Chỉ quản trị viên mới quản lý được tài khoản." };
  }

  try {
    return { ok: true, callerId: user.id, admin: createAdminClient() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- danh sách

export async function listAccounts(): Promise<{
  accounts?: AccountRow[];
  error?: string;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const { data: profiles, error } = await guard.admin
    .from("profiles")
    .select("id, email, full_name, role, avatar_url, created_at");
  if (error) return { error: error.message };

  // last_sign_in_at / banned_until chỉ có trong auth.users, không có ở profiles.
  const { data: authList, error: authError } =
    await guard.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) return { error: authError.message };

  const authById = new Map(
    authList.users.map((u) => [
      u.id,
      {
        lastSignInAt: u.last_sign_in_at ?? null,
        bannedUntil:
          (u as unknown as { banned_until?: string | null }).banned_until ??
          null,
      },
    ]),
  );

  const accounts: AccountRow[] = (profiles ?? [])
    .map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      role: p.role,
      avatarUrl: p.avatar_url,
      createdAt: p.created_at,
      lastSignInAt: authById.get(p.id)?.lastSignInAt ?? null,
      bannedUntil: authById.get(p.id)?.bannedUntil ?? null,
    }))
    .sort((a, b) =>
      (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, "vi"),
    );

  return { accounts };
}

// ------------------------------------------------------------------ tạo mới

async function createOne(
  admin: ReturnType<typeof createAdminClient>,
  input: { fullName: string; email: string; role: UserRole; password?: string },
): Promise<{ error?: string }> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const password = input.password?.trim() || DEFAULT_PASSWORD;

  if (!email.includes("@")) return { error: "Email không hợp lệ." };
  if (!fullName) return { error: "Chưa nhập họ tên." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự.` };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // nội bộ — không bắt xác nhận email
    user_metadata: { full_name: fullName, role: input.role },
  });
  if (error) {
    return {
      error: error.message.includes("already been registered")
        ? `Email ${email} đã có tài khoản.`
        : error.message,
    };
  }

  // Trigger handle_new_user đã tạo profile — ghi đè cho chắc tên và vai trò.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      { id: data.user.id, email, full_name: fullName, role: input.role },
      { onConflict: "id" },
    );
  if (profileError) return { error: profileError.message };

  return {};
}

export async function createAccount(input: {
  fullName: string;
  email: string;
  role: UserRole;
  password?: string;
}): Promise<{ error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  return createOne(guard.admin, input);
}

export async function createAccountsBulk(input: {
  text: string;
  password?: string;
}): Promise<{
  created?: string[];
  failed?: { email: string; reason: string }[];
  skipped?: string[];
  error?: string;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const { accounts, skipped } = parseAccountLines(input.text);
  if (accounts.length === 0) {
    return { error: "Không đọc được dòng nào có email hợp lệ." };
  }

  const created: string[] = [];
  const failed: { email: string; reason: string }[] = [];

  for (const acc of accounts) {
    const { error } = await createOne(guard.admin, {
      ...acc,
      password: input.password,
    });
    if (error) failed.push({ email: acc.email, reason: error });
    else created.push(acc.email);
  }

  return { created, failed, skipped };
}

// ------------------------------------------------------------------ cập nhật

export async function updateAccount(input: {
  userId: string;
  fullName: string;
  role: UserRole;
}): Promise<{ error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const fullName = input.fullName.trim();
  if (!fullName) return { error: "Chưa nhập họ tên." };

  // Tự hạ quyền chính mình sẽ mất luôn trang này giữa chừng.
  if (input.userId === guard.callerId && input.role !== "admin") {
    return {
      error:
        "Không thể tự hạ quyền của chính mình. Nhờ quản trị viên khác đổi giúp.",
    };
  }

  const { error } = await guard.admin
    .from("profiles")
    .update({ full_name: fullName, role: input.role })
    .eq("id", input.userId);

  return error ? { error: error.message } : {};
}

export async function resetPassword(input: {
  userId: string;
  password?: string;
}): Promise<{ password?: string; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const password = input.password?.trim() || DEFAULT_PASSWORD;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự.` };
  }

  const { error } = await guard.admin.auth.admin.updateUserById(input.userId, {
    password,
  });
  if (error) return { error: error.message };

  return { password };
}

/** Khoá / mở khoá đăng nhập. Dùng thay cho xoá khi nhân viên nghỉ việc. */
export async function setAccountLocked(input: {
  userId: string;
  locked: boolean;
}): Promise<{ error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  if (input.userId === guard.callerId && input.locked) {
    return { error: "Không thể tự khoá tài khoản của chính mình." };
  }

  const { error } = await guard.admin.auth.admin.updateUserById(input.userId, {
    // 100 năm ~ khoá vô thời hạn; "none" để mở lại.
    ban_duration: input.locked ? "876000h" : "none",
  });

  return error ? { error: error.message } : {};
}

// --------------------------------------------------------------------- xoá

/**
 * Các bảng tham chiếu profiles KHÔNG có ON DELETE, nên Postgres sẽ chặn xoá
 * nếu nhân viên còn dữ liệu. Đếm trước để báo lý do cụ thể thay vì để lộ
 * thông báo vi phạm khoá ngoại.
 */
async function countBlockingRows(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const head = { count: "exact" as const, head: true };

  const [tasks, meetings, comments, attachments, logs] = await Promise.all([
    admin.from("tasks").select("*", head).eq("created_by", userId),
    admin.from("meetings").select("*", head).eq("created_by", userId),
    admin.from("task_comments").select("*", head).eq("user_id", userId),
    admin.from("task_attachments").select("*", head).eq("uploaded_by", userId),
    admin.from("task_logs").select("*", head).eq("created_by", userId),
  ]);

  return [
    { count: tasks.count, label: "công việc đã tạo" },
    { count: meetings.count, label: "cuộc họp đã tạo" },
    { count: comments.count, label: "bình luận" },
    { count: attachments.count, label: "file đính kèm" },
    { count: logs.count, label: "dòng lịch sử" },
  ]
    .filter((r) => (r.count ?? 0) > 0)
    .map((r) => `${r.count} ${r.label}`);
}

export async function deleteAccount(input: {
  userId: string;
}): Promise<{ error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  if (input.userId === guard.callerId) {
    return { error: "Không thể tự xoá tài khoản của chính mình." };
  }

  const blocking = await countBlockingRows(guard.admin, input.userId);
  if (blocking.length > 0) {
    return {
      error: `Không xoá được vì nhân viên này còn ${blocking.join(", ")} trong hệ thống. Hãy dùng "Khoá tài khoản" để chặn đăng nhập mà vẫn giữ nguyên dữ liệu.`,
    };
  }

  const { error } = await guard.admin.auth.admin.deleteUser(input.userId);
  return error ? { error: error.message } : {};
}
