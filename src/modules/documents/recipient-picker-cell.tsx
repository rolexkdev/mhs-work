"use client";

import { useMemo, useState } from "react";
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
import type { Office, Profile } from "@/types/database";

function PersonLabel({
  profile,
  className,
}: {
  profile: Profile;
  className?: string;
}) {
  const name = profile.full_name ?? profile.email;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Avatar className="h-5 w-5 shrink-0">
        {profile.avatar_url && (
          <AvatarImage src={profile.avatar_url} alt={name} />
        )}
        <AvatarFallback className="text-[9px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Single-person picker for the intended recipient of a document. Selecting a
 * person only stores information — it never creates a handoff.
 */
export function RecipientPickerCell({
  value,
  profiles,
  offices,
  onChange,
  disabled = false,
  triggerClassName,
}: {
  value: string | null;
  profiles: Profile[];
  offices: Office[];
  onChange: (userId: string | null) => void;
  disabled?: boolean;
  triggerClassName?: string;
}) {
  const [search, setSearch] = useState("");
  const selected = value ? profiles.find((p) => p.id === value) : undefined;

  const officeCodeById = useMemo(
    () => new Map(offices.map((o) => [o.id, o.code])),
    [offices],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const officeCode = p.office_id ? officeCodeById.get(p.office_id) : "";
      return (
        (p.full_name ?? "").toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (officeCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [profiles, search, officeCodeById]);

  if (disabled) {
    return selected ? (
      <PersonLabel profile={selected} className="px-1 py-0.5 text-xs" />
    ) : (
      <span className="px-1 py-0.5 text-xs text-muted-foreground">—</span>
    );
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && setSearch("")}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex min-w-0 max-w-full items-center rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60",
            triggerClassName,
          )}
        >
          {selected ? (
            <PersonLabel profile={selected} />
          ) : (
            <span className="text-muted-foreground/60">+ Trống</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-0">
        <div className="border-b p-1.5">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // Keep typing inside the input instead of triggering menu typeahead.
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Tìm người nhận..."
            className="h-8 w-full rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          <DropdownMenuItem onClick={() => onChange(null)}>
            <span className="text-xs text-muted-foreground">Bỏ chọn</span>
          </DropdownMenuItem>
          {filtered.map((p) => {
            const on = p.id === value;
            const officeCode = p.office_id
              ? officeCodeById.get(p.office_id)
              : null;
            return (
              <DropdownMenuItem key={p.id} onClick={() => onChange(p.id)}>
                <PersonLabel profile={p} className="flex-1 text-sm" />
                {officeCode && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {officeCode}
                  </span>
                )}
                <Check
                  className={cn(
                    "ml-1 h-4 w-4 shrink-0",
                    on ? "opacity-100" : "opacity-0",
                  )}
                />
              </DropdownMenuItem>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Không tìm thấy người phù hợp
            </p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
