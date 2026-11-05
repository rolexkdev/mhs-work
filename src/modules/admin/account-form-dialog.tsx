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
import { useOffices } from "@/modules/documents/office-hooks";
import type { UserRole } from "@/types/database";

const NONE_OFFICE = "__none__";

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
  const { data: offices = [] } = useOffices();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [officeId, setOfficeId] = useState<string>(NONE_OFFICE);
  const [department, setDepartment] = useState("");
  const [canManageDocuments, setCanManageDocuments] = useState(false);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);

  useEffect(() => {
    if (!open) return;
    setFullName(account?.fullName ?? "");
    setEmail(account?.email ?? "");
    setRole(account?.role ?? "member");
    setOfficeId(account?.officeId ?? NONE_OFFICE);
    setDepartment(account?.department ?? "");
    setCanManageDocuments(account?.canManageDocuments ?? false);
    setPassword(DEFAULT_PASSWORD);
  }, [open, account]);

  const pending = createAccount.isPending || updateAccount.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;

    const resolvedOfficeId = officeId === NONE_OFFICE ? null : officeId;
    const resolvedDepartment = department.trim() || null;

    if (isEdit && account) {
      await updateAccount.mutateAsync({
        userId: account.id,
        fullName: fullName.trim(),
        role,
        officeId: resolvedOfficeId,
        department: resolvedDepartment,
        canManageDocuments,
      });
    } else {
      await createAccount.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim(),
        role,
        officeId: resolvedOfficeId,
        department: resolvedDepartment,
        canManageDocuments,
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

          <div className="space-y-1.5">
            <Label>Văn phòng</Label>
            <Select value={officeId} onValueChange={setOfficeId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn văn phòng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_OFFICE}>Chưa gán văn phòng</SelectItem>
                {offices.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.code} — {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-department">Phòng ban</Label>
            <Input
              id="a-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="VD: Phòng Hành chính - Nhân sự"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={canManageDocuments}
              onChange={(e) => setCanManageDocuments(e.target.checked)}
            />
            <span>
              <span className="font-medium">Quyền tiếp nhận hồ sơ</span>
              <span className="block text-xs text-muted-foreground">
                Được tạo, sửa, xoá và bàn giao hồ sơ. Người khác chỉ được xem và
                tìm kiếm.
              </span>
            </span>
          </label>

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
