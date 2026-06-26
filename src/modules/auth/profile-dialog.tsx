"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
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
import { useUpdateProfile } from "@/modules/auth/profile-hooks";

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
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(fullName ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);

  // Đồng bộ lại khi mở dialog với dữ liệu mới nhất.
  useEffect(() => {
    if (open) {
      setName(fullName ?? "");
      setFile(null);
      setPreview(avatarUrl);
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
