"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { differenceInDays } from "date-fns";
import {
  ArrowRight,
  Building2,
  Clock,
  Filter,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  SHIPMENT_METHOD_META,
  SHIPMENT_METHOD_ORDER,
  SHIPMENT_STATUS_META,
  SHIPMENT_STATUS_ORDER,
  shipmentStatusMeta,
} from "@/modules/documents/constants";
import {
  useShipments,
  useMyShipmentConfirmations,
  type ShipmentDirectionFilter,
} from "@/modules/documents/shipment-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useExternalUnits } from "@/modules/documents/external-unit-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { ShipmentFormDialog } from "@/modules/documents/shipment-form-dialog";
import type {
  DocumentShipment,
  ExternalUnit,
  Office,
  ShipmentMethod,
  ShipmentStatus,
} from "@/types/database";

const ALL = "__all__";

function daysInTransitLabel(sentAt: string): string {
  const days = Math.max(0, differenceInDays(new Date(), new Date(sentAt)));
  return `đã đi ${days} ngày`;
}

export function ShipmentsWorkspace() {
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();
  const { data: externalUnits = [] } = useExternalUnits({
    includeInactive: true,
  });

  const [tab, setTab] = useState<"confirm" | "in_transit" | "all">("confirm");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [methodFilter, setMethodFilter] = useState<string>(ALL);
  const [directionFilter, setDirectionFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const queryFilters = useMemo(
    () => ({
      status:
        statusFilter === ALL ? null : (statusFilter as ShipmentStatus),
      method:
        methodFilter === ALL ? null : (methodFilter as ShipmentMethod),
      direction:
        directionFilter === ALL
          ? null
          : (directionFilter as ShipmentDirectionFilter),
    }),
    [statusFilter, methodFilter, directionFilter],
  );

  const { data: shipments = [], isLoading: shipmentsLoading } =
    useShipments(queryFilters);
  const { data: myConfirmations = [], isLoading: confirmLoading } =
    useMyShipmentConfirmations();

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

  const matchesClientFilters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (s: DocumentShipment) => {
      if (statusFilter !== ALL && s.status !== statusFilter) return false;
      if (methodFilter !== ALL && s.method !== methodFilter) return false;
      if (directionFilter === "outgoing_office" && !s.to_office_id)
        return false;
      if (directionFilter === "external" && !s.to_external_unit_id)
        return false;
      if (!q) return true;

      const fromOffice = officeById.get(s.from_office_id);
      const toOffice = s.to_office_id
        ? officeById.get(s.to_office_id)
        : undefined;
      const toExternal = s.to_external_unit_id
        ? externalUnitById.get(s.to_external_unit_id)
        : undefined;

      return (
        s.code.toLowerCase().includes(q) ||
        (s.tracking_no ?? "").toLowerCase().includes(q) ||
        (s.carrier ?? "").toLowerCase().includes(q) ||
        (s.driver_note ?? "").toLowerCase().includes(q) ||
        (fromOffice?.code ?? "").toLowerCase().includes(q) ||
        (fromOffice?.name ?? "").toLowerCase().includes(q) ||
        (toOffice?.code ?? "").toLowerCase().includes(q) ||
        (toOffice?.name ?? "").toLowerCase().includes(q) ||
        (toExternal?.name ?? "").toLowerCase().includes(q)
      );
    };
  }, [
    search,
    statusFilter,
    methodFilter,
    directionFilter,
    officeById,
    externalUnitById,
  ]);

  const filteredConfirmations = useMemo(
    () => myConfirmations.filter(matchesClientFilters),
    [myConfirmations, matchesClientFilters],
  );

  const inTransitShipments = useMemo(() => {
    return shipments
      .filter((s) => s.status === "in_transit")
      .filter(matchesClientFilters)
      .sort(
        (a, b) =>
          new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
      );
  }, [shipments, matchesClientFilters]);

  const filteredAll = useMemo(
    () => shipments.filter(matchesClientFilters),
    [shipments, matchesClientFilters],
  );

  const hasFilters =
    statusFilter !== ALL ||
    methodFilter !== ALL ||
    directionFilter !== ALL ||
    !!search.trim();

  function resetFilters() {
    setStatusFilter(ALL);
    setMethodFilter(ALL);
    setDirectionFilter(ALL);
    setSearch("");
  }

  const nameOf = (id: string | null) =>
    id
      ? (profileById.get(id)?.full_name ??
        profileById.get(id)?.email ??
        null)
      : null;

  const avatarOf = (id: string | null) =>
    id ? (profileById.get(id)?.avatar_url ?? null) : null;

  return (
    <div className="space-y-4">
      {/* Toolbar: search, filters, and create button */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 basis-full sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã chuyến (VC-...), mã vận đơn, nơi nhận..."
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {SHIPMENT_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {SHIPMENT_STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44">
            <SelectValue placeholder="Phương thức" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả phương thức</SelectItem>
            {SHIPMENT_METHOD_ORDER.map((m) => (
              <SelectItem key={m} value={m}>
                {SHIPMENT_METHOD_META[m].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Loại nơi nhận" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả nơi nhận</SelectItem>
            <SelectItem value="outgoing_office">Giữa các văn phòng</SelectItem>
            <SelectItem value="external">Đơn vị bên ngoài</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-muted-foreground"
          >
            <Filter className="h-3.5 w-3.5" /> Xoá lọc
          </Button>
        )}

        <Button
          onClick={() => setCreateOpen(true)}
          className="ml-auto w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Tạo chuyến
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "confirm" | "in_transit" | "all")}
      >
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="confirm" className="gap-1.5">
            <span>Cần tôi xác nhận</span>
            {myConfirmations.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                {myConfirmations.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="in_transit" className="gap-1.5">
            <span>Đang vận chuyển</span>
            {inTransitShipments.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-foreground/20 px-1.5 text-[11px] font-semibold text-foreground">
                {inTransitShipments.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5">
            <span>Tất cả</span>
            <span className="text-xs text-muted-foreground">
              ({filteredAll.length})
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="confirm">
          {confirmLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredConfirmations.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? "Không có chuyến cần xác nhận nào khớp bộ lọc."
                  : "Không có chuyến vận chuyển nào đang chờ bạn xác nhận."
              }
            />
          ) : (
            <ShipmentsListView
              shipments={filteredConfirmations}
              officeById={officeById}
              externalUnitById={externalUnitById}
              nameOf={nameOf}
              avatarOf={avatarOf}
            />
          )}
        </TabsContent>

        <TabsContent value="in_transit">
          {shipmentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : inTransitShipments.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? "Không có chuyến đang vận chuyển nào khớp bộ lọc."
                  : "Hiện không có chuyến nào đang trên đường vận chuyển."
              }
            />
          ) : (
            <ShipmentsListView
              shipments={inTransitShipments}
              officeById={officeById}
              externalUnitById={externalUnitById}
              nameOf={nameOf}
              avatarOf={avatarOf}
            />
          )}
        </TabsContent>

        <TabsContent value="all">
          {shipmentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredAll.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? "Không tìm thấy chuyến vận chuyển nào khớp bộ lọc."
                  : "Chưa có chuyến vận chuyển nào. Bấm Tạo chuyến để bắt đầu."
              }
            />
          ) : (
            <ShipmentsListView
              shipments={filteredAll}
              officeById={officeById}
              externalUnitById={externalUnitById}
              nameOf={nameOf}
              avatarOf={avatarOf}
            />
          )}
        </TabsContent>
      </Tabs>

      <ShipmentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        navigateOnCreate
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed py-14 text-center">
      <Truck className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function ShipmentsListView({
  shipments,
  officeById,
  externalUnitById,
  nameOf,
  avatarOf,
}: {
  shipments: DocumentShipment[];
  officeById: Map<string, Office>;
  externalUnitById: Map<string, ExternalUnit>;
  nameOf: (id: string | null) => string | null;
  avatarOf: (id: string | null) => string | null;
}) {
  return (
    <>
      {/* Mobile cards */}
      <div className="divide-y rounded-lg border bg-background md:hidden">
        {shipments.map((s) => {
          const statusMeta = shipmentStatusMeta(s);
          const methodMeta = SHIPMENT_METHOD_META[s.method];
          const fromOffice = officeById.get(s.from_office_id);
          const toOffice = s.to_office_id
            ? officeById.get(s.to_office_id)
            : undefined;
          const toExternal = s.to_external_unit_id
            ? externalUnitById.get(s.to_external_unit_id)
            : undefined;
          const senderName = nameOf(s.sent_by) ?? "—";
          const senderAvatar = avatarOf(s.sent_by);

          return (
            <Link
              key={s.id}
              href={`/documents/shipments/${s.id}`}
              className="block space-y-2.5 p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold text-primary">
                    {s.code}
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
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                      methodMeta.badge,
                    )}
                  >
                    {methodMeta.label}
                  </span>
                </div>
                {s.status === "in_transit" && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Clock className="h-3.5 w-3.5" />
                    {daysInTransitLabel(s.sent_at)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {fromOffice ? fromOffice.code : "—"}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                {toOffice ? (
                  <span>
                    {toOffice.code} ({toOffice.name})
                  </span>
                ) : (
                  <span>{toExternal?.name ?? "Đơn vị bên ngoài"}</span>
                )}
              </div>

              {(s.carrier || s.tracking_no || s.driver_note) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    s.carrier,
                    s.tracking_no ? `Mã vận đơn: ${s.tracking_no}` : null,
                    s.driver_note,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Avatar className="h-4 w-4">
                    {senderAvatar && (
                      <AvatarImage src={senderAvatar} alt={senderName} />
                    )}
                    <AvatarFallback className="text-[9px]">
                      {initials(senderName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-foreground">{senderName}</span>
                </span>
                <span>· Gửi lúc {formatDateTime(s.sent_at)}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Mã chuyến</th>
              <th className="px-4 py-2.5 text-left font-medium">Trạng thái</th>
              <th className="px-4 py-2.5 text-left font-medium">
                Nơi gửi → Nơi nhận
              </th>
              <th className="px-4 py-2.5 text-left font-medium">
                Phương thức &amp; Vận đơn
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Người gửi</th>
              <th className="px-4 py-2.5 text-left font-medium">
                Thời gian gửi
              </th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => {
              const statusMeta = shipmentStatusMeta(s);
              const methodMeta = SHIPMENT_METHOD_META[s.method];
              const fromOffice = officeById.get(s.from_office_id);
              const toOffice = s.to_office_id
                ? officeById.get(s.to_office_id)
                : undefined;
              const toExternal = s.to_external_unit_id
                ? externalUnitById.get(s.to_external_unit_id)
                : undefined;
              const senderName = nameOf(s.sent_by) ?? "—";
              const senderAvatar = avatarOf(s.sent_by);

              return (
                <tr
                  key={s.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">
                    <Link
                      href={`/documents/shipments/${s.id}`}
                      className="text-primary hover:underline"
                    >
                      {s.code}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
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
                      {s.status === "in_transit" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                          <Clock className="h-3 w-3" />
                          {daysInTransitLabel(s.sent_at)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="font-normal">
                        {fromOffice?.code ?? "—"}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      {toOffice ? (
                        <Badge variant="secondary" className="font-normal">
                          {toOffice.code} — {toOffice.name}
                        </Badge>
                      ) : (
                        <span className="font-medium">
                          {toExternal?.name ?? "Đơn vị bên ngoài"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                          methodMeta.badge,
                        )}
                      >
                        {methodMeta.label}
                      </span>
                      {(s.carrier || s.tracking_no || s.driver_note) && (
                        <p className="text-xs text-muted-foreground">
                          {[
                            s.carrier,
                            s.tracking_no ? `Mã: ${s.tracking_no}` : null,
                            s.driver_note,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        {senderAvatar && (
                          <AvatarImage src={senderAvatar} alt={senderName} />
                        )}
                        <AvatarFallback className="text-[10px]">
                          {initials(senderName)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{senderName}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    <div>{formatDateTime(s.sent_at)}</div>
                    {s.completed_at && (
                      <div className="text-[11px]">
                        Hoàn tất: {formatDateTime(s.completed_at)}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/documents/shipments/${s.id}`}
                      className="inline-flex items-center text-muted-foreground hover:text-foreground"
                      title="Xem chi tiết chuyến"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
