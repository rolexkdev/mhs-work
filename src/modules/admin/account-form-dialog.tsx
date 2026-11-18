"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PASSWORD,
  ROLE_OPTIONS,
  type AccountRow,
} from "@/modules/admin/constants";
import { useCreateAccount, useUpdateAccount } from "@/modules/admin/hooks";
import type { UserRole } from "@/types/database";

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Có giá trị = sửa tài khoản đang có; bỏ trống = tạo mới. */
  account?: AccountRow | null;
}) {
  const isEdit = !!account;
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [password, setPassword] = useState(DEFAULT_PASSWORD);

  useEffect(() => {
    if (!open) return;
    setFullName(account?.fullName ?? "");
    setEmail(account?.email ?? "");
    setRole(account?.role ?? "member");
    setPassword(DEFAULT_PASSWORD);
  }, [open, account]);

  const pending = createAccount.isPending || updateAccount.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;

    if (isEdit && account) {
      await updateAccount.mutateAsync({
        userId: account.id,
        fullName: fullName.trim(),
        role,
      });
    } else {
      await createAccount.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim(),
        role,
        password,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa thông tin tài khoản" : "Tạo tài khoản"}
          </DialogTitle>
          {!isEdit && (
            <DialogDescription>
              Tài khoản dùng được ngay, không cần nhân viên xác nhận email.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-name">Họ tên *</Label>
            <Input
              id="a-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="VD: Nguyễn Thị Kiều Trinh"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-email">Email *</Label>
            <Input
              id="a-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trinhnguyen.mh@sikico.com"
              disabled={isEdit}
              required
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Email là tên đăng nhập nên không đổi được ở đây. Cần đổi thì tạo
                tài khoản mới rồi xoá tài khoản cũ.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Vai trò</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ROLE_OPTIONS.find((r) => r.value === role)?.hint}
            </p>
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="a-password">Mật khẩu ban đầu</Label>
              <Input
                id="a-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Đọc mật khẩu này cho nhân viên, họ tự đổi lại trong phần hồ sơ.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : isEdit ? "Lưu" : "Tạo tài khoản"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
