"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AssigneeOption = {
  value: string;
  label: string;
  avatarUrl: string | null;
};

export type Person = { id: string; name: string; avatarUrl: string | null };

/** Ghép danh sách id người phụ trách thành dữ liệu hiển thị. */
export function peopleOf(
  ids: string[],
  nameOf: (id: string | null) => string | null,
  avatarOf: (id: string | null) => string | null,
): Person[] {
  return ids.flatMap((id) => {
    const name = nameOf(id);
    return name ? [{ id, name, avatarUrl: avatarOf(id) }] : [];
  });
}

const MAX_AVATARS = 3;

/** Avatar xếp chồng kèm tên: "A", "A, B"... Danh sách đủ nằm ở title. */
export function AssigneeStack({
  people,
  avatarClassName = "h-5 w-5",
  fallbackClassName = "text-[10px]",
  className,
  empty,
}: {
  people: Person[];
  avatarClassName?: string;
  fallbackClassName?: string;
  className?: string;
  empty?: React.ReactNode;
}) {
  if (!people.length) return <>{empty ?? null}</>;
  const names = people.map((p) => p.name).join(", ");
  const extra = people.length - MAX_AVATARS;
  return (
    <span
      title={names}
      className={cn("flex min-w-0 items-center gap-1.5", className)}
    >
      <span className="flex shrink-0 -space-x-1.5">
        {people.slice(0, MAX_AVATARS).map((p) => (
          <Avatar key={p.id} className={cn(avatarClassName, "ring-1 ring-card")}>
            {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.name} />}
            <AvatarFallback className={fallbackClassName}>
              {initials(p.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {extra > 0 && (
          <span
            className={cn(
              "relative flex items-center justify-center rounded-full bg-muted font-medium ring-1 ring-card",
              avatarClassName,
              fallbackClassName,
            )}
          >
            +{extra}
          </span>
        )}
      </span>
      <span className="min-w-0 truncate">{names}</span>
    </span>
  );
}

/** Chọn nhiều người phụ trách; menu giữ mở để tích liên tiếp. */
export function AssigneePicker({
  value,
  options,
  onChange,
  children,
}: {
  value: string[];
  options: AssigneeOption[];
  onChange: (ids: string[]) => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuItem onClick={() => onChange([])}>
          <span className="text-xs text-muted-foreground">Chưa giao</span>
        </DropdownMenuItem>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={(e) => {
                e.preventDefault();
                onChange(
                  on
                    ? value.filter((id) => id !== o.value)
                    : [...value, o.value],
                );
              }}
            >
              <Avatar className="h-5 w-5">
                {o.avatarUrl && <AvatarImage src={o.avatarUrl} alt={o.label} />}
                <AvatarFallback className="text-[10px]">
                  {initials(o.label)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 text-sm">{o.label}</span>
              <Check
                className={cn("ml-3 h-4 w-4", on ? "opacity-100" : "opacity-0")}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
