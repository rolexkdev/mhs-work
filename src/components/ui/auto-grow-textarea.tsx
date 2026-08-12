"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea tự giãn chiều cao theo nội dung — không bao giờ phải cuộn bên trong ô.
 * Dùng cho các ô báo cáo/ghi chú mà người dùng hay gõ danh sách nhiều dòng
 * ("1. ...", "2. ..."), vốn bị ô cố định 2-3 dòng che mất phần cuối.
 *
 * `recalcKey` để tính lại chiều cao khi ô mới hiện ra (vd panel chi tiết vừa
 * mở): lúc bị ẩn `scrollHeight` bằng 0 nên phải đo lại sau khi hiện.
 */
export const AutoGrowTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { minRows?: number; recalcKey?: unknown }
>(({ className, minRows = 2, recalcKey, value, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLTextAreaElement>(null);
  React.useImperativeHandle(forwardedRef, () => innerRef.current!, []);

  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, recalcKey]);

  return (
    <textarea
      ref={innerRef}
      rows={minRows}
      value={value}
      className={cn("resize-none overflow-hidden", className)}
      {...props}
    />
  );
});
AutoGrowTextarea.displayName = "AutoGrowTextarea";
