"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Period,
  type PeriodMode,
  periodLabel,
  shiftPeriod,
} from "@/lib/period";

/** Bộ chọn kỳ: theo tuần / tháng / tất cả, có nút lùi-tới và "Hiện tại". */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const isAll = value.mode === "all";
  return (
    // Mobile: chiếm trọn bề ngang, ô nhãn kỳ co giãn phần còn lại.
    <div className="flex w-full items-center gap-1.5 sm:w-auto">
      <Select
        value={value.mode}
        onValueChange={(m) => onChange({ ...value, mode: m as PeriodMode })}
      >
        <SelectTrigger className="h-9 w-[104px] shrink-0 text-xs sm:h-8 sm:w-[112px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="week">Theo tuần</SelectItem>
          <SelectItem value="month">Theo tháng</SelectItem>
          <SelectItem value="all">Tất cả</SelectItem>
        </SelectContent>
      </Select>

      {!isAll && (
        <>
          <div className="flex min-w-0 flex-1 items-center rounded-md border sm:flex-none">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 sm:h-8 sm:w-7"
              onClick={() => onChange(shiftPeriod(value, -1))}
              title="Kỳ trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-0 flex-1 truncate px-1 text-center text-xs font-medium sm:min-w-[128px] sm:flex-none">
              {periodLabel(value)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 sm:h-8 sm:w-7"
              onClick={() => onChange(shiftPeriod(value, 1))}
              title="Kỳ sau"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-2.5 sm:h-8 sm:px-3"
            onClick={() =>
              onChange({ ...value, anchor: new Date().toISOString() })
            }
            title="Về kỳ hiện tại"
          >
            Hiện tại
          </Button>
        </>
      )}
    </div>
  );
}
