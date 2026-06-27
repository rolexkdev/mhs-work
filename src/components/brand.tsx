"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Thương hiệu Minh Hưng Sikico.
 * Hiển thị logo từ /public/logo.jpg; nếu chưa có file thì tự fallback
 * sang ô chữ "MH" màu maroon để giao diện không bị vỡ.
 */
export function Brand({
  showText = true,
  size = 32,
  className,
}: {
  showText?: boolean;
  size?: number;
  className?: string;
}) {
  const [ok, setOk] = useState(true);
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logo.jpg"
          alt="Minh Hưng Sikico"
          width={size}
          height={size}
          className="shrink-0 object-contain"
          style={{ height: size, width: size }}
          onError={() => setOk(false)}
        />
      ) : (
        <div
          className="flex shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground"
          style={{ height: size, width: size, fontSize: size * 0.34 }}
        >
          MH
        </div>
      )}
      {showText && (
        <span className="text-sm font-semibold leading-tight tracking-tight">
          MINH HƯNG <span className="text-primary">SIKICO</span>
        </span>
      )}
    </div>
  );
}
