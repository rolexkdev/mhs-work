"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { signIn } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/brand";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Đang đăng nhập..." : "Đăng nhập"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(signIn, null);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-muted/40 p-4">
      {/* Mảng màu thương hiệu phía sau, để trang không còn là một tờ giấy trắng */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-br from-primary to-primary/75"
      />

      <div className="relative w-full max-w-sm">
        <div className="rounded-xl border bg-card p-7 shadow-xl">
          <Brand size={42} />

          <div className="mt-5 space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Quản lý công việc nội bộ
            </h1>
            <p className="text-sm text-muted-foreground">
              Đăng nhập bằng email công ty để xem và cập nhật công việc.
            </p>
          </div>

          <form action={formAction} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="ten@sikico.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>

            {state?.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}

            <SubmitButton />
          </form>

          {/* Chưa có tính năng tự lấy lại mật khẩu → chỉ rõ phải hỏi ai */}
          <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            Tài khoản do quản trị viên cấp. Quên mật khẩu, vui lòng liên hệ quản
            trị viên để được đặt lại.
          </p>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Minh Hưng Sikico
        </p>
      </div>
    </div>
  );
}
