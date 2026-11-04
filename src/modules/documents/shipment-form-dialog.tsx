"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import {
  DOCUMENT_STATUS_META,
  NON_SHIPPABLE_DOCUMENT_STATUSES,
  SHIPMENT_METHOD_META,
  SHIPMENT_METHOD_ORDER,
} from "@/modules/documents/constants";
import { useDocuments } from "@/modules/documents/hooks";
import {
  useMyHeldDocumentIds,
  useDocumentsWithPendingHandoffs,
} from "@/modules/documents/handoff-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import {
  useExternalUnits,
  useCreateExternalUnit,
} from "@/modules/documents/external-unit-hooks";
import { useCreateShipment } from "@/modules/documents/shipment-hooks";
import { uploadShipmentFile } from "@/modules/documents/attachment-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMe } from "@/modules/meetings/item-hooks";
import type {
  DocumentShipment,
  ExternalUnit,
  ShipmentMethod,
} from "@/types/database";

export function ShipmentFormDialog({
  open,
  onOpenChange,
  defaultDocumentIds = [],
  navigateOnCreate = false,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDocumentIds?: string[];
  navigateOnCreate?: boolean;
  onCreated?: (shipmentId: string) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();
  const { data: allDocuments = [] } = useDocuments();
  const { data: myHeldDocIds = [] } = useMyHeldDocumentIds();
  const { data: pendingHandoffDocIds = [] } =
    useDocumentsWithPendingHandoffs();
  const { data: externalUnits = [] } = useExternalUnits({
    includeInactive: false,
  });

  const createShipment = useCreateShipment();
  const createExternalUnit = useCreateExternalUnit();

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [fromOfficeId, setFromOfficeId] = useState<string>("");
  const [destinationType, setDestinationType] = useState<"office" | "external">(
    "office",
  );
  const [toOfficeId, setToOfficeId] = useState<string>("");
  const [toExternalUnitId, setToExternalUnitId] = useState<string>("");
  const [unitSearch, setUnitSearch] = useState("");

  // Quick-add external unit inline form state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitContact, setNewUnitContact] = useState("");
  const [newUnitPhone, setNewUnitPhone] = useState("");
  const [newUnitAddress, setNewUnitAddress] = useState("");
  const [newUnitNote, setNewUnitNote] = useState("");

  const [method, setMethod] = useState<ShipmentMethod>("courier");
  const [carrier, setCarrier] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [driverNote, setDriverNote] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const myProfile = useMemo(
    () => (me ? profiles.find((p) => p.id === me.id) : undefined),
    [me, profiles],
  );
  const isLeaderOrAdmin = me?.role === "admin" || me?.role === "leader";
  const heldSet = useMemo(() => new Set(myHeldDocIds), [myHeldDocIds]);
  const pendingHandoffSet = useMemo(
    () => new Set(pendingHandoffDocIds),
    [pendingHandoffDocIds],
  );

  const eligibleDocuments = useMemo(() => {
    if (!me) return [];
    return allDocuments.filter((doc) => {
      if (NON_SHIPPABLE_DOCUMENT_STATUSES.has(doc.status)) return false;
      if (pendingHandoffSet.has(doc.id)) return false;
      if (isLeaderOrAdmin) return true;
      return doc.current_holder_id === me.id || heldSet.has(doc.id);
    });
  }, [allDocuments, me, isLeaderOrAdmin, heldSet, pendingHandoffSet]);

  const filteredDocuments = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return eligibleDocuments;
    return eligibleDocuments.filter(
      (doc) =>
        doc.code.toLowerCase().includes(q) ||
        doc.title.toLowerCase().includes(q) ||
        (doc.category ?? "").toLowerCase().includes(q),
    );
  }, [eligibleDocuments, docSearch]);

  const destinationOffices = useMemo(
    () => offices.filter((o) => o.id !== fromOfficeId),
    [offices, fromOfficeId],
  );

  const filteredExternalUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    if (!q) return externalUnits;
    return externalUnits.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.contact_name ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q) ||
        (u.address ?? "").toLowerCase().includes(q),
    );
  }, [externalUnits, unitSearch]);

  // Reset form state and default-selected documents only when the dialog opens
  useEffect(() => {
    if (!open) return;
    const defaultOrigin =
      myProfile?.office_id ?? offices[0]?.id ?? "";
    setFromOfficeId(defaultOrigin);
    const otherOffice =
      offices.find((o) => o.id !== defaultOrigin)?.id ?? "";
    setToOfficeId(otherOffice);
    setDestinationType("office");
    setToExternalUnitId("");
    setUnitSearch("");
    setQuickAddOpen(false);
    setNewUnitName("");
    setNewUnitContact("");
    setNewUnitPhone("");
    setNewUnitAddress("");
    setNewUnitNote("");
    setMethod("courier");
    setCarrier("");
    setTrackingNo("");
    setDriverNote("");
    setNote("");
    setDocSearch("");
    setFiles([]);
    setSelectedDocIds(
      defaultDocumentIds.length > 0 ? [...defaultDocumentIds] : [],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Populate default offices if they finish loading after the dialog opened
  useEffect(() => {
    if (!open || fromOfficeId) return;
    const defaultOrigin = myProfile?.office_id ?? offices[0]?.id ?? "";
    if (!defaultOrigin) return;
    setFromOfficeId(defaultOrigin);
    if (!toOfficeId) {
      const otherOffice =
        offices.find((o) => o.id !== defaultOrigin)?.id ?? "";
      setToOfficeId(otherOffice);
    }
  }, [open, fromOfficeId, toOfficeId, myProfile?.office_id, offices]);

  // Keep toOfficeId distinct from fromOfficeId when fromOfficeId changes
  useEffect(() => {
    if (fromOfficeId && toOfficeId === fromOfficeId) {
      const next = offices.find((o) => o.id !== fromOfficeId)?.id ?? "";
      setToOfficeId(next);
    }
  }, [fromOfficeId, toOfficeId, offices]);

  function toggleDoc(docId: string) {
    setSelectedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId],
    );
  }

  function handleSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) {
      setFiles((prev) => [...prev, ...selected]);
    }
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleQuickAddUnit() {
    if (!newUnitName.trim()) return;
    let created: ExternalUnit;
    try {
      created = await createExternalUnit.mutateAsync({
        name: newUnitName.trim(),
        contact_name: newUnitContact.trim() || null,
        phone: newUnitPhone.trim() || null,
        address: newUnitAddress.trim() || null,
        note: newUnitNote.trim() || null,
      });
    } catch {
      return;
    }
    setToExternalUnitId(created.id);
    setQuickAddOpen(false);
    setNewUnitName("");
    setNewUnitContact("");
    setNewUnitPhone("");
    setNewUnitAddress("");
    setNewUnitNote("");
  }

  const pending = createShipment.isPending || uploadingFiles;

  const destinationValid =
    destinationType === "office"
      ? !!toOfficeId && toOfficeId !== fromOfficeId
      : !!toExternalUnitId;

  const canSubmit =
    !pending &&
    selectedDocIds.length > 0 &&
    !!fromOfficeId &&
    destinationValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const isCourierOrPost = method === "courier" || method === "post";

    let created: DocumentShipment;
    try {
      created = await createShipment.mutateAsync({
        documentIds: selectedDocIds,
        method,
        fromOfficeId,
        toOfficeId: destinationType === "office" ? toOfficeId : null,
        toExternalUnitId:
          destinationType === "external" ? toExternalUnitId : null,
        carrier: isCourierOrPost ? carrier.trim() || null : null,
        trackingNo: isCourierOrPost ? trackingNo.trim() || null : null,
        driverNote: !isCourierOrPost ? driverNote.trim() || null : null,
        note: note.trim() || null,
      });
    } catch {
      return;
    }

    if (files.length > 0) {
      setUploadingFiles(true);
      try {
        for (const file of files) {
          await uploadShipmentFile({
            shipmentId: created.id,
            file,
          });
        }
        qc.invalidateQueries({
          queryKey: queryKeys.shipmentAttachments(created.id),
        });
      } catch (err) {
        toast.error(friendlyError(err, "Tải ảnh biên nhận thất bại."));
      } finally {
        setUploadingFiles(false);
      }
    }

    onOpenChange(false);
    onCreated?.(created.id);
    if (navigateOnCreate) {
      router.push(`/documents/shipments/${created.id}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5 text-primary" />
            Tạo chuyến vận chuyển hồ sơ
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Gửi một hoặc nhiều hồ sơ giữa các văn phòng hoặc đến đơn vị nhận bên
            ngoài.
          </p>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* 1. Document multi-picker */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>
                  Hồ sơ gửi đi ({selectedDocIds.length} đã chọn) *
                </Label>
                <div className="flex items-center gap-3 text-xs">
                  {filteredDocuments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const ids = filteredDocuments.map((d) => d.id);
                        setSelectedDocIds((prev) =>
                          Array.from(new Set([...prev, ...ids])),
                        );
                      }}
                      className="text-primary hover:underline"
                    >
                      Chọn tất cả ({filteredDocuments.length})
                    </button>
                  )}
                  {selectedDocIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedDocIds([])}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Bỏ chọn hết
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                  placeholder="Tìm hồ sơ theo mã, tiêu đề..."
                  className="pl-9"
                />
              </div>

              <div className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-background">
                {filteredDocuments.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Không có hồ sơ nào đủ điều kiện gửi đi.
                  </p>
                ) : (
                  filteredDocuments.map((doc) => {
                    const selected = selectedDocIds.includes(doc.id);
                    const statusMeta = DOCUMENT_STATUS_META[doc.status];
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => toggleDoc(doc.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50",
                          selected && "bg-primary/5",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                        <span className="shrink-0 font-mono text-xs font-semibold text-primary">
                          {doc.code}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {doc.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                            statusMeta.badge,
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* 2. Origin & Destination */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Văn phòng gửi đi *</Label>
                <Select value={fromOfficeId} onValueChange={setFromOfficeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn văn phòng gửi" />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.code} — {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Loại nơi nhận *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={
                      destinationType === "office" ? "default" : "outline"
                    }
                    className="w-full"
                    onClick={() => setDestinationType("office")}
                  >
                    <Building2 className="h-4 w-4" /> Văn phòng
                  </Button>
                  <Button
                    type="button"
                    variant={
                      destinationType === "external" ? "default" : "outline"
                    }
                    className="w-full"
                    onClick={() => setDestinationType("external")}
                  >
                    <Truck className="h-4 w-4" /> Đơn vị bên ngoài
                  </Button>
                </div>
              </div>
            </div>

            {destinationType === "office" ? (
              <div className="space-y-1.5">
                <Label>Văn phòng nhận *</Label>
                <Select value={toOfficeId} onValueChange={setToOfficeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn văn phòng nhận" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationOffices.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.code} — {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Đơn vị nhận bên ngoài *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickAddOpen((v) => !v)}
                  >
                    <Plus className="h-3.5 w-3.5" /> Thêm đơn vị mới
                  </Button>
                </div>

                {quickAddOpen && (
                  <div className="space-y-3 rounded-md border bg-background p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Thêm nhanh đơn vị nhận mới
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuickAddOpen(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Đóng
                      </button>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="quick-unit-name" className="text-xs">
                          Tên đơn vị *
                        </Label>
                        <Input
                          id="quick-unit-name"
                          value={newUnitName}
                          onChange={(e) => setNewUnitName(e.target.value)}
                          placeholder="VD: Sở Tài nguyên và Môi trường..."
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="quick-unit-contact" className="text-xs">
                          Người liên hệ
                        </Label>
                        <Input
                          id="quick-unit-contact"
                          value={newUnitContact}
                          onChange={(e) => setNewUnitContact(e.target.value)}
                          placeholder="Tên người nhận / đầu mối..."
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="quick-unit-phone" className="text-xs">
                          Số điện thoại
                        </Label>
                        <Input
                          id="quick-unit-phone"
                          value={newUnitPhone}
                          onChange={(e) => setNewUnitPhone(e.target.value)}
                          placeholder="SĐT liên hệ..."
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="quick-unit-address" className="text-xs">
                          Địa chỉ
                        </Label>
                        <Input
                          id="quick-unit-address"
                          value={newUnitAddress}
                          onChange={(e) => setNewUnitAddress(e.target.value)}
                          placeholder="Địa chỉ nhận hồ sơ..."
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="quick-unit-note" className="text-xs">
                          Ghi chú
                        </Label>
                        <Input
                          id="quick-unit-note"
                          value={newUnitNote}
                          onChange={(e) => setNewUnitNote(e.target.value)}
                          placeholder="Ghi chú thêm (nếu có)..."
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setQuickAddOpen(false)}
                      >
                        Huỷ
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          createExternalUnit.isPending || !newUnitName.trim()
                        }
                        onClick={handleQuickAddUnit}
                      >
                        {createExternalUnit.isPending && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        Lưu &amp; chọn
                      </Button>
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={unitSearch}
                    onChange={(e) => setUnitSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                    placeholder="Tìm đơn vị nhận theo tên, người liên hệ, SĐT..."
                    className="bg-background pl-9"
                  />
                </div>

                <div className="max-h-40 divide-y overflow-y-auto rounded-md border bg-background">
                  {filteredExternalUnits.length === 0 ? (
                    <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                      Chưa có đơn vị phù hợp. Bấm &ldquo;+ Thêm đơn vị mới&rdquo;
                      ở trên để tạo nhanh.
                    </p>
                  ) : (
                    filteredExternalUnits.map((unit) => {
                      const selected = toExternalUnitId === unit.id;
                      return (
                        <button
                          key={unit.id}
                          type="button"
                          onClick={() => setToExternalUnitId(unit.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50",
                            selected && "bg-primary/5",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{unit.name}</p>
                            {(unit.contact_name ||
                              unit.phone ||
                              unit.address) && (
                              <p className="truncate text-xs text-muted-foreground">
                                {[unit.contact_name, unit.phone, unit.address]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input",
                            )}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 3. Method & conditional fields */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Phương thức vận chuyển *</Label>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as ShipmentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPMENT_METHOD_ORDER.map((m) => (
                      <SelectItem key={m} value={m}>
                        {SHIPMENT_METHOD_META[m].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(method === "courier" || method === "post") && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ship-carrier">Đơn vị vận chuyển</Label>
                    <Input
                      id="ship-carrier"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="VD: Viettel Post, Giao Hàng Nhanh, VNPost..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ship-tracking">Mã vận đơn</Label>
                    <Input
                      id="ship-tracking"
                      value={trackingNo}
                      onChange={(e) => setTrackingNo(e.target.value)}
                      placeholder="Nhập mã vận đơn để tra cứu..."
                    />
                  </div>
                </div>
              )}

              {method === "company_car" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ship-driver">Tài xế / biển số xe</Label>
                  <Input
                    id="ship-driver"
                    value={driverNote}
                    onChange={(e) => setDriverNote(e.target.value)}
                    placeholder="VD: Anh Tuấn — 61A-123.45..."
                  />
                </div>
              )}

              {method === "hand" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ship-hand">Người mang</Label>
                  <Input
                    id="ship-hand"
                    value={driverNote}
                    onChange={(e) => setDriverNote(e.target.value)}
                    placeholder="Nhập tên người trực tiếp mang hồ sơ..."
                  />
                </div>
              )}
            </div>

            {/* 4. Note & receipt photos */}
            <div className="space-y-1.5">
              <Label htmlFor="ship-note">Ghi chú chuyến gửi</Label>
              <Textarea
                id="ship-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú số lượng túi/bìa, lưu ý khi giao nhận..."
                className="min-h-[72px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ảnh biên nhận / phiếu gửi (tuỳ chọn)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" /> Chọn ảnh / tệp
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  onChange={handleSelectFiles}
                />
              </div>

              {files.length > 0 ? (
                <ul className="space-y-1 rounded-md border bg-muted/20 p-2">
                  {files.map((f, idx) => (
                    <li
                      key={`${f.name}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs"
                    >
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Đính kèm ảnh chụp phiếu gửi chuyển phát hoặc biên bản giao
                  nhận.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
              {pending
                ? "Đang tạo chuyến..."
                : `Tạo chuyến (${selectedDocIds.length})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
