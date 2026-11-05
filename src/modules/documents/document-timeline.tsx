"use client";

import { useMemo } from "react";
import { ArrowRight, Check, History, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_PRIORITY_META,
  DOCUMENT_STATUS_META,
  HANDOFF_KIND_META,
  HANDOFF_STATUS_META,
} from "@/modules/documents/constants";
import { ProofThumbnail } from "@/modules/documents/document-attachments";
import type {
  DocumentAttachment,
  DocumentHandoff,
  DocumentLog,
  DocumentStatus,
  TaskPriority,
} from "@/types/database";

const HANDOFF_LOG_ACTIONS = new Set([
  "handoff_created",
  "handoff_accepted",
  "handoff_rejected",
  "handoff_cancelled",
]);

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

export function TimelineSection({
  handoffs,
  logs,
  attachments,
  currentUserId,
  canManage,
  nameOf,
  avatarOf,
  onRespond,
  onCancel,
}: {
  handoffs: DocumentHandoff[];
  logs: DocumentLog[];
  attachments: DocumentAttachment[];
  currentUserId: string | null;
  canManage: boolean;
  nameOf: (id: string | null | undefined) => string | null;
  avatarOf: (id: string | null | undefined) => string | null;
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
    <div className="space-y-4">
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
                    canManage);

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
    </div>
  );
}

function describeDocumentLog(
  log: DocumentLog,
  nameOf: (id: string | null | undefined) => string | null,
): React.ReactNode {
  const oldV = log.old_value;
  const newV = log.new_value;
  const statusLabel = (v: unknown) =>
    typeof v === "string"
      ? (DOCUMENT_STATUS_META[v as DocumentStatus]?.label ?? v)
      : "—";
  const personLabel = (v: unknown) =>
    typeof v === "string" ? (nameOf(v) ?? "—") : "trống";
  const priorityLabel = (v: unknown) =>
    typeof v === "string"
      ? (DOCUMENT_PRIORITY_META[v as TaskPriority]?.label ?? v)
      : "—";

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
    case "intended_recipient_id":
      return (
        <>
          đổi người nhận dự kiến{" "}
          <span className="font-medium text-foreground">
            {personLabel(oldV)}
          </span>{" "}
          →{" "}
          <span className="font-medium text-foreground">
            {personLabel(newV)}
          </span>
        </>
      );
    case "category":
      return (
        <>
          đổi loại hồ sơ thành{" "}
          <span className="font-medium text-foreground">
            {typeof newV === "string" && newV ? newV : "trống"}
          </span>
        </>
      );
    case "priority":
      return (
        <>
          đổi ưu tiên{" "}
          <span className="font-medium text-foreground">
            {priorityLabel(oldV)}
          </span>{" "}
          →{" "}
          <span className="font-medium text-foreground">
            {priorityLabel(newV)}
          </span>
        </>
      );
    case "quantity":
      return (
        <>
          đổi số lượng{" "}
          <span className="font-medium text-foreground">{String(oldV ?? "—")}</span>{" "}
          →{" "}
          <span className="font-medium text-foreground">{String(newV ?? "—")}</span>
        </>
      );
    case "received_at":
      return (
        <>
          đổi ngày tiếp nhận thành{" "}
          <span className="font-medium text-foreground">
            {typeof newV === "string" ? formatDate(newV) : "—"}
          </span>
        </>
      );
    default:
      return <>cập nhật hồ sơ</>;
  }
}

