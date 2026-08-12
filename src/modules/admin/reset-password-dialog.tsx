"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
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
import { DEFAULT_PASSWORD, type AccountRow } from "@/modules/admin/constants";
import { useResetPassword } from "@/modules/admin/hooks";

export function ResetPasswordDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: AccountRow | null;
}) {
  const resetPassword = useResetPassword();
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  // Chỉ hiện sau khi đặt lại thành công, để admin đọc cho nhân viên.
  const [issued, setIssued] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword(DEFAULT_PASSWORD);
    setIssued(null);
  }, [open, account]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    const result = await resetPassword.mutateAsync({
      userId: account.id,
      password,
    });
    setIssued(result);
  }

  async function copy() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued);
    toast.success("Đã copy mật khẩu");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đặt lại mật khẩu</DialogTitle>
          <DialogDescription>
            {account?.fullName ?? account?.email} — mật khẩu cũ không xem được
            (hệ thống chỉ lưu bản mã hoá một chiều), chỉ có thể đặt mật khẩu
            mới.
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="text-xs text-muted-foreground">Mật khẩu mới</p>
              <p className="mt-1 font-mono text-lg font-semibold">{issued}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Đọc hoặc gửi mật khẩu này cho nhân viên. Đóng hộp thoại là không
              xem lại được nữa — nhưng bạn luôn đặt lại được lần khác.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={copy}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Xong
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-password">Mật khẩu mới</Label>
              <Input
                id="r-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Để nguyên là dùng mật khẩu mặc định của ban.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={resetPassword.isPending}>
                <KeyRound className="h-4 w-4" />
                {resetPassword.isPending ? "Đang đặt lại..." : "Đặt lại"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
