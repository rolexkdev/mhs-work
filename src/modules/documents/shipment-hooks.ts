"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  queryKeys,
  type ShipmentDirectionFilter,
  type ShipmentQueryFilters,
} from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import type {
  DocumentRecord,
  DocumentShipment,
  DocumentShipmentItem,
  ShipmentMethod,
} from "@/types/database";

export type { ShipmentDirectionFilter, ShipmentQueryFilters };

export type ShipmentItemWithDocument = DocumentShipmentItem & {
  document: DocumentRecord | null;
};

export type DocumentShipmentHistoryItem = DocumentShipmentItem & {
  shipment: DocumentShipment;
};

function invalidateShipmentAndDocumentCaches(
  qc: QueryClient,
  opts: {
    shipmentId?: string | null;
    documentIds?: string[];
  } = {},
) {
  qc.invalidateQueries({ queryKey: queryKeys.shipmentsAll });
  qc.invalidateQueries({ queryKey: queryKeys.myShipmentConfirmations });
  qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
  qc.invalidateQueries({ queryKey: queryKeys.myPendingHandoffs });
  qc.invalidateQueries({ queryKey: queryKeys.documentsWithPendingHandoffs });
  qc.invalidateQueries({ queryKey: queryKeys.documentHoldersAll });
  qc.invalidateQueries({ queryKey: queryKeys.shipmentItemsAll });
  qc.invalidateQueries({ queryKey: queryKeys.documentShipmentsAll });

  if (opts.shipmentId) {
    qc.invalidateQueries({ queryKey: queryKeys.shipment(opts.shipmentId) });
    qc.invalidateQueries({
      queryKey: queryKeys.shipmentItems(opts.shipmentId),
    });
    qc.invalidateQueries({
      queryKey: queryKeys.shipmentAttachments(opts.shipmentId),
    });
  }

  for (const docId of opts.documentIds ?? []) {
    qc.invalidateQueries({ queryKey: queryKeys.document(docId) });
    qc.invalidateQueries({ queryKey: queryKeys.documentLogs(docId) });
    qc.invalidateQueries({ queryKey: queryKeys.documentHolders(docId) });
    qc.invalidateQueries({ queryKey: queryKeys.documentHandoffs(docId) });
    qc.invalidateQueries({ queryKey: queryKeys.documentShipments(docId) });
  }
}

export function useShipments(filters: ShipmentQueryFilters = {}) {
  return useQuery({
    queryKey: queryKeys.shipments(filters),
    queryFn: async (): Promise<DocumentShipment[]> => {
      const supabase = createClient();

      let currentUserId: string | null = null;
      if (filters.mine) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];
        currentUserId = user.id;
      }

      let q = supabase.from("document_shipments").select("*");

      if (filters.status) {
        q = q.eq("status", filters.status);
      }
      if (filters.method) {
        q = q.eq("method", filters.method);
      }
      if (filters.direction === "outgoing_office") {
        q = q.not("to_office_id", "is", null);
      } else if (filters.direction === "external") {
        q = q.not("to_external_unit_id", "is", null);
      }
      if (filters.mine && currentUserId) {
        q = q.eq("sent_by", currentUserId);
      }

      const { data, error } = await q.order("sent_at", { ascending: false });
      if (error) throw error;

      let rows = data ?? [];
      if (filters.search && filters.search.trim()) {
        const needle = filters.search.trim().toLowerCase();
        rows = rows.filter(
          (s) =>
            s.code.toLowerCase().includes(needle) ||
            (s.tracking_no ?? "").toLowerCase().includes(needle) ||
            (s.carrier ?? "").toLowerCase().includes(needle) ||
            (s.driver_note ?? "").toLowerCase().includes(needle),
        );
      }
      return rows;
    },
  });
}

export function useShipment(id: string | null) {
  return useQuery({
    queryKey: queryKeys.shipment(id ?? ""),
    queryFn: async (): Promise<DocumentShipment | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_shipments")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useShipmentItems(shipmentId: string | null) {
  return useQuery({
    queryKey: queryKeys.shipmentItems(shipmentId ?? ""),
    queryFn: async (): Promise<ShipmentItemWithDocument[]> => {
      const supabase = createClient();
      const { data: items, error } = await supabase
        .from("document_shipment_items")
        .select("*")
        .eq("shipment_id", shipmentId!);
      if (error) throw error;
      if (!items || items.length === 0) return [];

      const docIds = Array.from(new Set(items.map((i) => i.document_id)));
      const { data: docs, error: docErr } = await supabase
        .from("documents")
        .select("*")
        .in("id", docIds);
      if (docErr) throw docErr;

      const docById = new Map((docs ?? []).map((d) => [d.id, d]));
      return items.map((item) => ({
        ...item,
        document: docById.get(item.document_id) ?? null,
      }));
    },
    enabled: !!shipmentId,
  });
}

export function useDocumentShipments(documentId: string | null) {
  return useQuery({
    queryKey: queryKeys.documentShipments(documentId ?? ""),
    queryFn: async (): Promise<DocumentShipmentHistoryItem[]> => {
      const supabase = createClient();
      const { data: items, error } = await supabase
        .from("document_shipment_items")
        .select("*")
        .eq("document_id", documentId!);
      if (error) throw error;
      if (!items || items.length === 0) return [];

      const shipmentIds = Array.from(new Set(items.map((i) => i.shipment_id)));
      const { data: shipments, error: shipErr } = await supabase
        .from("document_shipments")
        .select("*")
        .in("id", shipmentIds)
        .order("sent_at", { ascending: false });
      if (shipErr) throw shipErr;

      const shipmentById = new Map((shipments ?? []).map((s) => [s.id, s]));
      const result: DocumentShipmentHistoryItem[] = [];
      for (const item of items) {
        const shipment = shipmentById.get(item.shipment_id);
        if (shipment) {
          result.push({ ...item, shipment });
        }
      }
      result.sort(
        (a, b) =>
          new Date(b.shipment.sent_at).getTime() -
          new Date(a.shipment.sent_at).getTime(),
      );
      return result;
    },
    enabled: !!documentId,
  });
}

/**
 * Open shipments that the current user is responsible for confirming:
 * - open shipments addressed to the user's office (`to_office_id = myProfile.office_id`), or
 * - open external shipments sent by the user (`to_external_unit_id is not null and sent_by = me`).
 */
export function useMyShipmentConfirmations() {
  return useQuery({
    queryKey: queryKeys.myShipmentConfirmations,
    queryFn: async (): Promise<DocumentShipment[]> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: profile } = await supabase
        .from("profiles")
        .select("office_id")
        .eq("id", user.id)
        .maybeSingle();

      const myOfficeId = profile?.office_id ?? null;

      const { data: openShipments, error } = await supabase
        .from("document_shipments")
        .select("*")
        .eq("status", "in_transit")
        .order("sent_at", { ascending: true });
      if (error) throw error;

      return (openShipments ?? []).filter((s) => {
        if (s.to_office_id && myOfficeId && s.to_office_id === myOfficeId) {
          return true;
        }
        if (s.to_external_unit_id && s.sent_by === user.id) {
          return true;
        }
        return false;
      });
    },
  });
}

export interface CreateShipmentInput {
  documentIds: string[];
  method: ShipmentMethod;
  toOfficeId?: string | null;
  toExternalUnitId?: string | null;
  carrier?: string | null;
  trackingNo?: string | null;
  driverNote?: string | null;
  note?: string | null;
  fromOfficeId?: string | null;
}

export function useCreateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateShipmentInput,
    ): Promise<DocumentShipment> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_shipment", {
        p_document_ids: input.documentIds,
        p_method: input.method,
        p_to_office_id: input.toOfficeId ?? null,
        p_to_external_unit_id: input.toExternalUnitId ?? null,
        p_carrier: input.carrier?.trim() || null,
        p_tracking_no: input.trackingNo?.trim() || null,
        p_driver_note: input.driverNote?.trim() || null,
        p_note: input.note?.trim() || null,
        p_from_office_id: input.fromOfficeId ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (shipment, vars) => {
      invalidateShipmentAndDocumentCaches(qc, {
        shipmentId: shipment.id,
        documentIds: vars.documentIds,
      });
      toast.success(`Đã tạo chuyến vận chuyển ${shipment.code}`);
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export interface ConfirmShipmentItemsInput {
  shipmentId: string;
  documentIds: string[];
  recipientName?: string | null;
  note?: string | null;
}

export function useConfirmShipmentItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: ConfirmShipmentItemsInput,
    ): Promise<DocumentShipment> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("confirm_shipment_items", {
        p_shipment_id: input.shipmentId,
        p_document_ids: input.documentIds,
        p_recipient_name: input.recipientName?.trim() || null,
        p_note: input.note?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (shipment, vars) => {
      invalidateShipmentAndDocumentCaches(qc, {
        shipmentId: shipment.id,
        documentIds: vars.documentIds,
      });
      toast.success(
        shipment.to_external_unit_id
          ? "Đã xác nhận giao hồ sơ cho đơn vị nhận"
          : "Đã xác nhận hồ sơ đến văn phòng",
      );
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export interface MarkDocumentLostInput {
  documentId: string;
  reason: string;
  shipmentId?: string | null;
}

export function useMarkDocumentLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: MarkDocumentLostInput,
    ): Promise<DocumentRecord> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("mark_document_lost", {
        p_document_id: input.documentId,
        p_reason: input.reason.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (doc, vars) => {
      invalidateShipmentAndDocumentCaches(qc, {
        shipmentId: vars.shipmentId ?? null,
        documentIds: Array.from(
          new Set([vars.documentId, doc?.id].filter(Boolean)),
        ),
      });
      toast.success("Đã ghi nhận hồ sơ thất lạc");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export interface CancelShipmentInput {
  shipmentId: string;
  note?: string | null;
  documentIds: string[];
}

export function useCancelShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CancelShipmentInput,
    ): Promise<DocumentShipment> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("cancel_shipment", {
        p_shipment_id: input.shipmentId,
        p_note: input.note?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (shipment, vars) => {
      invalidateShipmentAndDocumentCaches(qc, {
        shipmentId: shipment.id,
        documentIds: vars.documentIds,
      });
      toast.success("Đã huỷ chuyến vận chuyển");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
