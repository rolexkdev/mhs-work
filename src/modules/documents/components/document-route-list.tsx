"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEPARTMENTS,
  TAG_COLOR_CLASS,
  colorOf,
} from "@/modules/tasks/constants";

export interface RouteRow {
  /** Unique key: the step id for existing steps, a local key for new ones. */
  key: string;
  department: string;
  /** Step already reached: shown first, read-only, cannot move or remove. */
  locked?: boolean;
}

/**
 * Danh sách lộ trình dùng chung cho hộp thoại thêm hồ sơ và hộp thoại sửa
 * lộ trình. Bước đã tới (locked) luôn đứng đầu và không sửa được; chỉ các
 * bước chưa tới mới thêm, đổi thứ tự hoặc xoá được.
 */
export function DocumentRouteList({
  rows,
  onAdd,
  onMove,
  onRemove,
  emptyText,
}: {
  rows: RouteRow[];
  /** Bỏ trống để ẩn ô chọn phòng ban (danh sách chỉ đọc). */
  onAdd?: (department: string) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  onRemove?: (index: number) => void;
  emptyText: string;
}) {
  const [departmentToAdd, setDepartmentToAdd] = useState("");
  const lockedCount = rows.filter((row) => row.locked).length;
  const editable = !!(onMove && onRemove);

  function handleAdd(value: string) {
    onAdd?.(value);
    setDepartmentToAdd("");
  }

  return (
    <div className="space-y-3">
      {onAdd && (
        <Select value={departmentToAdd} onValueChange={handleAdd}>
          <SelectTrigger>
            <SelectValue placeholder="Thêm phòng ban vào lộ trình" />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, index) => {
            const locked = !!row.locked;
            // Bước chưa tới đầu tiên không được vượt lên trên bước đã tới.
            const cannotMoveUp = index === 0 || index === lockedCount;

            return (
              <li
                key={row.key}
                className={cn(
                  "flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5",
                  locked && "bg-muted/40",
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-full border px-2 py-0.5 text-xs font-medium",
                    TAG_COLOR_CLASS[colorOf(DEPARTMENTS, row.department)],
                  )}
                >
                  {row.department}
                </span>

                {locked ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> Đã tới
                  </span>
                ) : (
                  editable && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Chuyển lên"
                        disabled={cannotMoveUp}
                        onClick={() => onMove?.(index, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Chuyển xuống"
                        disabled={index === rows.length - 1}
                        onClick={() => onMove?.(index, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        aria-label="Xoá bước"
                        onClick={() => onRemove?.(index)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
