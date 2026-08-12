"use client";

import { useMemo, useState } from "react";
import {
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL, type AccountRow } from "@/modules/admin/constants";
import {
  useAccounts,
  useDeleteAccount,
  useSetAccountLocked,
} from "@/modules/admin/hooks";
import { AccountFormDialog } from "@/modules/admin/account-form-dialog";
import { BulkCreateDialog } from "@/modules/admin/bulk-create-dialog";
import { ResetPasswordDialog } from "@/modules/admin/reset-password-dialog";

const ROLE_BADGE: Record<AccountRow["role"], string> = {
  admin: "border-amber-200 bg-amber-50 text-amber-700",
  leader: "border-blue-200 bg-blue-50 text-blue-700",
  member: "border-slate-200 bg-slate-50 text-slate-600",
};

function isLocked(account: AccountRow): boolean {
  if (!account.bannedUntil) return false;
  return new Date(account.bannedUntil) > new Date();
}

export function AccountsManager({ currentUserId }: { currentUserId: string }) {
  const { data: accounts = [], isLoading, error } = useAccounts();
  const setLocked = useSetAccountLocked();
  const deleteAccount = useDeleteAccount();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [resetting, setResetting] = useState<AccountRow | null>(null);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.email.toLowerCase().includes(q) ||
        (a.fullName ?? "").toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const adminCount = accounts.filter((a) => a.role === "admin").length;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc email..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <Users className="h-4 w-4" /> Tạo hàng loạt
        </Button>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Tạo tài khoản
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {accounts.length} tài khoản · {adminCount} quản trị
        {search && ` · đang lọc ${filtered.length}`}
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Nhân viên</th>
                <th className="px-4 py-2.5 text-left font-medium">Vai trò</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  Đăng nhập gần nhất
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Ngày tạo</th>
                <th className="w-12 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((account) => {
                const locked = isLocked(account);
                const isSelf = account.id === currentUserId;
                const displayName = account.fullName ?? account.email;

                return (
                  <tr
                    key={account.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {account.avatarUrl && (
                            <AvatarImage
                              src={account.avatarUrl}
                              alt={displayName}
                            />
                          )}
                          <AvatarFallback className="text-xs">
                            {initials(displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-medium">
                            {displayName}
                            {isSelf && (
                              <span className="text-xs font-normal text-muted-foreground">
                                (bạn)
                              </span>
                            )}
                            {locked && (
                              <Badge
                                variant="outline"
                                className="border-destructive/40 text-destructive"
                              >
                                Đã khoá
                              </Badge>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {account.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                          ROLE_BADGE[account.role],
                        )}
                      >
                        {ROLE_LABEL[account.role]}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 text-muted-foreground">
                      {account.lastSignInAt ? (
                        formatDateTime(account.lastSignInAt)
                      ) : (
                        <span className="text-xs italic">
                          Chưa đăng nhập lần nào
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(account.createdAt)}
                    </td>

                    <td className="px-4 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(account);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Sửa tên & vai trò
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setResetting(account)}
                          >
                            <KeyRound className="h-4 w-4" /> Đặt lại mật khẩu
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isSelf || setLocked.isPending}
                            onClick={() =>
                              setLocked.mutate({
                                userId: account.id,
                                locked: !locked,
                              })
                            }
                          >
                            {locked ? (
                              <>
                                <Unlock className="h-4 w-4" /> Mở khoá đăng nhập
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4" /> Khoá đăng nhập
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isSelf}
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(account)}
                          >
                            <Trash2 className="h-4 w-4" /> Xoá tài khoản
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Không tìm thấy tài khoản nào khớp &ldquo;{search}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
      />
      <BulkCreateDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <ResetPasswordDialog
        open={!!resetting}
        onOpenChange={(v) => !v && setResetting(null)}
        account={resetting}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Xoá tài khoản?"
        description={`Xoá vĩnh viễn ${deleting?.fullName ?? deleting?.email}. Nếu nhân viên này đã tạo công việc hay bình luận thì hệ thống sẽ chặn để giữ nguyên dữ liệu — khi đó hãy dùng "Khoá đăng nhập".`}
        confirmLabel="Xoá"
        destructive
        onConfirm={() => deleting && deleteAccount.mutate(deleting.id)}
      />
    </div>
  );
}
