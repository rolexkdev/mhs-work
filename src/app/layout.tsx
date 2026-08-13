import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const fontSans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * Địa chỉ thật của trang. Phải là URL tuyệt đối thì Zalo / Messenger mới tải
 * được og:image khi ai đó dán link ra ngoài.
 */
const siteUrl = "https://mhs-work.vercel.app";

const TITLE = "Minh Hưng Sikico — Quản lý công việc nội bộ";
const DESCRIPTION =
  "Hệ thống nội bộ theo dõi công việc giao ban, tiến độ thực hiện và báo cáo hằng ngày của các phòng ban.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: TITLE,
    template: "%s · Minh Hưng Sikico",
  },
  description: DESCRIPTION,
  applicationName: "Quản lý công việc Minh Hưng Sikico",
  // Trang nội bộ — không cho công cụ tìm kiếm lập chỉ mục.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "Minh Hưng Sikico",
    title: TITLE,
    description: DESCRIPTION,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={fontSans.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
