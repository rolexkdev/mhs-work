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

export const metadata: Metadata = {
  title: "Minh Hưng Sikico — Quản lý công việc nội bộ",
  description: "Meeting → Task → Progress → Review → Done",
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
