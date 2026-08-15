"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  ListChecks,
  LogOut,
  Loader2,
  Search,
  ClipboardCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brand } from "@/components/brand";
import { CommandPalette } from "@/components/command-palette";
import { RealtimeSync } from "@/components/realtime-sync";
import { ProfileDialog } from "@/modules/auth/profile-dialog";
import { signOut } from "@/modules/auth/actions";
import type { UserRole } from "@/types/database";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/meetings", label: "Họp giao ban", icon: CalendarDays },
  { href: "/tasks", label: "Công việc", icon: ListChecks },
  { href: "/updates", label: "Báo cáo công việc", icon: ClipboardCheck },
];

/**
 * Nhãn ngắn cho thanh tab dưới đáy — màn hình 360px chỉ vừa ~9 ký tự mỗi tab,
 * nhãn dài của sidebar sẽ bị cắt cụt khó đọc.
 */
const SHORT_LABEL: Record<string, string> = {
  "/": "Tổng quan",
  "/meetings": "Giao ban",
  "/tasks": "Công việc",
  "/updates": "Báo cáo",
  "/accounts": "Tài khoản",
};

/** Chỉ hiện với role 'admin' — trang /accounts cũng tự chặn lại ở server. */
const ADMIN_NAV: NavItem = {
  href: "/accounts",
  label: "Quản lý tài khoản",
  icon: UserCog,
};

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Quản trị",
  leader: "Trưởng nhóm",
  member: "Thành viên",
};

export function AppShell({
  fullName,
  email,
  role,
  avatarUrl,
  children,
}: {
  fullName: string | null;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const navItems = role === "admin" ? [...NAV, ADMIN_NAV] : NAV;
  const [profileOpen, setProfileOpen] = useState(false);
  // Highlight tab được bấm ngay lập tức, không chờ điều hướng xong.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const displayName = fullName ?? email;

  // Khi điều hướng hoàn tất (pathname đổi), bỏ trạng thái pending.
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const effectivePath = pendingHref ?? pathname;
  const isActive = (href: string, exact?: boolean) =>
    exact ? effectivePath === href : effectivePath.startsWith(href);
  const handleNavClick = (href: string) => {
    if (href !== pathname) setPendingHref(href);
  };

  // Tên mục đang xem — mobile không có sidebar nên phải nói rõ đang ở đâu.
  const currentLabel =
    [...navItems]
      .sort((a, b) => b.href.length - a.href.length)
      .find(({ href, exact }) => isActive(href, exact))?.label ?? "";

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar — đứng yên khi nội dung bên phải cuộn dài */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center border-b px-5">
          <Brand />
        </div>

        <div className="px-3 pt-3">
          <button
            onClick={() =>
              window.dispatchEvent(new Event("command-palette:open"))
            }
            className="flex w-full items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Search className="h-4 w-4" />
            <span>Tìm kiếm...</span>
            <kbd className="ml-auto rounded border bg-background px-1.5 text-xs font-medium">
              Ctrl K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            const pending = pendingHref === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => handleNavClick(href)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <button
            onClick={() => setProfileOpen(true)}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
          >
            <Avatar>
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback>{initials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABEL[role]}
              </p>
            </div>
          </button>
          <form action={signOut}>
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              className="mt-1 w-full justify-start text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </Button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Thanh trên cùng — chỉ mobile: tên mục đang xem, tìm kiếm, tài khoản */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
          <Brand size={26} showText={false} />
          <span className="min-w-0 flex-1 truncate text-base font-semibold">
            {currentLabel}
          </span>

          <button
            onClick={() =>
              window.dispatchEvent(new Event("command-palette:open"))
            }
            aria-label="Tìm kiếm"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
          >
            <Search className="h-5 w-5" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Tài khoản"
                className="flex h-10 w-10 items-center justify-center rounded-full active:bg-accent"
              >
                <Avatar className="h-8 w-8">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={displayName} />
                  )}
                  <AvatarFallback className="text-[11px]">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="border-b px-2 py-1.5">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[role]}
                </p>
              </div>
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <UserCog className="h-4 w-4" /> Hồ sơ cá nhân
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOut className="h-4 w-4" /> Đăng xuất
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* pb-24 chừa chỗ cho thanh tab dưới đáy, không che mất nội dung cuối trang */}
        <main className="flex-1 p-4 pb-24 sm:p-6 md:pb-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Thanh tab dưới đáy — chỉ mobile, nằm trong tầm ngón cái */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
          }}
        >
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            const pending = pendingHref === href;
            return (
              <Link
                key={href}
                href={href}
                title={label}
                onClick={() => handleNavClick(href)}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground active:bg-accent",
                )}
              >
                {pending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                )}
                <span
                  className={cn(
                    "w-full truncate text-center text-[10px] leading-none",
                    active && "font-semibold",
                  )}
                >
                  {SHORT_LABEL[href] ?? label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette />
      <RealtimeSync />

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        fullName={fullName}
        email={email}
        avatarUrl={avatarUrl}
      />
    </div>
  );
}
