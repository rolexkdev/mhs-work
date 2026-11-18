import type { UserRole } from "@/types/database";

/** Mật khẩu mặc định khi tạo tài khoản mới hoặc đặt lại cho nhân viên. */
export const DEFAULT_PASSWORD = "Sikico@2026";

/** Độ dài tối thiểu Supabase Auth chấp nhận. */
export const MIN_PASSWORD_LENGTH = 6;

export const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  {
    value: "member",
    label: "Thành viên",
    hint: "Xem và chỉnh sửa công việc như mọi người.",
  },
  {
    value: "leader",
    label: "Trưởng nhóm",
    hint: "Hiện tại quyền trên công việc giống Thành viên.",
  },
  {
    value: "admin",
    label: "Quản trị",
    hint: "Thêm quyền quản lý tài khoản của cả ban.",
  },
];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Quản trị",
  leader: "Trưởng nhóm",
  member: "Thành viên",
};

/** Một dòng trong bảng quản lý tài khoản (gộp profiles + auth.users). */
export type AccountRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: string;
  /** null = chưa đăng nhập lần nào. */
  lastSignInAt: string | null;
  /** Khác null và còn hiệu lực = tài khoản đang bị khoá. */
  bannedUntil: string | null;
};

export type ParsedAccount = {
  fullName: string;
  email: string;
  role: UserRole;
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function toRole(raw: string): UserRole {
  const v = raw.trim().toLowerCase();
  if (v === "admin" || v === "quản trị") return "admin";
  if (v === "leader" || v === "trưởng nhóm") return "leader";
  return "member";
}

/**
 * Tách danh sách dán thô thành từng tài khoản.
 *
 * Chấp nhận mọi kiểu phân cách (tab, nhiều dấu cách, `|`, `,`) vì bảng copy
 * từ Excel/Word hay lẫn lộn: neo vào địa chỉ email trong dòng, phần trước là
 * họ tên, phần sau là vai trò.
 *
 *   Phạm Thị Anh Đào    daopham.mh@sikico.com   admin
 *   Vũ Minh Phú phuvu.mh@sikico.com member
 */
export function parseAccountLines(text: string): {
  accounts: ParsedAccount[];
  skipped: string[];
} {
  const accounts: ParsedAccount[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(EMAIL_RE);
    if (!match) {
      skipped.push(line);
      continue;
    }

    const email = match[0].toLowerCase();
    if (seen.has(email)) continue; // trùng trong chính danh sách dán vào
    seen.add(email);

    const fullName = line
      .slice(0, match.index)
      .replace(/[|,;\t]+/g, " ")
      .trim();
    const role = toRole(line.slice(match.index! + match[0].length).replace(/[|,;\t]+/g, " "));

    // Dòng tiêu đề kiểu "Họ Tên | Email | Role" không có email nên đã bị loại
    // ở trên; ở đây chỉ cần chặn trường hợp thiếu tên.
    if (!fullName) {
      skipped.push(line);
      continue;
    }

    accounts.push({ fullName, email, role });
  }

  return { accounts, skipped };
}
