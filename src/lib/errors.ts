const DETAIL_MESSAGES: Record<string, string> = {
  auth_required: "Vui lòng đăng nhập để thực hiện thao tác này.",
  shipment_no_documents: "Vui lòng chọn ít nhất một hồ sơ.",
  shipment_no_from_office: "Chưa xác định được văn phòng gửi đi.",
  shipment_destination_invalid:
    "Vui lòng chọn đúng một nơi nhận (văn phòng hoặc đơn vị bên ngoài).",
  shipment_same_office: "Văn phòng nhận phải khác văn phòng gửi đi.",
  external_unit_inactive:
    "Đơn vị nhận bên ngoài không tồn tại hoặc đã ngừng sử dụng.",
  shipment_not_holder:
    "Chỉ người đang giữ hồ sơ (bản chính hoặc bản sao) hoặc quản lý mới được gửi đi.",
  shipment_document_unavailable:
    "Một hoặc nhiều hồ sơ đang ở trạng thái không thể gửi đi.",
  shipment_document_has_pending_handoff:
    "Hồ sơ đang có lượt bàn giao chờ xác nhận nên chưa thể gửi vận chuyển.",
  shipment_not_open: "Chuyến gửi này không còn ở trạng thái đang vận chuyển.",
  shipment_item_not_open:
    "Một hoặc nhiều hồ sơ đã được xác nhận hoặc không thuộc chuyến gửi này.",
  shipment_not_destination_staff:
    "Chỉ nhân sự thuộc văn phòng nhận hoặc quản lý mới được xác nhận đã đến.",
  shipment_not_sender:
    "Chỉ người gửi chuyến này hoặc quản lý mới được thực hiện thao tác này.",
  lost_reason_required: "Vui lòng nhập lý do thất lạc.",
  document_already_lost: "Hồ sơ này đã được ghi nhận thất lạc trước đó.",
  lost_not_allowed: "Bạn không có quyền báo thất lạc cho hồ sơ này.",
  shipment_cannot_cancel:
    "Chỉ có thể huỷ chuyến khi đang vận chuyển và chưa có hồ sơ nào được nhận hoặc báo thất lạc.",
  handoff_document_unavailable:
    "Hồ sơ đang ở trạng thái không thể bàn giao (đang vận chuyển, đã gửi đơn vị ngoài, lưu trữ hoặc thất lạc).",
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

  if (code === "23503") {
    return "Không thể xoá vì dữ liệu này đang được sử dụng (ví dụ hồ sơ đã nằm trong một chuyến gửi).";
  }

  if (
    code === "23505" &&
    (details.includes("external_units") ||
      msg.includes("external_units") ||
      details.includes("idx_external_units_active_name") ||
      msg.includes("idx_external_units_active_name"))
  ) {
    return "Tên đơn vị nhận đã tồn tại.";
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
