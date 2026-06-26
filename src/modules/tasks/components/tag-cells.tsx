"use client";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CellOption = { value: string; label: string; className: string };

export function Pill({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Ô select inline kiểu Notion: hiện pill, bấm để đổi giá trị ngay. */
export function InlineSelectCell({
  value,
  options,
  onChange,
  allowEmpty = true,
  emptyLabel = "Trống",
  align = "start",
}: {
  value: string | null;
  options: CellOption[];
  onChange: (value: string | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  align?: "start" | "end";
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex min-w-0 max-w-full items-center rounded px-1 py-0.5 text-left hover:bg-muted/60">
          {current ? (
            <Pill label={current.label} className={current.className} />
          ) : (
            <span className="text-xs text-muted-foreground/60">+ Trống</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-72 overflow-y-auto">
        {allowEmpty && (
          <DropdownMenuItem onClick={() => onChange(null)}>
            <span className="text-xs text-muted-foreground">{emptyLabel}</span>
          </DropdownMenuItem>
        )}
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
            <Pill label={o.label} className={o.className} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
