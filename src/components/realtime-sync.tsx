"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

type ChangeRow = {
  id?: string;
  task_id?: string;
  document_id?: string | null;
  shipment_id?: string | null;
} | null;

/**
 * Đồng bộ realtime: lắng nghe thay đổi từ Supabase và làm mới cache react-query
 * → khi 1 người cập nhật, mọi máy khác tự cập nhật theo.
 * Mount 1 lần trong khu vực đã đăng nhập (AppShell).
 */
export function RealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const supabase = createClient();

    const taskIdFrom = (payload: { new: ChangeRow; old: ChangeRow }) =>
      payload.new?.task_id ?? payload.old?.task_id ?? null;

    const documentIdFrom = (payload: { new: ChangeRow; old: ChangeRow }) =>
      payload.new?.document_id ?? payload.old?.document_id ?? null;

    const shipmentIdFrom = (payload: { new: ChangeRow; old: ChangeRow }) =>
      payload.new?.shipment_id ?? payload.old?.shipment_id ?? null;

    const rowIdFrom = (payload: { new: ChangeRow; old: ChangeRow }) =>
      payload.new?.id ?? payload.old?.id ?? null;

    const channel = supabase
      .channel("realtime-app")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
          qc.invalidateQueries({ queryKey: ["task-logs"] }); // task đổi → có log mới
          qc.invalidateQueries({ queryKey: ["daily-updates"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings" },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.meetings });
          qc.invalidateQueries({ queryKey: ["meeting-task-counts"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_items" },
        () => qc.invalidateQueries({ queryKey: ["meeting-items"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments" },
        (payload) => {
          const id = taskIdFrom(payload);
          if (id) qc.invalidateQueries({ queryKey: ["comments", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_checklists" },
        (payload) => {
          const id = taskIdFrom(payload);
          if (id) qc.invalidateQueries({ queryKey: ["checklists", id] });
          qc.invalidateQueries({ queryKey: ["tasks"] }); // checklist đổi → progress đổi
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_attachments" },
        (payload) => {
          const id = taskIdFrom(payload);
          if (id) qc.invalidateQueries({ queryKey: ["attachments", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        (payload) => {
          const id = rowIdFrom(payload);
          qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
          qc.invalidateQueries({ queryKey: queryKeys.myPendingHandoffs });
          qc.invalidateQueries({
            queryKey: queryKeys.documentsWithPendingHandoffs,
          });
          qc.invalidateQueries({ queryKey: queryKeys.documentHoldersAll });
          if (id) {
            qc.invalidateQueries({ queryKey: queryKeys.document(id) });
            qc.invalidateQueries({ queryKey: queryKeys.documentHolders(id) });
            qc.invalidateQueries({ queryKey: queryKeys.documentLogs(id) });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_handoffs" },
        (payload) => {
          const docId = documentIdFrom(payload);
          qc.invalidateQueries({ queryKey: queryKeys.myPendingHandoffs });
          qc.invalidateQueries({
            queryKey: queryKeys.documentsWithPendingHandoffs,
          });
          qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
          qc.invalidateQueries({ queryKey: queryKeys.documentHoldersAll });
          if (docId) {
            qc.invalidateQueries({
              queryKey: queryKeys.documentHandoffs(docId),
            });
            qc.invalidateQueries({
              queryKey: queryKeys.documentHolders(docId),
            });
            qc.invalidateQueries({ queryKey: queryKeys.document(docId) });
            qc.invalidateQueries({ queryKey: queryKeys.documentLogs(docId) });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_attachments" },
        (payload) => {
          const docId = documentIdFrom(payload);
          const shipId = shipmentIdFrom(payload);
          if (docId) {
            qc.invalidateQueries({
              queryKey: queryKeys.documentAttachments(docId),
            });
          }
          if (shipId) {
            qc.invalidateQueries({
              queryKey: queryKeys.shipmentAttachments(shipId),
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_shipments" },
        (payload) => {
          const id = rowIdFrom(payload);
          qc.invalidateQueries({ queryKey: queryKeys.shipmentsAll });
          qc.invalidateQueries({
            queryKey: queryKeys.myShipmentConfirmations,
          });
          if (id) {
            qc.invalidateQueries({ queryKey: queryKeys.shipment(id) });
            qc.invalidateQueries({ queryKey: queryKeys.shipmentItems(id) });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_shipment_items" },
        (payload) => {
          const shipId = shipmentIdFrom(payload);
          const docId = documentIdFrom(payload);
          qc.invalidateQueries({ queryKey: queryKeys.shipmentsAll });
          qc.invalidateQueries({
            queryKey: queryKeys.myShipmentConfirmations,
          });
          qc.invalidateQueries({ queryKey: queryKeys.documentsAll });
          if (shipId) {
            qc.invalidateQueries({ queryKey: queryKeys.shipment(shipId) });
            qc.invalidateQueries({ queryKey: queryKeys.shipmentItems(shipId) });
          }
          if (docId) {
            qc.invalidateQueries({ queryKey: queryKeys.document(docId) });
            qc.invalidateQueries({
              queryKey: queryKeys.documentShipments(docId),
            });
            qc.invalidateQueries({ queryKey: queryKeys.documentLogs(docId) });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "external_units" },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.externalUnitsAll });
        },
      );

    // Join with the user's JWT, not the anon key: every table policy is
    // `to authenticated`, so an anon join gets SUBSCRIBED but no events.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });

    // Keep the socket's token fresh after the hourly refresh.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) supabase.realtime.setAuth(session.access_token);
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return null;
}
