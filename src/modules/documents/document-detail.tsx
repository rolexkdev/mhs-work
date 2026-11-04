"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  Download,
  History,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Trash2,
  Truck,
  User,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dueLabel,
  formatDate,
  formatDateTime,
  initials,
} from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DOCUMENT_STATUS_META,
  DOCUMENT_PRIORITY_META,
  HANDOFF_KIND_META,
  HANDOFF_STATUS_META,
  NON_HANDOFFABLE_DOCUMENT_STATUSES,
  NON_SHIPPABLE_DOCUMENT_STATUSES,
  SHIPMENT_METHOD_META,
  shipmentStatusMeta,
} from "@/modules/documents/constants";
import {
  useDocument,
  useDeleteDocument,
} from "@/modules/documents/hooks";
import {
  useDocumentHandoffs,
  useDocumentHolders,
  useCancelHandoff,
} from "@/modules/documents/handoff-hooks";
import {
  useDocumentAttachments,
  useUploadDocumentAttachment,
  useDeleteDocumentAttachment,
  getDocumentAttachmentUrl,
} from "@/modules/documents/attachment-hooks";
import {
  useDocumentShipments,
  type DocumentShipmentHistoryItem,
} from "@/modules/documents/shipment-hooks";
import { useExternalUnits } from "@/modules/documents/external-unit-hooks";
import { useDocumentLogs } from "@/modules/documents/log-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMe } from "@/modules/meetings/item-hooks";
import {
  AssigneeStack,
  peopleOf,
} from "@/modules/tasks/components/assignee-stack";
import { DocumentFormDialog } from "@/modules/documents/document-form-dialog";
import { HandoffDialog } from "@/modules/documents/handoff-dialog";
import { RespondHandoffDialog } from "@/modules/documents/respond-handoff-dialog";
import { ShipmentFormDialog } from "@/modules/documents/shipment-form-dialog";
import { MarkLostDialog } from "@/modules/documents/mark-lost-dialog";
import type {
  DocumentAttachment,
  DocumentHandoff,
  DocumentLog,
  DocumentStatus,
  ExternalUnit,
  Office,
  ShipmentMethod,
} from "@/types/database";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const isImageFile = (name: string) => IMAGE_RE.test(name);

const HANDOFF_LOG_ACTIONS = new Set([
  "handoff_created",
  "handoff_accepted",
  "handoff_rejected",
  "handoff_cancelled",
]);

export function DocumentDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: document, isLoading } = useDocument(id);
  const { data: handoffs = [] } = useDocumentHandoffs(id);
  const { data: holders = [] } = useDocumentHolders(id);
  const { data: attachments = [] } = useDocumentAttachments(id);
  const { data: documentShipments = [] } = useDocumentShipments(id);
  const { data: logs = [] } = useDocumentLogs(id);
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();
  const { data: externalUnits = [] } = useExternalUnits({
    includeInactive: true,
  });

  const deleteDocument = useDeleteDocument();
  const cancelHandoff = useCancelHandoff();

  const [editOpen, setEditOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [markLostOpen, setMarkLostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancellingHandoff, setCancellingHandoff] =
    useState<DocumentHandoff | null>(null);
  const [respondState, setRespondState] = useState<{
    handoff: DocumentHandoff;
    accept: boolean;
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
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Không tìm thấy hồ sơ.</p>
        <Link
          href="/documents"
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          ← Quay lại danh sách hồ sơ
        </Link>
      </div>
    );
  }

  const myProfile = me ? profileById.get(me.id) : undefined;
  const isLeaderOrAdmin = me?.role === "admin" || me?.role === "leader";
  const isAdmin = me?.role === "admin";
  const isCreator = !!me && document.created_by === me.id;
  const isCurrentHolder = !!me && document.current_holder_id === me.id;
  const isCopyHolder = !!me && holders.some((h) => h.user_id === me.id);

  const pendingRecipientIds = handoffs
    .filter((h) => h.status === "pending")
    .map((h) => h.to_user);
  const hasPendingHandoff = pendingRecipientIds.length > 0;

  const openShipmentEntry =
    documentShipments.find(
      (entry) =>
        entry.status === "in_transit" &&
        entry.shipment.status === "in_transit",
    ) ?? null;
  const openShipment = openShipmentEntry?.shipment ?? null;

  const canCreateHandoff =
    (isCurrentHolder || isCopyHolder || isLeaderOrAdmin) &&
    !NON_HANDOFFABLE_DOCUMENT_STATUSES.has(document.status);

  const canShipDocument =
    (isCurrentHolder || isCopyHolder || isLeaderOrAdmin) &&
    !NON_SHIPPABLE_DOCUMENT_STATUSES.has(document.status) &&
    !hasPendingHandoff &&
    !openShipment;

  const canMarkLost =
    document.status !== "lost" &&
    (isCurrentHolder ||
      isCopyHolder ||
      isLeaderOrAdmin ||
      (!!openShipment &&
        ((!!me && openShipment.sent_by === me.id) ||
          (!!openShipment.to_office_id &&
            !!myProfile?.office_id &&
            myProfile.office_id === openShipment.to_office_id))));

  const canDelete = (isCreator || isAdmin) && documentShipments.length === 0;
  const canEdit =
    isCreator || isCurrentHolder || isCopyHolder || isLeaderOrAdmin;

  const myPendingHandoff = me
    ? handoffs.find((h) => h.to_user === me.id && h.status === "pending") ??
      null
    : null;

  const statusMeta = DOCUMENT_STATUS_META[document.status];
  const priorityMeta = DOCUMENT_PRIORITY_META[document.priority];
  const originOffice = document.origin_office_id
    ? officeById.get(document.origin_office_id)
    : undefined;
  const currentOffice = document.current_office_id
    ? officeById.get(document.current_office_id)
    : undefined;
  const holderName = nameOf(document.current_holder_id);
  const holderAvatar = avatarOf(document.current_holder_id);
  const isDone =
    document.status === "done" || document.status === "archived";
  const due = dueLabel(document.due_date, { done: isDone });

  const copyHolderUserIds = Array.from(
    new Set(holders.map((h) => h.user_id)),
  );

  const formatShipmentDestination = (s: {
    to_office_id?: string | null;
    to_external_unit_id?: string | null;
  }) => {
    if (s.to_office_id) {
      const off = officeById.get(s.to_office_id);
      return off ? `${off.code} — ${off.name}` : "Văn phòng";
    }
    if (s.to_external_unit_id) {
      const ext = externalUnitById.get(s.to_external_unit_id);
      return ext ? ext.name : "Đơn vị bên ngoài";
    }
    return "—";
  };

  return (
    <div className="space-y-6">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Danh sách hồ sơ
      </Link>

      {/* Banner when the document is in an open shipment */}
      {openShipment && (
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/90 p-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-900">
              <Truck className="h-4 w-4 shrink-0" />
              <span>
                Đang vận chuyển trong chuyến{" "}
                <Link
                  href={`/documents/shipments/${openShipment.id}`}
                  className="font-mono underline hover:text-primary"
                >
                  {openShipment.code}
                </Link>{" "}
                → {formatShipmentDestination(openShipment)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                  shipmentStatusMeta(openShipment).badge,
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    shipmentStatusMeta(openShipment).dot,
                  )}
                />
                {shipmentStatusMeta(openShipment).label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                  SHIPMENT_METHOD_META[openShipment.method].badge,
                )}
              >
                {SHIPMENT_METHOD_META[openShipment.method].label}
              </span>
            </div>
            <p className="text-xs text-amber-800">
              Người gửi:{" "}
              <span className="font-medium">
                {nameOf(openShipment.sent_by) ?? "—"}
              </span>{" "}
              · {formatDateTime(openShipment.sent_at)}
              {openShipment.tracking_no &&
                ` · Mã vận đơn: ${openShipment.tracking_no}`}
            </p>
          </div>
          <div className="shrink-0">
            <Link
              href={`/documents/shipments/${openShipment.id}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "bg-white",
              )}
            >
              Xem chuyến gửi <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Banner for my pending handoff on this document */}
      {myPendingHandoff && (
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/90 p-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-amber-900">
                Hồ sơ đang chờ bạn xác nhận nhận bàn giao
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                  HANDOFF_KIND_META[myPendingHandoff.kind].badge,
                )}
              >
                {HANDOFF_KIND_META[myPendingHandoff.kind].label}
              </span>
            </div>
            <p className="text-xs text-amber-800">
              Người giao:{" "}
              <span className="font-medium">
                {nameOf(myPendingHandoff.from_user) ?? "—"}
              </span>{" "}
              · {formatDateTime(myPendingHandoff.created_at)}
              {myPendingHandoff.note && ` · Ghi chú: "${myPendingHandoff.note}"`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() =>
                setRespondState({ handoff: myPendingHandoff, accept: true })
              }
            >
              <Check className="h-4 w-4" /> Đã nhận
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 bg-white text-red-700 hover:bg-red-50"
              onClick={() =>
                setRespondState({ handoff: myPendingHandoff, accept: false })
              }
            >
              <X className="h-4 w-4" /> Từ chối
            </Button>
          </div>
        </div>
      )}

      {/* Header card */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                  {document.code}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                    statusMeta.badge,
                  )}
                >
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)}
                  />
                  {statusMeta.label}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                    priorityMeta.badge,
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      priorityMeta.dot,
                    )}
                  />
                  Ưu tiên: {priorityMeta.label}
                </span>
                {document.category && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {document.category}
                  </Badge>
                )}
              </div>

              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {document.title}
              </h1>

              {document.description && (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {document.description}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {canCreateHandoff && (
                <Button size="sm" onClick={() => setHandoffOpen(true)}>
                  <Send className="h-4 w-4" /> Bàn giao
                </Button>
              )}
              {canShipDocument && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShipmentOpen(true)}
                >
                  <Truck className="h-4 w-4" /> Gửi đi
                </Button>
              )}
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-4 w-4" /> Sửa
                </Button>
              )}
              {canMarkLost && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setMarkLostOpen(true)}
                >
                  <AlertTriangle className="h-4 w-4" /> Báo thất lạc
                </Button>
              )}
              {canDelete && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> Xoá
                </Button>
              )}
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Người đang giữ chính
              </p>
              {holderName ? (
                <div className="flex items-center gap-2 font-medium">
                  <Avatar className="h-6 w-6">
                    {holderAvatar && (
                      <AvatarImage src={holderAvatar} alt={holderName} />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {initials(holderName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{holderName}</span>
                </div>
              ) : (
                <p className="text-muted-foreground">Chưa xác định</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Văn phòng hiện tại / Khởi
                tạo
              </p>
              <div className="flex flex-wrap items-center gap-1.5 font-medium">
                {currentOffice ? (
                  <span title={currentOffice.name}>{currentOffice.code}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {originOffice && originOffice.id !== currentOffice?.id && (
                  <span className="text-xs font-normal text-muted-foreground">
                    (Khởi tạo: {originOffice.code})
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Hạn xử lý
              </p>
              {document.due_date ? (
                <p
                  className={cn(
                    "font-medium",
                    due.tone === "overdue" && "text-red-600",
                    due.tone === "today" && "text-amber-600",
                  )}
                >
                  {formatDate(document.due_date)} ({due.text})
                </p>
              ) : (
                <p className="text-muted-foreground">Không đặt hạn</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Người đang giữ bản sao (
                {copyHolderUserIds.length})
              </p>
              {copyHolderUserIds.length > 0 ? (
                <AssigneeStack
                  people={peopleOf(copyHolderUserIds, nameOf, avatarOf)}
                  avatarClassName="h-6 w-6"
                />
              ) : (
                <p className="text-muted-foreground">Chưa có</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left/Main column: Timeline of handoffs + logs */}
        <div className="space-y-4 lg:col-span-2">
          <TimelineSection
            handoffs={handoffs}
            logs={logs}
            attachments={attachments}
            currentUserId={me?.id ?? null}
            isLeaderOrAdmin={isLeaderOrAdmin}
            nameOf={nameOf}
            avatarOf={avatarOf}
            officeById={officeById}
            externalUnitById={externalUnitById}
            onRespond={(h, accept) => setRespondState({ handoff: h, accept })}
            onCancel={(h) => setCancellingHandoff(h)}
          />
        </div>

        {/* Right column: Shipments history + Attachments */}
        <div className="space-y-4">
          <DocumentShipmentsCard
            entries={documentShipments}
            officeById={officeById}
            externalUnitById={externalUnitById}
            nameOf={nameOf}
          />
          <AttachmentsCard
            documentId={document.id}
            attachments={attachments}
            currentUserId={me?.id ?? null}
            isLeaderOrAdmin={isLeaderOrAdmin}
            nameOf={nameOf}
          />
        </div>
      </div>

      <DocumentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        document={document}
      />

      <HandoffDialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        documentId={document.id}
        currentUserId={me?.id ?? null}
        pendingRecipientIds={pendingRecipientIds}
      />

      <ShipmentFormDialog
        open={shipmentOpen}
        onOpenChange={setShipmentOpen}
        defaultDocumentIds={[document.id]}
        navigateOnCreate
      />

      <MarkLostDialog
        open={markLostOpen}
        onOpenChange={setMarkLostOpen}
        documentId={document.id}
        documentCode={document.code}
        documentTitle={document.title}
        shipmentId={openShipment?.id ?? null}
      />

      <RespondHandoffDialog
        open={!!respondState}
        onOpenChange={(v) => !v && setRespondState(null)}
        handoff={respondState?.handoff ?? null}
        documentTitle={`${document.code} — ${document.title}`}
        defaultAccept={respondState?.accept ?? true}
      />

      <ConfirmDialog
        open={!!cancellingHandoff}
        onOpenChange={(v) => !v && setCancellingHandoff(null)}
        title="Huỷ lượt bàn giao?"
        description={
          cancellingHandoff
            ? `Huỷ bàn giao cho ${nameOf(cancellingHandoff.to_user) ?? "người nhận"}?`
            : undefined
        }
        confirmLabel="Huỷ bàn giao"
        destructive
        onConfirm={() => {
          if (cancellingHandoff) {
            cancelHandoff.mutate({
              handoffId: cancellingHandoff.id,
              documentId: document.id,
            });
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Xoá hồ sơ?"
        description={`Hồ sơ "${document.code} — ${document.title}" sẽ bị xoá vĩnh viễn cùng lịch sử bàn giao và tệp đính kèm.`}
        confirmLabel="Xoá hồ sơ"
        destructive
        onConfirm={async () => {
          try {
            await deleteDocument.mutateAsync(document.id);
          } catch {
            return;
          }
          router.push("/documents");
        }}
      />
    </div>
  );
}

function DocumentShipmentsCard({
  entries,
  officeById,
  externalUnitById,
  nameOf,
}: {
  entries: DocumentShipmentHistoryItem[];
  officeById: Map<string, Office>;
  externalUnitById: Map<string, ExternalUnit>;
  nameOf: (id: string | null | undefined) => string | null;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Truck className="h-4 w-4 text-muted-foreground" />
            Vận chuyển ({entries.length})
          </h2>
          <Link
            href="/documents/shipments"
            className="text-xs text-primary hover:underline"
          >
            Tất cả chuyến
          </Link>
        </div>

        {entries.length === 0 ? (
          <p className="py-5 text-center text-xs text-muted-foreground">
            Hồ sơ này chưa từng nằm trong chuyến vận chuyển nào.
          </p>
        ) : (
          <div className="space-y-2.5">
            {entries.map((entry) => {
              const s = entry.shipment;
              const statusMeta = shipmentStatusMeta(s);
              const methodMeta = SHIPMENT_METHOD_META[s.method];
              const fromOffice = officeById.get(s.from_office_id);
              const toOffice = s.to_office_id
                ? officeById.get(s.to_office_id)
                : undefined;
              const toExternal = s.to_external_unit_id
                ? externalUnitById.get(s.to_external_unit_id)
                : undefined;

              return (
                <div
                  key={entry.shipment_id}
                  className="space-y-1.5 rounded-lg border bg-muted/20 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <Link
                      href={`/documents/shipments/${s.id}`}
                      className="font-mono font-semibold text-primary hover:underline"
                    >
                      {s.code}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
                          methodMeta.badge,
                        )}
                      >
                        {methodMeta.label}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
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
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 font-medium text-foreground">
                    <span>{fromOffice?.code ?? "—"}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span>
                      {toOffice
                        ? `${toOffice.code} (${toOffice.name})`
                        : (toExternal?.name ?? "Đơn vị bên ngoài")}
                    </span>
                  </div>

                  <p className="text-muted-foreground">
                    Gửi bởi {nameOf(s.sent_by) ?? "—"} ·{" "}
                    {formatDateTime(s.sent_at)}
                  </p>

                  {entry.status === "received" && entry.received_at && (
                    <p className="text-emerald-700">
                      {s.to_external_unit_id ? "Đã giao lúc " : "Đã nhận lúc "}
                      {formatDateTime(entry.received_at)}
                      {entry.received_by &&
                        ` bởi ${nameOf(entry.received_by) ?? "—"}`}
                    </p>
                  )}

                  {entry.status === "lost" && entry.lost_reason && (
                    <p className="text-red-600">
                      Thất lạc: {entry.lost_reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TimelineEntry =
  | {
      type: "handoff";
      id: string;
      timestamp: string;
      handoff: DocumentHandoff;
    }
  | {
      type: "log";
      id: string;
      timestamp: string;
      log: DocumentLog;
    };

function TimelineSection({
  handoffs,
  logs,
  attachments,
  currentUserId,
  isLeaderOrAdmin,
  nameOf,
  avatarOf,
  officeById,
  externalUnitById,
  onRespond,
  onCancel,
}: {
  handoffs: DocumentHandoff[];
  logs: DocumentLog[];
  attachments: DocumentAttachment[];
  currentUserId: string | null;
  isLeaderOrAdmin: boolean;
  nameOf: (id: string | null | undefined) => string | null;
  avatarOf: (id: string | null | undefined) => string | null;
  officeById: Map<string, Office>;
  externalUnitById: Map<string, ExternalUnit>;
  onRespond: (h: DocumentHandoff, accept: boolean) => void;
  onCancel: (h: DocumentHandoff) => void;
}) {
  const attachmentsByHandoff = useMemo(() => {
    const map = new Map<string, DocumentAttachment[]>();
    for (const att of attachments) {
      if (!att.handoff_id) continue;
      const list = map.get(att.handoff_id);
      if (list) list.push(att);
      else map.set(att.handoff_id, [att]);
    }
    return map;
  }, [attachments]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = [];
    for (const h of handoffs) {
      items.push({
        type: "handoff",
        id: `handoff-${h.id}`,
        timestamp: h.responded_at ?? h.created_at,
        handoff: h,
      });
    }
    for (const l of logs) {
      // Handoff cards already display full handoff details; keep non-handoff
      // document change logs so the merged timeline has no duplicate noise.
      if (HANDOFF_LOG_ACTIONS.has(l.action)) continue;
      items.push({
        type: "log",
        id: `log-${l.id}`,
        timestamp: l.created_at,
        log: l,
      });
    }
    items.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return items;
  }, [handoffs, logs]);

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            Lịch sử luân chuyển &amp; bàn giao
          </h2>
          <span className="text-xs text-muted-foreground">
            {handoffs.length} lượt bàn giao
          </span>
        </div>

        {timeline.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có hoạt động hay lượt bàn giao nào.
          </p>
        ) : (
          <ol className="relative ml-2 space-y-4 border-l border-border pl-4">
            {timeline.map((entry) => {
              if (entry.type === "handoff") {
                const h = entry.handoff;
                const kindMeta = HANDOFF_KIND_META[h.kind];
                const statusMeta = HANDOFF_STATUS_META[h.status];
                const fromName = nameOf(h.from_user) ?? "—";
                const toName = nameOf(h.to_user) ?? "—";
                const fromAvatar = avatarOf(h.from_user);
                const toAvatar = avatarOf(h.to_user);
                const proofs = attachmentsByHandoff.get(h.id) ?? [];

                const canRespond =
                  h.status === "pending" &&
                  !!currentUserId &&
                  h.to_user === currentUserId;
                const canCancel =
                  h.status === "pending" &&
                  ((!!currentUserId && h.from_user === currentUserId) ||
                    isLeaderOrAdmin);

                return (
                  <li key={entry.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[21px] top-2.5 h-2.5 w-2.5 rounded-full ring-4 ring-background",
                        statusMeta.dot,
                      )}
                    />
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Avatar className="h-5 w-5">
                              {fromAvatar && (
                                <AvatarImage src={fromAvatar} alt={fromName} />
                              )}
                              <AvatarFallback className="text-[9px]">
                                {initials(fromName)}
                              </AvatarFallback>
                            </Avatar>
                            {fromName}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Avatar className="h-5 w-5">
                              {toAvatar && (
                                <AvatarImage src={toAvatar} alt={toName} />
                              )}
                              <AvatarFallback className="text-[9px]">
                                {initials(toName)}
                              </AvatarFallback>
                            </Avatar>
                            {toName}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                              kindMeta.badge,
                            )}
                          >
                            {kindMeta.label}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
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
                        </div>
                      </div>

                      {h.note && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Ghi chú giao:
                          </span>{" "}
                          {h.note}
                        </p>
                      )}

                      {h.response_note && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Phản hồi:
                          </span>{" "}
                          {h.response_note}
                        </p>
                      )}

                      {proofs.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {proofs.map((att) => (
                            <ProofThumbnail key={att.id} attachment={att} />
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                        <span>
                          Giao lúc {formatDateTime(h.created_at)}
                          {h.responded_at &&
                            ` · Phản hồi ${formatDateTime(h.responded_at)}`}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {canRespond && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                                onClick={() => onRespond(h, true)}
                              >
                                <Check className="h-3.5 w-3.5" /> Đã nhận
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10"
                                onClick={() => onRespond(h, false)}
                              >
                                <X className="h-3.5 w-3.5" /> Từ chối
                              </Button>
                            </>
                          )}
                          {canCancel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => onCancel(h)}
                            >
                              Huỷ
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              }

              const log = entry.log;
              const actorName = nameOf(log.created_by) ?? "Hệ thống";
              const actorAvatar = avatarOf(log.created_by);
              return (
                <li key={entry.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-background" />
                  <div className="flex items-start gap-2 py-0.5 text-xs text-muted-foreground">
                    <Avatar className="mt-0.5 h-5 w-5 shrink-0">
                      {actorAvatar && (
                        <AvatarImage src={actorAvatar} alt={actorName} />
                      )}
                      <AvatarFallback className="text-[9px]">
                        {initials(actorName)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="leading-relaxed">
                      <span className="font-medium text-foreground">
                        {actorName}
                      </span>{" "}
                      {describeDocumentLog(
                        log,
                        nameOf,
                        officeById,
                        externalUnitById,
                      )}{" "}
                      <span className="whitespace-nowrap">
                        · {formatDateTime(log.created_at)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function describeDocumentLog(
  log: DocumentLog,
  nameOf: (id: string | null | undefined) => string | null,
  officeById: Map<string, Office>,
  externalUnitById: Map<string, ExternalUnit>,
): React.ReactNode {
  const oldV = log.old_value;
  const newV = log.new_value;
  const statusLabel = (v: unknown) =>
    typeof v === "string"
      ? (DOCUMENT_STATUS_META[v as DocumentStatus]?.label ?? v)
      : "—";
  const personLabel = (v: unknown) =>
    typeof v === "string" ? (nameOf(v) ?? "—") : "trống";
  const dateLabel = (v: unknown) =>
    typeof v === "string" && v ? formatDate(v) : "trống";

  const payload =
    newV && typeof newV === "object"
      ? (newV as Record<string, unknown>)
      : null;

  const resolveDestination = (obj: Record<string, unknown> | null): string => {
    if (!obj) return "nơi nhận";
    const toOfficeId =
      typeof obj.to_office_id === "string" ? obj.to_office_id : null;
    const toExternalId =
      typeof obj.to_external_unit_id === "string"
        ? obj.to_external_unit_id
        : null;
    if (toOfficeId) {
      const off = officeById.get(toOfficeId);
      return off ? `${off.code} (${off.name})` : "văn phòng nhận";
    }
    if (toExternalId) {
      const ext = externalUnitById.get(toExternalId);
      return ext ? ext.name : "đơn vị bên ngoài";
    }
    return "nơi nhận";
  };

  const renderShipmentLink = (obj: Record<string, unknown> | null) => {
    if (!obj) return null;
    const shipmentId =
      typeof obj.shipment_id === "string" ? obj.shipment_id : null;
    const code = typeof obj.code === "string" ? obj.code : null;
    if (shipmentId && code) {
      return (
        <Link
          href={`/documents/shipments/${shipmentId}`}
          className="font-mono font-semibold text-primary hover:underline"
        >
          {code}
        </Link>
      );
    }
    if (code) {
      return (
        <span className="font-mono font-semibold text-foreground">{code}</span>
      );
    }
    return null;
  };

  switch (log.action) {
    case "created":
      return <>đã tạo hồ sơ</>;
    case "status":
      return (
        <>
          đổi trạng thái{" "}
          <span className="font-medium text-foreground">
            {statusLabel(oldV)}
          </span>{" "}
          →{" "}
          <span className="font-medium text-foreground">
            {statusLabel(newV)}
          </span>
        </>
      );
    case "current_holder_id":
      return (
        <>
          chuyển người giữ chính{" "}
          <span className="font-medium text-foreground">
            {personLabel(oldV)}
          </span>{" "}
          →{" "}
          <span className="font-medium text-foreground">
            {personLabel(newV)}
          </span>
        </>
      );
    case "title":
      return (
        <>
          đổi tiêu đề thành{" "}
          <span className="font-medium text-foreground">
            &ldquo;{String(newV ?? "")}&rdquo;
          </span>
        </>
      );
    case "due_date":
      return (
        <>
          đổi hạn xử lý{" "}
          <span className="font-medium text-foreground">{dateLabel(oldV)}</span>{" "}
          →{" "}
          <span className="font-medium text-foreground">{dateLabel(newV)}</span>
        </>
      );
    case "shipment_sent": {
      const methodKey =
        typeof payload?.method === "string"
          ? (payload.method as ShipmentMethod)
          : null;
      const methodLabel = methodKey
        ? SHIPMENT_METHOD_META[methodKey]?.label
        : null;
      return (
        <>
          đã gửi hồ sơ trong chuyến {renderShipmentLink(payload)} đến{" "}
          <span className="font-medium text-foreground">
            {resolveDestination(payload)}
          </span>
          {methodLabel && ` (${methodLabel})`}
        </>
      );
    }
    case "shipment_received": {
      const recipientName =
        typeof payload?.recipient_name === "string" && payload.recipient_name
          ? payload.recipient_name
          : null;
      return (
        <>
          đã xác nhận hồ sơ trong chuyến {renderShipmentLink(payload)} đến{" "}
          <span className="font-medium text-foreground">
            {resolveDestination(payload)}
          </span>
          {recipientName && ` (người nhận: ${recipientName})`}
        </>
      );
    }
    case "shipment_lost": {
      const reason =
        typeof payload?.lost_reason === "string" ? payload.lost_reason : null;
      return (
        <>
          ghi nhận thất lạc trong chuyến {renderShipmentLink(payload)} đến{" "}
          <span className="font-medium text-foreground">
            {resolveDestination(payload)}
          </span>
          {reason && (
            <>
              {" "}
              — Lý do:{" "}
              <span className="font-medium text-red-600">
                &ldquo;{reason}&rdquo;
              </span>
            </>
          )}
        </>
      );
    }
    case "shipment_cancelled": {
      const note =
        typeof payload?.note === "string" && payload.note
          ? payload.note
          : null;
      return (
        <>
          đã huỷ chuyến vận chuyển {renderShipmentLink(payload)} (đến{" "}
          <span className="font-medium text-foreground">
            {resolveDestination(payload)}
          </span>
          ){note && ` · Ghi chú: "${note}"`}
        </>
      );
    }
    case "marked_lost": {
      const reason =
        typeof payload?.reason === "string" ? payload.reason : null;
      return (
        <>
          đã báo thất lạc hồ sơ
          {reason && (
            <>
              :{" "}
              <span className="font-medium text-red-600">
                &ldquo;{reason}&rdquo;
              </span>
            </>
          )}
        </>
      );
    }
    default:
      return <>cập nhật hồ sơ</>;
  }
}

function ProofThumbnail({ attachment }: { attachment: DocumentAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImg = isImageFile(attachment.file_name);

  useEffect(() => {
    let active = true;
    getDocumentAttachmentUrl(attachment.file_url).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [attachment.file_url]);

  async function handleOpen() {
    const targetUrl =
      url ?? (await getDocumentAttachmentUrl(attachment.file_url));
    if (targetUrl) window.open(targetUrl, "_blank");
  }

  if (isImg) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="group relative h-16 w-16 overflow-hidden rounded-md border bg-background"
        title={attachment.file_name}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.file_name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="inline-flex max-w-[200px] items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
      title={attachment.file_name}
    >
      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{attachment.file_name}</span>
    </button>
  );
}

function AttachmentsCard({
  documentId,
  attachments,
  currentUserId,
  isLeaderOrAdmin,
  nameOf,
}: {
  documentId: string;
  attachments: DocumentAttachment[];
  currentUserId: string | null;
  isLeaderOrAdmin: boolean;
  nameOf: (id: string | null | undefined) => string | null;
}) {
  const upload = useUploadDocumentAttachment(documentId);
  const del = useDeleteDocumentAttachment(documentId);
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
            Tệp đính kèm ({attachments.length})
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
                <AttachmentImageCard
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
            Chưa có bản scan hay tệp đính kèm nào.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AttachmentImageCard({
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
