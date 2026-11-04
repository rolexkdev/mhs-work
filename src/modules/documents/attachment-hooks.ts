"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import type { DocumentAttachment } from "@/types/database";

const BUCKET = "document-files";

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_");
}

export function useDocumentAttachments(documentId: string | null) {
  return useQuery({
    queryKey: queryKeys.documentAttachments(documentId ?? ""),
    queryFn: async (): Promise<DocumentAttachment[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_attachments")
        .select("*")
        .eq("document_id", documentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!documentId,
  });
}

export function useShipmentAttachments(shipmentId: string | null) {
  return useQuery({
    queryKey: queryKeys.shipmentAttachments(shipmentId ?? ""),
    queryFn: async (): Promise<DocumentAttachment[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_attachments")
        .select("*")
        .eq("shipment_id", shipmentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!shipmentId,
  });
}

export interface UploadDocumentAttachmentInput {
  documentId: string;
  file: File;
  handoffId?: string | null;
  shipmentId?: string | null;
}

export async function uploadDocumentFile({
  documentId,
  file,
  handoffId = null,
  shipmentId = null,
}: UploadDocumentAttachmentInput): Promise<DocumentAttachment> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Chưa đăng nhập");

  const safeName = sanitizeFileName(file.name);
  const path = `${documentId}/${generateUuid()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file);
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("document_attachments")
    .insert({
      document_id: documentId,
      handoff_id: handoffId ?? null,
      shipment_id: shipmentId ?? null,
      file_name: file.name,
      file_url: path,
      uploaded_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export interface UploadShipmentAttachmentInput {
  shipmentId: string;
  file: File;
  documentId?: string | null;
}

export async function uploadShipmentFile({
  shipmentId,
  file,
  documentId = null,
}: UploadShipmentAttachmentInput): Promise<DocumentAttachment> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Chưa đăng nhập");

  const safeName = sanitizeFileName(file.name);
  const path = `shipments/${shipmentId}/${generateUuid()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file);
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("document_attachments")
    .insert({
      document_id: documentId ?? null,
      shipment_id: shipmentId,
      file_name: file.name,
      file_url: path,
      uploaded_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function useUploadDocumentAttachment(documentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | File
        | { file: File; handoffId?: string | null; documentId?: string },
    ): Promise<DocumentAttachment> => {
      const resolved =
        input instanceof File
          ? { file: input, handoffId: null, documentId }
          : {
              file: input.file,
              handoffId: input.handoffId ?? null,
              documentId: input.documentId ?? documentId,
            };
      if (!resolved.documentId) {
        throw new Error("Thiếu mã hồ sơ để tải tệp lên.");
      }
      return uploadDocumentFile({
        documentId: resolved.documentId,
        file: resolved.file,
        handoffId: resolved.handoffId,
      });
    },
    onSuccess: (att) => {
      const targetDocId = att.document_id ?? documentId;
      if (targetDocId) {
        qc.invalidateQueries({
          queryKey: queryKeys.documentAttachments(targetDocId),
        });
      }
      if (att.shipment_id) {
        qc.invalidateQueries({
          queryKey: queryKeys.shipmentAttachments(att.shipment_id),
        });
      }
      toast.success("Đã tải lên tệp đính kèm");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useUploadShipmentAttachment(shipmentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | File
        | { file: File; shipmentId?: string; documentId?: string | null },
    ): Promise<DocumentAttachment> => {
      const resolved =
        input instanceof File
          ? { file: input, shipmentId, documentId: null }
          : {
              file: input.file,
              shipmentId: input.shipmentId ?? shipmentId,
              documentId: input.documentId ?? null,
            };
      if (!resolved.shipmentId) {
        throw new Error("Thiếu mã chuyến gửi để tải tệp lên.");
      }
      return uploadShipmentFile({
        shipmentId: resolved.shipmentId,
        file: resolved.file,
        documentId: resolved.documentId,
      });
    },
    onSuccess: (att) => {
      const targetShipmentId = att.shipment_id ?? shipmentId;
      if (targetShipmentId) {
        qc.invalidateQueries({
          queryKey: queryKeys.shipmentAttachments(targetShipmentId),
        });
      }
      if (att.document_id) {
        qc.invalidateQueries({
          queryKey: queryKeys.documentAttachments(att.document_id),
        });
      }
      toast.success("Đã tải lên ảnh / tệp đính kèm");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useDeleteDocumentAttachment(
  documentId?: string,
  shipmentId?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (att: DocumentAttachment) => {
      const supabase = createClient();
      await supabase.storage.from(BUCKET).remove([att.file_url]);
      const { error } = await supabase
        .from("document_attachments")
        .delete()
        .eq("id", att.id);
      if (error) throw error;
      return att;
    },
    onSuccess: (att) => {
      const targetDocId = att.document_id || documentId;
      if (targetDocId) {
        qc.invalidateQueries({
          queryKey: queryKeys.documentAttachments(targetDocId),
        });
      }
      const targetShipmentId = att.shipment_id || shipmentId;
      if (targetShipmentId) {
        qc.invalidateQueries({
          queryKey: queryKeys.shipmentAttachments(targetShipmentId),
        });
      }
      toast.success("Đã xoá tệp đính kèm");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useDeleteShipmentAttachment(shipmentId?: string) {
  return useDeleteDocumentAttachment(undefined, shipmentId);
}

/** Generate a temporary signed URL to view or download a file from the private bucket. */
export async function getDocumentAttachmentUrl(
  path: string,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
