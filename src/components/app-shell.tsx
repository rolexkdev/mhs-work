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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { ProfileDialog } from "@/modules/auth/profile-dialog";
import { signOut } from "@/modules/auth/actions";
import type { UserRole } from "@/types/database";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/meetings", label: "Họp giao ban", icon: CalendarDays },
  { href: "/tasks", label: "Công việc", icon: ListChecks },
];

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

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center border-b px-5">
          <Brand />
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
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
        {/* Topbar (mobile nav) */}
        <header className="flex h-14 items-center gap-2 border-b bg-background px-4 md:hidden">
          <Brand size={26} showText={false} />
          <button onClick={() => setProfileOpen(true)} className="rounded-full">
            <Avatar className="h-7 w-7">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className="text-[10px]">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
          </button>
          <nav className="ml-auto flex gap-1">
            {NAV.map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(href, exact);
              const pending = pendingHref === href;
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  onClick={() => handleNavClick(href)}
                  className={cn(
                    "rounded-md p-2",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

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
