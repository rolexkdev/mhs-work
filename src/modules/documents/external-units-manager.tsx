"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Check,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useExternalUnits,
  useCreateExternalUnit,
  useUpdateExternalUnit,
  useSetExternalUnitActive,
  useDeleteExternalUnit,
} from "@/modules/documents/external-unit-hooks";
import { useMe } from "@/modules/meetings/item-hooks";
import type { ExternalUnit } from "@/types/database";

export function ExternalUnitsManager() {
  const { data: me } = useMe();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogUnit, setDialogUnit] = useState<ExternalUnit | "new" | null>(
    null,
  );
  const [deletingUnit, setDeletingUnit] = useState<ExternalUnit | null>(null);

  const { data: units = [], isLoading } = useExternalUnits({
    includeInactive: showInactive,
  });
  const setActive = useSetExternalUnitActive();
  const deleteUnit = useDeleteExternalUnit();

  const isLeaderOrAdmin = me?.role === "admin" || me?.role === "leader";

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.contact_name ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q) ||
        (u.address ?? "").toLowerCase().includes(q) ||
        (u.note ?? "").toLowerCase().includes(q),
    );
  }, [units, search]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 basis-full sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên đơn vị, người liên hệ, số điện thoại, địa chỉ..."
            className="pl-9"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowInactive((v) => !v)}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors",
            showInactive
              ? "border-primary bg-primary/5 text-primary"
              : "bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded border",
              showInactive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input",
            )}
          >
            {showInactive && <Check className="h-3 w-3" />}
          </span>
          Hiện đơn vị ngừng sử dụng
        </button>

        <Button
          onClick={() => setDialogUnit("new")}
          className="ml-auto w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Thêm đơn vị nhận
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {search.trim()
              ? "Không tìm thấy đơn vị nhận nào khớp từ khoá."
              : "Chưa có đơn vị nhận nào trong danh bạ."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="divide-y rounded-lg border bg-background md:hidden">
            {filteredUnits.map((unit) => {
              const canDelete =
                (!!me && unit.created_by === me.id) || isLeaderOrAdmin;
              return (
                <div
                  key={unit.id}
                  className={cn(
                    "space-y-2 p-3",
                    !unit.is_active && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium leading-snug">
                          {unit.name}
                        </span>
                        {!unit.is_active && (
                          <Badge variant="secondary" className="text-[11px]">
                            Ngừng sử dụng
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    {unit.contact_name && (
                      <p className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span>{unit.contact_name}</span>
                      </p>
                    )}
                    {unit.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{unit.phone}</span>
                      </p>
                    )}
                    {unit.address && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{unit.address}</span>
                      </p>
                    )}
                    {unit.note && (
                      <p className="rounded bg-muted/40 px-2 py-1 text-xs">
                        Ghi chú: {unit.note}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialogUnit(unit)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Sửa
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setActive.isPending}
                      onClick={() =>
                        setActive.mutate({
                          id: unit.id,
                          isActive: !unit.is_active,
                        })
                      }
                    >
                      {unit.is_active ? (
                        <>
                          <Archive className="h-3.5 w-3.5" /> Ngừng dùng
                        </>
                      ) : (
                        <>
                          <ArchiveRestore className="h-3.5 w-3.5" /> Kích hoạt
                        </>
                      )}
                    </Button>
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingUnit(unit)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xoá
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">
                    Tên đơn vị nhận
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    Người liên hệ
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    Điện thoại
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    Địa chỉ &amp; Ghi chú
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    Trạng thái
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUnits.map((unit) => {
                  const canDelete =
                    (!!me && unit.created_by === me.id) || isLeaderOrAdmin;
                  return (
                    <tr
                      key={unit.id}
                      className={cn(
                        "border-b last:border-0 hover:bg-muted/30",
                        !unit.is_active && "opacity-60",
                      )}
                    >
                      <td className="px-4 py-3 font-medium">{unit.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {unit.contact_name || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                        {unit.phone || "—"}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                        {unit.address && <p>{unit.address}</p>}
                        {unit.note && (
                          <p className="mt-0.5 italic">Ghi chú: {unit.note}</p>
                        )}
                        {!unit.address && !unit.note && "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {unit.is_active ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Đang dùng
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Ngừng dùng
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDialogUnit(unit)}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Sửa
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={setActive.isPending}
                            onClick={() =>
                              setActive.mutate({
                                id: unit.id,
                                isActive: !unit.is_active,
                              })
                            }
                            title={
                              unit.is_active
                                ? "Ngừng sử dụng"
                                : "Kích hoạt lại"
                            }
                          >
                            {unit.is_active ? (
                              <>
                                <Archive className="h-3.5 w-3.5" /> Ngừng dùng
                              </>
                            ) : (
                              <>
                                <ArchiveRestore className="h-3.5 w-3.5" /> Kích
                                hoạt
                              </>
                            )}
                          </Button>
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletingUnit(unit)}
                              title="Xoá đơn vị nhận"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ExternalUnitFormDialog
        open={!!dialogUnit}
        onOpenChange={(v) => !v && setDialogUnit(null)}
        unit={dialogUnit === "new" ? null : dialogUnit}
      />

      <ConfirmDialog
        open={!!deletingUnit}
        onOpenChange={(v) => !v && setDeletingUnit(null)}
        title="Xoá đơn vị nhận?"
        description={
          deletingUnit
            ? `Đơn vị "${deletingUnit.name}" sẽ bị xoá. Nếu đơn vị đã có chuyến gửi liên quan, hãy dùng nút "Ngừng dùng" thay vì xoá.`
            : undefined
        }
        confirmLabel="Xoá"
        destructive
        onConfirm={() => {
          if (deletingUnit) {
            deleteUnit.mutate(deletingUnit.id);
          }
        }}
      />
    </div>
  );
}

function ExternalUnitFormDialog({
  open,
  onOpenChange,
  unit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unit: ExternalUnit | null;
}) {
  const isEdit = !!unit;
  const createUnit = useCreateExternalUnit();
  const updateUnit = useUpdateExternalUnit();

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(unit?.name ?? "");
    setContactName(unit?.contact_name ?? "");
    setPhone(unit?.phone ?? "");
    setAddress(unit?.address ?? "");
    setNote(unit?.note ?? "");
  }, [open, unit]);

  const pending = createUnit.isPending || updateUnit.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (isEdit && unit) {
        await updateUnit.mutateAsync({
          id: unit.id,
          name: name.trim(),
          contact_name: contactName.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          note: note.trim() || null,
        });
      } else {
        await createUnit.mutateAsync({
          name: name.trim(),
          contact_name: contactName.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          note: note.trim() || null,
        });
      }
    } catch {
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa đơn vị nhận" : "Thêm đơn vị nhận mới"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ext-unit-name">Tên đơn vị nhận *</Label>
            <Input
              id="ext-unit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Ban Quản lý các KCN tỉnh Bình Phước..."
              autoFocus
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ext-unit-contact">Người liên hệ</Label>
              <Input
                id="ext-unit-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Tên người nhận / văn thư..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ext-unit-phone">Số điện thoại</Label>
              <Input
                id="ext-unit-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Số điện thoại liên hệ..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ext-unit-address">Địa chỉ</Label>
            <Input
              id="ext-unit-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Địa chỉ gửi nhận hồ sơ..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ext-unit-note">Ghi chú</Label>
            <Textarea
              id="ext-unit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Giờ làm việc, lưu ý khi gửi chuyển phát..."
              className="min-h-[72px] resize-none"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending
                ? "Đang lưu..."
                : isEdit
                  ? "Lưu thay đổi"
                  : "Thêm đơn vị"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
