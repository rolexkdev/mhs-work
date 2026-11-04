/**
 * Bật/tắt tạm các tính năng trên giao diện (chỉ ẩn khỏi menu/tìm kiếm,
 * route và dữ liệu vẫn giữ nguyên).
 */
export const FEATURES = {
  /** Họp giao ban — đầu mục chỉ đạo, giao việc & theo dõi xử lý. */
  meetings: true,
  /** Hồ sơ – Công văn — theo dõi luân chuyển & xác nhận bàn giao. */
  documents: true,
} as const;
