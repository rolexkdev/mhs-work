"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  useUploadDocumentAttachment,
  useDeleteDocumentAttachment,
  getDocumentAttachmentUrl,
} from "@/modules/documents/attachment-hooks";
import type { DocumentAttachment } from "@/types/database";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const isImageFile = (name: string) => IMAGE_RE.test(name);

export function ProofThumbnail({ attachment }: { attachment: DocumentAttachment }) {
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

export function AttachmentsCard({
  documentId,
  attachments,
  currentUserId,
  canManage,
  nameOf,
}: {
  documentId: string;
  attachments: DocumentAttachment[];
  currentUserId: string | null;
  canManage: boolean;
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
    <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            Tệp đính kèm ({attachments.length})
          </h2>
          {canManage && (
            <>
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
            </>
          )}
        </div>

        {images.length > 0 && (
          <div className="space-y-2">
            {images.map((att) => {
              const canDelete =
                (!!currentUserId && att.uploaded_by === currentUserId) ||
                canManage;
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
                canManage;
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
    </div>
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
