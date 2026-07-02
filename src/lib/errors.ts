/** Dịch lỗi Supabase/PostgREST sang thông báo tiếng Việt thân thiện. */
export function friendlyError(
  e: unknown,
  fallback = "Có lỗi xảy ra. Vui lòng thử lại.",
): string {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code;
  const msg = err?.message ?? "";

  // UPDATE/DELETE khớp 0 dòng → thường do RLS chặn (không đủ quyền).
  if (code === "PGRST116" || msg.includes("coerce the result")) {
    return "Bạn không có quyền chỉnh sửa mục này — chỉ quản lý mới được phép.";
  }
  // Vi phạm Row Level Security.
  if (code === "42501" || msg.toLowerCase().includes("row-level security")) {
    return "Bạn không có quyền thực hiện thao tác này.";
  }
  return msg || fallback;
}
