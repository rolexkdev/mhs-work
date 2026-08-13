import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Ảnh xem trước khi dán link vào Zalo / Messenger / Teams.
 * Next sinh ảnh này ở /opengraph-image và tự gắn vào thẻ og:image.
 */
export const runtime = "nodejs";
export const alt = "Minh Hưng Sikico — Quản lý công việc nội bộ";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MAROON = "#7D1C22";

export default async function OpengraphImage() {
  // Satori không tải được ảnh từ đường dẫn tương đối → nhúng thẳng dạng data URI.
  const logo = await readFile(path.join(process.cwd(), "public/logo.jpg"));
  const logoSrc = `data:image/jpeg;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          // Nền đỏ mận của thương hiệu: nổi hẳn giữa luồng chat toàn thẻ trắng.
          background: `linear-gradient(135deg, ${MAROON} 0%, #5C1219 100%)`,
          fontFamily: "sans-serif",
        }}
      >
        {/*
          logo.jpg có viền trắng rất rộng: phần hình thật chỉ nằm trong khoảng
          x 400→1520, y 340→720 của khung 1912×1084. Phóng ảnh lên rồi dịch âm
          trong một khung overflow:hidden để cắt viền, nếu không logo sẽ bé xíu
          giữa một mảng trắng trống.
        */}
        <div
          style={{
            display: "flex",
            background: "#ffffff",
            borderRadius: 16,
            padding: "22px 34px",
            alignSelf: "flex-start",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 271,
              height: 92,
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt=""
              width={463}
              height={262}
              style={{ marginLeft: -97, marginTop: -82 }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 74,
            fontWeight: 700,
            color: "#ffffff",
            marginTop: 46,
            letterSpacing: -1.5,
          }}
        >
          Quản lý công việc nội bộ
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 26,
            fontSize: 32,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          Giao ban · Tiến độ · Báo cáo hằng ngày
        </div>
      </div>
    ),
    size,
  );
}
