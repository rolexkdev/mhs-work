"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

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
