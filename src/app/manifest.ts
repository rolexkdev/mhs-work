import type { MetadataRoute } from "next";

/**
 * Cho phép cài app lên màn hình chính của điện thoại ("Thêm vào màn hình chính"
 * trên Safari/Chrome). Mở từ icon sẽ chạy toàn màn hình, không có thanh địa chỉ
 * — dùng như một app thật, không cần máy tính.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Minh Hưng Sikico — Quản lý công việc",
    short_name: "MHS Work",
    description:
      "Theo dõi công việc giao ban, tiến độ thực hiện và báo cáo hằng ngày.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#7D1C22",
    lang: "vi",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
