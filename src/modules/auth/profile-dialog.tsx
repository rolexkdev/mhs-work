"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, KeyRound, Loader2 } from "lucide-react";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useChangePassword,
  useUpdateProfile,
} from "@/modules/auth/profile-hooks";

/** Supabase Auth yêu cầu mật khẩu tối thiểu 6 ký tự. */
const MIN_PASSWORD_LENGTH = 6;

export function ProfileDialog({
  open,
  onOpenChange,
  fullName,
  email,
  avatarUrl,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const update = useUpdateProfile();
  const changePassword = useChangePassword();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(fullName ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);

  // Phần đổi mật khẩu, ẩn cho tới khi người dùng bấm mở.
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const resetPasswordForm = () => {
    setPwOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  // Đồng bộ lại khi mở dialog với dữ liệu mới nhất.
  useEffect(() => {
    if (open) {
      setName(fullName ?? "");
      setFile(null);
      setPreview(avatarUrl);
      resetPasswordForm();
    }
  }, [open, fullName, avatarUrl]);

  // Dọn object URL tạm khi đổi ảnh / đóng.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const display = name.trim() || email;

  // Thông báo lỗi ngay dưới ô, chỉ hiện khi người dùng đã gõ gì đó.
  const passwordError =
    newPassword && newPassword.length < MIN_PASSWORD_LENGTH
      ? `Mật khẩu mới phải từ ${MIN_PASSWORD_LENGTH} ký tự.`
      : confirmPassword && confirmPassword !== newPassword
        ? "Nhập lại mật khẩu chưa khớp."
        : null;

  const canChangePassword =
    !!currentPassword &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirmPassword;

  function handleChangePassword() {
    changePassword.mutate(
      { currentPassword, newPassword },
      { onSuccess: resetPasswordForm },
    );
  }

  function handleSave() {
    update.mutate(
      { fullName: name || email, avatarFile: file },
      {
        onSuccess: () => {
          router.refresh();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Hồ sơ của tôi</DialogTitle>
          <DialogDescription>
            Cập nhật ảnh đại diện và tên hiển thị.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative rounded-full"
          >
            <Avatar className="h-20 w-20">
              {preview && <AvatarImage src={preview} alt={display} />}
              <AvatarFallback className="text-lg">
                {initials(display)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">{email}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-name">Tên hiển thị</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên của bạn"
          />
        </div>

        <div className="border-t pt-3">
          {!pwOpen ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setPwOpen(true)}
            >
              <KeyRound className="h-4 w-4" /> Đổi mật khẩu
            </Button>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (canChangePassword) handleChangePassword();
              }}
            >
              <Label htmlFor="pw-current">Mật khẩu hiện tại</Label>
              <Input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoFocus
              />

              <Label htmlFor="pw-new">Mật khẩu mới</Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />

              <Label htmlFor="pw-confirm">Nhập lại mật khẩu mới</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={resetPasswordForm}
                  disabled={changePassword.isPending}
                >
                  Huỷ
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="flex-1"
                  disabled={!canChangePassword || changePassword.isPending}
                >
                  {changePassword.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Đổi mật khẩu
                </Button>
              </div>
            </form>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            Huỷ
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
