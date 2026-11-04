"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HANDOFF_KIND_META,
  HANDOFF_KIND_ORDER,
} from "@/modules/documents/constants";
import { useCreateHandoff } from "@/modules/documents/handoff-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import type { HandoffKind, Profile } from "@/types/database";

export function HandoffDialog({
  open,
  onOpenChange,
  documentId,
  currentUserId,
  pendingRecipientIds = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  currentUserId: string | null;
  pendingRecipientIds?: string[];
}) {
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();
  const createHandoff = useCreateHandoff();

  const [kind, setKind] = useState<HandoffKind>("assign");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind("assign");
    setSelectedIds([]);
    setSearch("");
    setNote("");
  }, [open]);

  const officeById = useMemo(
    () => new Map(offices.map((o) => [o.id, o])),
    [offices],
  );

  const pendingSet = useMemo(
    () => new Set(pendingRecipientIds),
    [pendingRecipientIds],
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles
      .filter((p) => p.id !== currentUserId)
      .filter((p) => {
        if (!q) return true;
        const office = p.office_id ? officeById.get(p.office_id) : null;
        return (
          (p.full_name ?? "").toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          (p.department ?? "").toLowerCase().includes(q) ||
          (office?.code ?? "").toLowerCase().includes(q) ||
          (office?.name ?? "").toLowerCase().includes(q)
        );
      });
  }, [profiles, currentUserId, search, officeById]);

  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, { label: string; items: Profile[] }>();
    for (const p of candidates) {
      const office = p.office_id ? officeById.get(p.office_id) : null;
      const officeLabel = office ? office.code : "Chưa gán văn phòng";
      const deptLabel = p.department?.trim() || "Chưa phân phòng";
      const key = `${officeLabel} · ${deptLabel}`;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(p);
      } else {
        groups.set(key, { label: key, items: [p] });
      }
    }
    return Array.from(groups.values());
  }, [candidates, officeById]);

  function toggleRecipient(userId: string) {
    if (pendingSet.has(userId)) return;
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) return;

    await createHandoff.mutateAsync({
      documentId,
      toUsers: selectedIds,
      kind,
      note: note.trim() || null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">Bàn giao hồ sơ</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Chọn hình thức bàn giao và một hoặc nhiều người nhận. Nếu chọn nhiều
            người, hồ sơ sẽ chuyển sang trạng thái Đang phân phối.
          </p>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label>Hình thức bàn giao</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {HANDOFF_KIND_ORDER.map((k) => {
                  const meta = HANDOFF_KIND_META[k];
                  const active = kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                          meta.badge,
                        )}
                      >
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", meta.dot)}
                        />
                        {meta.label}
                      </span>
                      <span className="mt-1.5 text-xs text-muted-foreground">
                        {meta.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Người nhận ({selectedIds.length} đã chọn) *
                </Label>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Bỏ chọn tất cả
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, email, văn phòng, phòng ban..."
                  className="pl-9"
                />
              </div>

              <div className="max-h-60 overflow-y-auto rounded-lg border bg-background">
                {groupedCandidates.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Không tìm thấy thành viên phù hợp.
                  </p>
                ) : (
                  groupedCandidates.map((group) => (
                    <div key={group.label} className="border-b last:border-0">
                      <div className="bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </div>
                      <div className="divide-y">
                        {group.items.map((p) => {
                          const displayName = p.full_name ?? p.email;
                          const selected = selectedIds.includes(p.id);
                          const alreadyPending = pendingSet.has(p.id);
                          const office = p.office_id
                            ? officeById.get(p.office_id)
                            : null;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={alreadyPending}
                              onClick={() => toggleRecipient(p.id)}
                              className={cn(
                                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                                alreadyPending
                                  ? "cursor-not-allowed opacity-50"
                                  : "hover:bg-accent/50",
                                selected && "bg-primary/5",
                              )}
                            >
                              <Avatar className="h-7 w-7 shrink-0">
                                {p.avatar_url && (
                                  <AvatarImage
                                    src={p.avatar_url}
                                    alt={displayName}
                                  />
                                )}
                                <AvatarFallback className="text-[10px]">
                                  {initials(displayName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium leading-tight">
                                  {displayName}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {office ? `${office.code}` : ""}
                                  {office && p.department ? " · " : ""}
                                  {p.department ?? p.email}
                                </p>
                              </div>
                              {alreadyPending ? (
                                <Badge
                                  variant="secondary"
                                  className="shrink-0 text-[11px]"
                                >
                                  Đang chờ xác nhận
                                </Badge>
                              ) : (
                                <span
                                  className={cn(
                                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                                    selected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-input",
                                  )}
                                >
                                  {selected && <Check className="h-3.5 w-3.5" />}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="handoff-note">Ghi chú bàn giao</Label>
              <Textarea
                id="handoff-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nội dung chỉ đạo, lưu ý khi xử lý hoặc số bản giao..."
                className="min-h-[72px] resize-none"
              />
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createHandoff.isPending}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={createHandoff.isPending || selectedIds.length === 0}
            >
              {createHandoff.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {createHandoff.isPending
                ? "Đang gửi..."
                : `Bàn giao (${selectedIds.length})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
