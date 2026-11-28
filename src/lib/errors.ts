const DETAIL_MESSAGES: Record<string, string> = {
  auth_required: "Vui lòng đăng nhập để thực hiện thao tác này.",
};

/** Dịch lỗi Supabase/PostgREST sang thông báo tiếng Việt thân thiện. */
export function friendlyError(
  e: unknown,
  fallback = "Có lỗi xảy ra. Vui lòng thử lại.",
): string {
  const err = e as {
    code?: string;
    message?: string;
    details?: string | null;
  } | null;
  const code = err?.code;
  const msg = err?.message ?? "";
  const details = err?.details?.trim() ?? "";

  if (details && DETAIL_MESSAGES[details]) {
    return DETAIL_MESSAGES[details];
  }

  // Category unique constraint (department, lower(btrim(name))).
  if (
    code === "23505" &&
    (msg.includes("uq_task_categories_department_name") ||
      details.includes("uq_task_categories_department_name"))
  ) {
    return "Tên hạng mục này đã tồn tại, vui lòng chọn tên khác.";
  }

  if (code === "23503") {
    return "Không thể xoá vì dữ liệu này đang được sử dụng.";
  }

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
