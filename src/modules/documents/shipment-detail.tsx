"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { differenceInDays } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Phone,
  Plus,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatDateTime, initials } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DOCUMENT_STATUS_META,
  SHIPMENT_ITEM_STATUS_META,
  SHIPMENT_METHOD_META,
  shipmentStatusMeta,
} from "@/modules/documents/constants";
import {
  useShipment,
  useShipmentItems,
  useConfirmShipmentItems,
  useCancelShipment,
  type ShipmentItemWithDocument,
} from "@/modules/documents/shipment-hooks";
import {
  useShipmentAttachments,
  useUploadShipmentAttachment,
  useDeleteShipmentAttachment,
  uploadShipmentFile,
  getDocumentAttachmentUrl,
} from "@/modules/documents/attachment-hooks";
import { useMyHeldDocumentIds } from "@/modules/documents/handoff-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useExternalUnits } from "@/modules/documents/external-unit-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMe } from "@/modules/meetings/item-hooks";
import { MarkLostDialog } from "@/modules/documents/mark-lost-dialog";
import type { DocumentAttachment } from "@/types/database";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const isImageFile = (name: string) => IMAGE_RE.test(name);

function daysInTransitLabel(sentAt: string): string {
  const days = Math.max(0, differenceInDays(new Date(), new Date(sentAt)));
  return `đã đi ${days} ngày`;
}

export function ShipmentDetail({ id }: { id: string }) {
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();
  const { data: externalUnits = [] } = useExternalUnits({
    includeInactive: true,
  });
  const { data: myHeldDocIds = [] } = useMyHeldDocumentIds();

  const { data: shipment, isLoading } = useShipment(id);
  const { data: items = [], isLoading: itemsLoading } = useShipmentItems(id);
  const { data: attachments = [] } = useShipmentAttachments(id);

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [lostTarget, setLostTarget] = useState<{
    documentId: string;
    code: string | null;
    title: string | null;
  } | null>(null);

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const officeById = useMemo(
    () => new Map(offices.map((o) => [o.id, o])),
    [offices],
  );
  const externalUnitById = useMemo(
    () => new Map(externalUnits.map((u) => [u.id, u])),
    [externalUnits],
  );
  const heldSet = useMemo(() => new Set(myHeldDocIds), [myHeldDocIds]);

  const myProfile = me ? profileById.get(me.id) : undefined;
  const isLeaderOrAdmin = me?.role === "admin" || me?.role === "leader";

  const openItems = useMemo(
    () => items.filter((i) => i.status === "in_transit"),
    [items],
  );

  const initializedShipmentIdRef = useRef<string | null>(null);

  // Initialise selection to all open items once when items first load for this
  // shipment id; on subsequent changes only intersect (remove ids no longer open).
  useEffect(() => {
    if (itemsLoading) {
      // Return the same array when already empty: `items` defaults to a new []
      // on every render while loading, so a fresh [] here would loop forever.
      if (initializedShipmentIdRef.current !== id) {
        setSelectedDocIds((prev) => (prev.length === 0 ? prev : []));
      }
      return;
    }
    const openIds = openItems.map((i) => i.document_id);
    if (initializedShipmentIdRef.current !== id) {
      initializedShipmentIdRef.current = id;
      setSelectedDocIds(openIds);
      return;
    }
    const openSet = new Set(openIds);
    setSelectedDocIds((prev) => {
      const next = prev.filter((docId) => openSet.has(docId));
      return next.length === prev.length ? prev : next;
    });
  }, [id, itemsLoading, openItems]);

  const nameOf = (userId: string | null | undefined) => {
    if (!userId) return null;
    const p = profileById.get(userId);
    return p ? (p.full_name ?? p.email) : null;
  };
  const avatarOf = (userId: string | null | undefined) =>
    userId ? (profileById.get(userId)?.avatar_url ?? null) : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Không tìm thấy chuyến vận chuyển.
        </p>
        <Link
          href="/documents/shipments"
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          ← Quay lại danh sách vận chuyển
        </Link>
      </div>
    );
  }

  const isOfficeDestination = shipment.to_office_id !== null;
  const isExternalDestination = shipment.to_external_unit_id !== null;
  const isSender = !!me && shipment.sent_by === me.id;
  const isDestinationOfficeStaff =
    isOfficeDestination &&
    !!myProfile?.office_id &&
    myProfile.office_id === shipment.to_office_id;

  const canConfirmItems =
    shipment.status === "in_transit" &&
    openItems.length > 0 &&
    (isOfficeDestination
      ? isDestinationOfficeStaff || isLeaderOrAdmin
      : isSender || isLeaderOrAdmin);

  const hasAnyResolvedItem = items.some(
    (i) => i.status === "received" || i.status === "lost",
  );
  const canCancelShipment =
    shipment.status === "in_transit" &&
    !hasAnyResolvedItem &&
    (isSender || isLeaderOrAdmin);

  const canMarkItemLost = (item: ShipmentItemWithDocument) => {
    if (item.status !== "in_transit") return false;
    if (item.document?.status === "lost") return false;
    if (isLeaderOrAdmin || isSender || isDestinationOfficeStaff) return true;
    if (!!me && item.document?.current_holder_id === me.id) return true;
    if (heldSet.has(item.document_id)) return true;
    return false;
  };

  const statusMeta = shipmentStatusMeta(shipment);
  const methodMeta = SHIPMENT_METHOD_META[shipment.method];
  const fromOffice = officeById.get(shipment.from_office_id);
  const toOffice = shipment.to_office_id
    ? officeById.get(shipment.to_office_id)
    : undefined;
  const toExternal = shipment.to_external_unit_id
    ? externalUnitById.get(shipment.to_external_unit_id)
    : undefined;
  const senderName = nameOf(shipment.sent_by) ?? "—";
  const senderAvatar = avatarOf(shipment.sent_by);

  function toggleSelectDoc(docId: string) {
    setSelectedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((x) => x !== docId)
        : [...prev, docId],
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/documents/shipments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Danh sách chuyến vận chuyển
      </Link>

      {/* Header card */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-primary/10 px-2.5 py-0.5 font-mono text-sm font-semibold text-primary">
                  {shipment.code}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                    statusMeta.badge,
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      statusMeta.dot,
                    )}
                  />
                  {statusMeta.label}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                    methodMeta.badge,
                  )}
                >
                  {methodMeta.label}
                </span>
                {shipment.status === "in_transit" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    <Clock className="h-3.5 w-3.5" />
                    {daysInTransitLabel(shipment.sent_at)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-base font-semibold sm:text-lg">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {fromOffice
                    ? `${fromOffice.code} — ${fromOffice.name}`
                    : "—"}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                {toOffice ? (
                  <span className="inline-flex items-center gap-1.5 text-primary">
                    <Building2 className="h-4 w-4" />
                    {toOffice.code} — {toOffice.name}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-primary">
                    <Truck className="h-4 w-4" />
                    {toExternal?.name ?? "Đơn vị bên ngoài"}
                  </span>
                )}
              </div>

              {toExternal &&
                (toExternal.contact_name ||
                  toExternal.phone ||
                  toExternal.address) && (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {toExternal.contact_name && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> Liên hệ:{" "}
                        {toExternal.contact_name}
                      </span>
                    )}
                    {toExternal.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {toExternal.phone}
                      </span>
                    )}
                    {toExternal.address && <span>· {toExternal.address}</span>}
                  </p>
                )}

              {shipment.note && (
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Ghi chú: {shipment.note}
                </p>
              )}
            </div>

            {canCancelShipment && (
              <div className="shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  <X className="h-4 w-4" /> Huỷ chuyến
                </Button>
              </div>
            )}
          </div>

          {/* Metadata grid */}
          <div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Người gửi</p>
              <div className="flex items-center gap-2 font-medium">
                <Avatar className="h-6 w-6">
                  {senderAvatar && (
                    <AvatarImage src={senderAvatar} alt={senderName} />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {initials(senderName)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{senderName}</span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Thời gian gửi</p>
              <p className="font-medium">{formatDateTime(shipment.sent_at)}</p>
              {shipment.completed_at && (
                <p className="text-xs text-muted-foreground">
                  Hoàn tất: {formatDateTime(shipment.completed_at)}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Thông tin vận chuyển
              </p>
              {shipment.carrier ||
              shipment.tracking_no ||
              shipment.driver_note ? (
                <div className="space-y-0.5 text-sm">
                  {shipment.carrier && (
                    <p className="font-medium">{shipment.carrier}</p>
                  )}
                  {shipment.tracking_no && (
                    <p className="font-mono text-xs text-muted-foreground">
                      Mã vận đơn: {shipment.tracking_no}
                    </p>
                  )}
                  {shipment.driver_note && (
                    <p className="text-xs text-muted-foreground">
                      {shipment.method === "hand" ? "Người mang: " : "Xe / Tài xế: "}
                      <span className="font-medium text-foreground">
                        {shipment.driver_note}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Không ghi nhận thêm</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {isExternalDestination
                  ? "Người ký nhận (đơn vị ngoài)"
                  : "Số lượng hồ sơ"}
              </p>
              {isExternalDestination ? (
                <p className="font-medium">
                  {shipment.recipient_name || (
                    <span className="font-normal text-muted-foreground">
                      Chưa cập nhật
                    </span>
                  )}
                </p>
              ) : (
                <p className="font-medium">{items.length} hồ sơ</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left/Main column: Shipment items */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold">
                    Danh sách hồ sơ trong chuyến ({items.length})
                  </h2>
                </div>

                {canConfirmItems && (
                  <div className="flex flex-wrap items-center gap-2">
                    {openItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSelectedDocIds(
                            selectedDocIds.length === openItems.length
                              ? []
                              : openItems.map((i) => i.document_id),
                          )
                        }
                      >
                        {selectedDocIds.length === openItems.length
                          ? "Bỏ chọn tất cả"
                          : `Chọn tất cả (${openItems.length})`}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={selectedDocIds.length === 0}
                      onClick={() => setConfirmDialogOpen(true)}
                    >
                      <Check className="h-4 w-4" />
                      {isExternalDestination ? "Đã giao" : "Đã đến"} (
                      {selectedDocIds.length})
                    </Button>
                  </div>
                )}
              </div>

              {itemsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Chuyến gửi không có hồ sơ nào.
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {items.map((item) => {
                    const doc = item.document;
                    const itemMeta = SHIPMENT_ITEM_STATUS_META[item.status];
                    const docMeta = doc
                      ? DOCUMENT_STATUS_META[doc.status]
                      : null;
                    const isOpen = item.status === "in_transit";
                    const checked = selectedDocIds.includes(item.document_id);
                    const receiverName = nameOf(item.received_by);
                    const allowMarkLost = canMarkItemLost(item);

                    return (
                      <div
                        key={item.document_id}
                        className={cn(
                          "flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between",
                          isOpen && checked && canConfirmItems && "bg-primary/5",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          {isOpen && canConfirmItems && (
                            <button
                              type="button"
                              onClick={() => toggleSelectDoc(item.document_id)}
                              className="mt-0.5 shrink-0"
                              aria-label="Chọn hồ sơ"
                            >
                              <span
                                className={cn(
                                  "flex h-5 w-5 items-center justify-center rounded border",
                                  checked
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-input bg-background",
                                )}
                              >
                                {checked && <Check className="h-3.5 w-3.5" />}
                              </span>
                            </button>
                          )}

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`/documents/${item.document_id}`}
                                className="font-mono text-xs font-semibold text-primary hover:underline"
                              >
                                {doc?.code ?? "—"}
                              </Link>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                                  itemMeta.badge,
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    itemMeta.dot,
                                  )}
                                />
                                {itemMeta.label}
                              </span>
                              {docMeta && (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] font-normal"
                                >
                                  Hồ sơ: {docMeta.label}
                                </Badge>
                              )}
                            </div>

                            <Link
                              href={`/documents/${item.document_id}`}
                              className="block font-medium leading-snug hover:underline"
                            >
                              {doc?.title ?? "Hồ sơ không xác định"}
                            </Link>

                            {item.status === "received" && (
                              <p className="text-xs text-muted-foreground">
                                Xác nhận bởi{" "}
                                <span className="font-medium text-foreground">
                                  {receiverName ?? "—"}
                                </span>
                                {item.received_at &&
                                  ` · ${formatDateTime(item.received_at)}`}
                                {item.note && ` · Ghi chú: "${item.note}"`}
                              </p>
                            )}

                            {item.status === "lost" && item.lost_reason && (
                              <p className="text-xs text-red-600">
                                Lý do thất lạc: {item.lost_reason}
                              </p>
                            )}

                            {item.status === "cancelled" && item.note && (
                              <p className="text-xs text-muted-foreground">
                                Ghi chú huỷ: {item.note}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                          {allowMarkLost && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                setLostTarget({
                                  documentId: item.document_id,
                                  code: doc?.code ?? null,
                                  title: doc?.title ?? null,
                                })
                              }
                            >
                              <AlertTriangle className="h-3.5 w-3.5" /> Báo thất
                              lạc
                            </Button>
                          )}
                          <Link
                            href={`/documents/${item.document_id}`}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Xem hồ sơ <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Shipment attachments */}
        <div className="space-y-4">
          <ShipmentAttachmentsCard
            shipmentId={shipment.id}
            attachments={attachments}
            currentUserId={me?.id ?? null}
            isLeaderOrAdmin={isLeaderOrAdmin}
            nameOf={nameOf}
          />
        </div>
      </div>

      <ConfirmShipmentItemsDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        shipmentId={shipment.id}
        shipmentCode={shipment.code}
        isExternal={isExternalDestination}
        defaultRecipientName={shipment.recipient_name ?? ""}
        selectedItems={openItems.filter((i) =>
          selectedDocIds.includes(i.document_id),
        )}
        onConfirmed={() => setSelectedDocIds([])}
      />

      <CancelShipmentDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        shipmentId={shipment.id}
        shipmentCode={shipment.code}
        documentIds={items.map((i) => i.document_id)}
      />

      <MarkLostDialog
        open={!!lostTarget}
        onOpenChange={(v) => !v && setLostTarget(null)}
        documentId={lostTarget?.documentId ?? null}
        documentCode={lostTarget?.code}
        documentTitle={lostTarget?.title}
        shipmentId={shipment.id}
      />
    </div>
  );
}

function ConfirmShipmentItemsDialog({
  open,
  onOpenChange,
  shipmentId,
  shipmentCode,
  isExternal,
  defaultRecipientName,
  selectedItems,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipmentId: string;
  shipmentCode: string;
  isExternal: boolean;
  defaultRecipientName: string;
  selectedItems: ShipmentItemWithDocument[];
  onConfirmed?: () => void;
}) {
  const qc = useQueryClient();
  const confirmItems = useConfirmShipmentItems();

  const [recipientName, setRecipientName] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setRecipientName(defaultRecipientName);
    setNote("");
    setFiles([]);
  }, [open, defaultRecipientName]);

  const pending = confirmItems.isPending || uploading;

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedItems.length === 0) return;

    try {
      await confirmItems.mutateAsync({
        shipmentId,
        documentIds: selectedItems.map((i) => i.document_id),
        recipientName: isExternal ? recipientName.trim() || null : null,
        note: note.trim() || null,
      });
    } catch {
      return;
    }

    onConfirmed?.();

    if (files.length > 0) {
      setUploading(true);
      try {
        for (const file of files) {
          await uploadShipmentFile({
            shipmentId,
            file,
          });
        }
        qc.invalidateQueries({
          queryKey: queryKeys.shipmentAttachments(shipmentId),
        });
      } catch (err) {
        toast.error(friendlyError(err, "Tải ảnh minh chứng thất bại."));
      } finally {
        setUploading(false);
      }
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isExternal
              ? "Xác nhận đã giao cho đơn vị nhận"
              : "Xác nhận hồ sơ đã đến văn phòng"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Chuyến <span className="font-mono font-semibold">{shipmentCode}</span>{" "}
            · {selectedItems.length} hồ sơ được chọn
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="max-h-32 divide-y overflow-y-auto rounded-md border bg-muted/20 px-3 py-1.5 text-xs">
            {selectedItems.map((item) => (
              <div key={item.document_id} className="py-1">
                <span className="font-mono font-semibold text-primary">
                  {item.document?.code ?? "—"}
                </span>{" "}
                — {item.document?.title ?? "Hồ sơ"}
              </div>
            ))}
          </div>

          {isExternal && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-recipient">
                Người ký nhận tại đơn vị ngoài
              </Label>
              <Input
                id="confirm-recipient"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Nhập họ tên người nhận / văn thư..."
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="confirm-note">Ghi chú nhận / giao (tuỳ chọn)</Label>
            <Textarea
              id="confirm-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú tình trạng bì thư, số lượng bản..."
              className="min-h-[72px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ảnh ký nhận / minh chứng (tuỳ chọn)</Label>
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

            {files.length > 0 && (
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
            )}
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
            <Button
              type="submit"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={pending || selectedItems.length === 0}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {pending
                ? "Đang xác nhận..."
                : isExternal
                  ? "Xác nhận đã giao"
                  : "Xác nhận đã đến"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelShipmentDialog({
  open,
  onOpenChange,
  shipmentId,
  shipmentCode,
  documentIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipmentId: string;
  shipmentCode: string;
  documentIds: string[];
}) {
  const cancelShipment = useCancelShipment();
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setNote("");
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await cancelShipment.mutateAsync({
        shipmentId,
        note: note.trim() || null,
        documentIds,
      });
    } catch {
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Huỷ chuyến vận chuyển {shipmentCode}?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Các hồ sơ trong chuyến sẽ được khôi phục lại trạng thái trước khi
            gửi và có thể gửi lại trong chuyến khác.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-ship-note">Lý do / Ghi chú huỷ</Label>
            <Textarea
              id="cancel-ship-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nhập lý do huỷ chuyến (tuỳ chọn)..."
              className="min-h-[76px] resize-none"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={cancelShipment.isPending}
            >
              Đóng
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={cancelShipment.isPending}
            >
              {cancelShipment.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Xác nhận huỷ chuyến
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShipmentAttachmentsCard({
  shipmentId,
  attachments,
  currentUserId,
  isLeaderOrAdmin,
  nameOf,
}: {
  shipmentId: string;
  attachments: DocumentAttachment[];
  currentUserId: string | null;
  isLeaderOrAdmin: boolean;
  nameOf: (id: string | null | undefined) => string | null;
}) {
  const upload = useUploadShipmentAttachment(shipmentId);
  const del = useDeleteShipmentAttachment(shipmentId);
  const inputRef = useRef<HTMLInputElement>(null);

  async function openFile(path: string) {
    const url = await getDocumentAttachmentUrl(path);
    if (url) window.open(url, "_blank");
  }

  const images = attachments.filter((a) => isImageFile(a.file_name));
  const otherFiles = attachments.filter((a) => !isImageFile(a.file_name));

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            Biên nhận &amp; Minh chứng ({attachments.length})
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Tải lên
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
        </div>

        {images.length > 0 && (
          <div className="space-y-2">
            {images.map((att) => {
              const canDelete =
                (!!currentUserId && att.uploaded_by === currentUserId) ||
                isLeaderOrAdmin;
              return (
                <ShipmentAttachmentImageCard
                  key={att.id}
                  attachment={att}
                  uploaderName={nameOf(att.uploaded_by)}
                  canDelete={canDelete}
                  onOpen={() => openFile(att.file_url)}
                  onDelete={() => del.mutate(att)}
                />
              );
            })}
          </div>
        )}

        {otherFiles.length > 0 && (
          <div className="space-y-1.5">
            {otherFiles.map((att) => {
              const canDelete =
                (!!currentUserId && att.uploaded_by === currentUserId) ||
                isLeaderOrAdmin;
              return (
                <div
                  key={att.id}
                  className="group flex items-center gap-2 rounded-md border px-2.5 py-2"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openFile(att.file_url)}
                      className="block w-full truncate text-left text-xs font-medium hover:underline"
                    >
                      {att.file_name}
                    </button>
                    <p className="text-[11px] text-muted-foreground">
                      {nameOf(att.uploaded_by) ?? "—"} ·{" "}
                      {formatDateTime(att.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openFile(att.file_url)}
                    title="Tải xuống"
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => del.mutate(att)}
                      title="Xoá tệp"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {attachments.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Chưa có ảnh phiếu gửi hay biên nhận nào.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ShipmentAttachmentImageCard({
  attachment,
  uploaderName,
  canDelete,
  onOpen,
  onDelete,
}: {
  attachment: DocumentAttachment;
  uploaderName: string | null;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDocumentAttachmentUrl(attachment.file_url).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [attachment.file_url]);

  return (
    <div className="group overflow-hidden rounded-md border bg-muted/30">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={attachment.file_name}
          onClick={onOpen}
          className="max-h-56 w-full cursor-zoom-in object-contain"
        />
      ) : (
        <div className="flex h-36 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center gap-2 border-t bg-background px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{attachment.file_name}</p>
          <p className="text-[11px] text-muted-foreground">
            {uploaderName ?? "—"} · {formatDateTime(attachment.created_at)}
          </p>
        </div>
        <button type="button" onClick={onOpen} title="Mở / tải ảnh">
          <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
        {canDelete && (
          <button type="button" onClick={onDelete} title="Xoá ảnh">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
          </button>
        )}
      </div>
    </div>
  );
}
