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
    <div className="flex items-center gap-1.5">
      <Select
        value={value.mode}
        onValueChange={(m) => onChange({ ...value, mode: m as PeriodMode })}
      >
        <SelectTrigger className="h-8 w-[112px] text-xs">
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
          <div className="flex items-center rounded-md border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-7"
              onClick={() => onChange(shiftPeriod(value, -1))}
              title="Kỳ trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[128px] px-1 text-center text-xs font-medium">
              {periodLabel(value)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-7"
              onClick={() => onChange(shiftPeriod(value, 1))}
              title="Kỳ sau"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
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
