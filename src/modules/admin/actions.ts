"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, formatAdminError } from "@/lib/supabase/admin";
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

type CallerGuard =
  | {
      ok: true;
      callerId: string;
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | { ok: false; error: string };

type Guard =
  | { ok: true; callerId: string; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; error: string };

async function requireAdminCaller(): Promise<CallerGuard> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

  // Vai trò luôn đọc từ DB chứ không lấy trong JWT: hạ quyền một người phải có
  // tác dụng ngay, không đợi token của họ hết hạn.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "admin") {
    return { ok: false, error: "Chỉ quản trị viên mới quản lý được tài khoản." };
  }

  return { ok: true, callerId: userId, supabase };
}

async function requireAdmin(): Promise<Guard> {
  const caller = await requireAdminCaller();
  if (!caller.ok) return caller;

  try {
    return { ok: true, callerId: caller.callerId, admin: createAdminClient() };
  } catch (e) {
    return { ok: false, error: formatAdminError(e) };
  }
}

// ---------------------------------------------------------------- danh sách

export async function listAccounts(): Promise<{
  accounts?: AccountRow[];
  warning?: string;
  error?: string;
}> {
  const caller = await requireAdminCaller();
  if (!caller.ok) return { error: caller.error };

  let admin: ReturnType<typeof createAdminClient> | null = null;
  let warning: string | undefined;
  try {
    admin = createAdminClient();
  } catch (e) {
    warning = formatAdminError(e);
  }

  const profileColumns =
    "id, email, full_name, role, office_id, department, can_manage_documents, avatar_url, created_at" as const;

  let { data: profiles, error } = await (admin ?? caller.supabase)
    .from("profiles")
    .select(profileColumns);

  // Fall back to the verified admin session client if the service-role client
  // failed or returned 0 rows (e.g. an anon key filtered out by RLS).
  if (admin && (error || !profiles || profiles.length === 0)) {
    const fallback = await caller.supabase
      .from("profiles")
      .select(profileColumns);
    if (!fallback.error) {
      profiles = fallback.data;
      error = null;
    }
  }

  if (error) return { error: formatAdminError(error) };

  // last_sign_in_at / banned_until chỉ có trong auth.users, không có ở profiles.
  // Degrade gracefully when Auth Admin API fails so the accounts page still loads.
  const authById = new Map<
    string,
    { lastSignInAt: string | null; bannedUntil: string | null }
  >();

  if (admin) {
    const { data: authList, error: authError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authError) {
      warning = formatAdminError(authError);
    } else {
      for (const u of authList.users) {
        authById.set(u.id, {
          lastSignInAt: u.last_sign_in_at ?? null,
          bannedUntil:
            (u as unknown as { banned_until?: string | null }).banned_until ??
            null,
        });
      }
    }
  }

  const accounts: AccountRow[] = (profiles ?? [])
    .map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      role: p.role,
      officeId: p.office_id ?? null,
      department: p.department ?? null,
      canManageDocuments: p.can_manage_documents ?? false,
      avatarUrl: p.avatar_url,
      createdAt: p.created_at,
      lastSignInAt: authById.get(p.id)?.lastSignInAt ?? null,
      bannedUntil: authById.get(p.id)?.bannedUntil ?? null,
    }))
    .sort((a, b) =>
      (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, "vi"),
    );

  return { accounts, ...(warning ? { warning } : {}) };
}

// ------------------------------------------------------------------ tạo mới

async function createOne(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    fullName: string;
    email: string;
    role: UserRole;
    officeId?: string | null;
    department?: string | null;
    canManageDocuments?: boolean;
    password?: string;
  },
): Promise<{ error?: string }> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const password = input.password?.trim() || DEFAULT_PASSWORD;
  const officeId = input.officeId?.trim() || null;
  const department = input.department?.trim() || null;

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
        : formatAdminError(error),
    };
  }

  // Trigger handle_new_user đã tạo profile — ghi đè cho chắc tên và vai trò.
  // Also persist office_id and department on profile creation.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: data.user.id,
        email,
        full_name: fullName,
        role: input.role,
        office_id: officeId,
        department,
        can_manage_documents: input.canManageDocuments ?? false,
      },
      { onConflict: "id" },
    );
  if (profileError) return { error: formatAdminError(profileError) };

  return {};
}

export async function createAccount(input: {
  fullName: string;
  email: string;
  role: UserRole;
  officeId?: string | null;
  department?: string | null;
  canManageDocuments?: boolean;
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
  officeId?: string | null;
  department?: string | null;
  canManageDocuments?: boolean;
}): Promise<{ error?: string }> {
  const caller = await requireAdminCaller();
  if (!caller.ok) return { error: caller.error };

  const fullName = input.fullName.trim();
  if (!fullName) return { error: "Chưa nhập họ tên." };

  // Tự hạ quyền chính mình sẽ mất luôn trang này giữa chừng.
  if (input.userId === caller.callerId && input.role !== "admin") {
    return {
      error:
        "Không thể tự hạ quyền của chính mình. Nhờ quản trị viên khác đổi giúp.",
    };
  }

  const officeId = input.officeId?.trim() || null;
  const department = input.department?.trim() || null;

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    // Fall back to the verified admin session client below; RLS policy
    // profiles_admin_all and guard_profile_protected_columns allow admins.
  }

  const { error } = await (admin ?? caller.supabase)
    .from("profiles")
    .update({
      full_name: fullName,
      role: input.role,
      office_id: officeId,
      department,
      ...(input.canManageDocuments === undefined
        ? {}
        : { can_manage_documents: input.canManageDocuments }),
    })
    .eq("id", input.userId);

  return error ? { error: formatAdminError(error) } : {};
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
  if (error) return { error: formatAdminError(error) };

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

  return error ? { error: formatAdminError(error) } : {};
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
  return error ? { error: formatAdminError(error) } : {};
}
