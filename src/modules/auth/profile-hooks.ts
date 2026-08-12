"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Đổi mật khẩu của chính người dùng.
 *
 * Supabase cho phép đổi mật khẩu chỉ bằng session đang có, nhưng ở đây bắt
 * nhập lại mật khẩu hiện tại rồi đăng nhập kiểm chứng trước — tránh việc ai đó
 * ngồi vào máy bỏ quên phiên đăng nhập là đổi được mật khẩu của người khác.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async ({ currentPassword, newPassword }: ChangePasswordInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Chưa đăng nhập");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) throw new Error("Mật khẩu hiện tại không đúng");

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        throw new Error(
          error.message.includes("should be different")
            ? "Mật khẩu mới phải khác mật khẩu hiện tại."
            : error.message,
        );
      }
    },
    onSuccess: () => toast.success("Đã đổi mật khẩu"),
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface UpdateProfileInput {
  fullName: string;
  avatarFile?: File | null;
}

/** Cập nhật hồ sơ của chính người dùng: tên hiển thị + ảnh đại diện. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fullName, avatarFile }: UpdateProfileInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");

      const patch: { full_name: string; avatar_url?: string } = {
        full_name: fullName.trim(),
      };

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop() ?? "png";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage
          .from("avatars")
          .getPublicUrl(path);
        patch.avatar_url = pub.publicUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles });
      toast.success("Đã cập nhật hồ sơ");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
