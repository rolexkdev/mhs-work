"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Forward,
  HandHelping,
  Inbox,
  Loader2,
  Pencil,
  RotateCcw,
  Send,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DOCUMENT_STATUS_BADGE,
  documentStatus,
} from "@/modules/documents/status";
import {
  DocumentActionDialog,
  DOCUMENT_ACTION_LABEL,
} from "@/modules/documents/components/document-action-dialog";
import { DocumentStepper } from "@/modules/documents/components/document-stepper";
import { DocumentRouteEditor } from "@/modules/documents/components/document-route-editor";
import {
  useCanManageDocuments,
  useDocumentEvents,
  useUndoDocumentAction,
  type DocumentActionKey,
} from "@/modules/documents/hooks";
import {
  DEPARTMENTS,
  TAG_COLOR_CLASS,
  colorOf,
} from "@/modules/tasks/constants";
import type {
  DocumentEvent,
  DocumentEventAction,
  DocumentWithSteps,
} from "@/types/database";

/** Icon cho từng nút thao tác tiến trình. */
const ACTION_ICON: Record<DocumentActionKey, React.ElementType> = {
  send: Send,
  forward: Forward,
  return: Undo2,
  resend: RotateCcw,
  finish_early: CheckCircle2,
  receive_back: Inbox,
  hand_over: HandHelping,
  sender_confirm: CheckCircle2,
};

const ACTION_LABEL: Record<DocumentEventAction, string> = {
  created: "Tạo hồ sơ",
  edit: "Sửa thông tin",
  route: "Cập nhật lộ trình",
  send: "Gửi đi",
  forward: "Đã xử lý, chuyển tiếp",
  return: "Trả lại",
  resend: "Gửi lại",
  finish_early: "Kết thúc sớm",
  undo: "Hoàn tác",
  receive_back: "Nhận lại hồ sơ",
  hand_over: "Bàn giao người gửi",
  sender_confirm: "Người gửi đã nhận",
};

/** Màu chấm mốc thời gian, cùng bảng màu trạng thái của /tasks. */
const ACTION_DOT: Record<DocumentEventAction, string> = {
  created: "bg-slate-400",
  edit: "bg-slate-400",
  route: "bg-slate-400",
  send: "bg-blue-500",
  forward: "bg-emerald-500",
  return: "bg-orange-500",
  resend: "bg-blue-500",
  finish_early: "bg-emerald-500",
  undo: "bg-muted-foreground/40",
  receive_back: "bg-violet-500",
  hand_over: "bg-violet-500",
  sender_confirm: "bg-emerald-500",
};

function payloadOf(event: DocumentEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object"
    ? (event.payload as Record<string, unknown>)
    : {};
}

/** Nhãn tiếng Việt của một mốc, xử lý riêng forward và undo. */
function eventTitle(event: DocumentEvent): string {
  const payload = payloadOf(event);

  if (event.action === "forward") {
    return payload.finished === true
      ? "Hoàn thành"
      : ACTION_LABEL.forward;
  }

  if (event.action === "undo") {
    const undone = payload.action;
    return `Hoàn tác: ${
      typeof undone === "string" && undone in ACTION_LABEL
        ? ACTION_LABEL[undone as DocumentEventAction]
        : "thao tác"
    }`;
  }

  return ACTION_LABEL[event.action];
}

/** Thao tác tiến trình có thể hoàn tác (khớp doc_undo trong 0018). */
const UNDOABLE_ACTIONS: DocumentEventAction[] = [
  "send",
  "forward",
  "return",
  "resend",
  "finish_early",
];

/**
 * Event mới nhất còn hoàn tác được: đúng thứ tự doc_undo chọn (created_at
 * giảm dần, rồi id) và bỏ qua event đã bị một event undo trỏ tới.
 */
function latestUndoableEvent(events: DocumentEvent[]): DocumentEvent | null {
  const undoneIds = new Set(
    events.map((event) => event.undo_of).filter((id): id is string => !!id),
  );

  let latest: DocumentEvent | null = null;
  for (const event of events) {
    if (!UNDOABLE_ACTIONS.includes(event.action) || undoneIds.has(event.id)) {
      continue;
    }
    if (
      !latest ||
      event.created_at > latest.created_at ||
      (event.created_at === latest.created_at && event.id > latest.id)
    ) {
      latest = event;
    }
  }

  return latest;
}

/**
 * Tấm trượt bên phải: thông tin hồ sơ, lộ trình, nút thao tác tiến trình
 * (chỉ quản lý hồ sơ) và toàn bộ lịch sử xử lý.
 */
export function DocumentDetailPanel({
  document,
  open,
  onOpenChange,
}: {
  document: DocumentWithSteps | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: events = [], isLoading: eventsLoading } = useDocumentEvents(
    document?.id ?? null,
  );
  const canManage = useCanManageDocuments();
  const undoAction = useUndoDocumentAction();
  // The step id is pinned when the dialog opens: if the list refetches while
  // it is open (another manager acted, realtime), the RPC must still see the
  // step the user looked at so it can reject the stale call.
  const [action, setAction] = useState<{
    key: DocumentActionKey;
    stepId: string | null;
  } | null>(null);
  // Same pinning for undo: the event the user confirmed, not whatever is
  // latest after a refetch.
  const [undoTarget, setUndoTarget] = useState<{
    eventId: string;
    label: string;
  } | null>(null);
  const [routeEditorOpen, setRouteEditorOpen] = useState(false);

  const status = document ? documentStatus(document) : null;
  const senderName =
    document?.sender?.full_name ?? document?.sender?.email ?? "—";

  const currentStep = document
    ? [...document.steps]
        .sort((a, b) => a.step_order - b.step_order)
        .find((step) => !step.done_at) ?? null
    : null;

  // Chỉ hiện thao tác hợp lệ với trạng thái hiện tại; Hoàn thành không có nút.
  const actions: DocumentActionKey[] = !status
    ? []
    : status.status === "pending"
      ? ["send"]
      : status.status === "in_progress"
        ? ["forward", "return", "finish_early"]
        : status.status === "returned"
          ? ["resend", "finish_early"]
          : [];

  const showActions = canManage && actions.length > 0;

  // Event bị hoàn tác: một event khác có undo_of trỏ tới nó.
  const undoneIds = new Set(
    events.map((event) => event.undo_of).filter((id): id is string => !!id),
  );
  const undoableEvent = latestUndoableEvent(events);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setAction(null);
          setUndoTarget(null);
          setRouteEditorOpen(false);
        }
        onOpenChange(v);
      }}
    >
      <SheetContent className="overflow-y-auto p-0">
        {!document || !status ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Header — chừa 3rem bên phải cho nút đóng của tấm trượt */}
            <div className="space-y-2 border-b px-4 py-4 pr-12 sm:px-5">
              <SheetTitle className="text-lg leading-snug">
                {document.name}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    DOCUMENT_STATUS_BADGE[status.status],
                  )}
                >
                  {status.label}
                </span>
                {status.holder && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      TAG_COLOR_CLASS[colorOf(DEPARTMENTS, status.holder)],
                    )}
                  >
                    Đang giữ: {status.holder}
                  </span>
                )}
              </div>
            </div>

            {canManage && (showActions || !!undoableEvent) && (
              <div className="space-y-2 border-b px-4 py-3 sm:px-5">
                {showActions && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {actions.map((key) => {
                        const Icon = ACTION_ICON[key];
                        const disabled =
                          key === "send"
                            ? document.steps.length === 0
                            : !currentStep;
                        return (
                          <Button
                            key={key}
                            size="sm"
                            variant={
                              key === "send" || key === "forward"
                                ? "default"
                                : "outline"
                            }
                            disabled={disabled}
                            onClick={() =>
                              setAction({ key, stepId: currentStep?.id ?? null })
                            }
                          >
                            <Icon className="h-4 w-4" />
                            {DOCUMENT_ACTION_LABEL[key]}
                          </Button>
                        );
                      })}
                    </div>
                    {actions.includes("send") &&
                      document.steps.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Hãy thêm ít nhất một bước vào lộ trình trước khi gửi.
                        </p>
                      )}
                  </>
                )}

                {undoableEvent && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={undoAction.isPending}
                    onClick={() =>
                      setUndoTarget({
                        eventId: undoableEvent.id,
                        label: eventTitle(undoableEvent),
                      })
                    }
                  >
                    <Undo2 className="h-4 w-4" />
                    Hoàn tác: {eventTitle(undoableEvent)}
                  </Button>
                )}
              </div>
            )}

            <div className="flex-1 space-y-5 px-4 py-4 pb-safe sm:px-5">
              {/* Thông tin */}
              <dl className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">
                    Người gửi
                  </dt>
                  <dd className="min-w-0 flex-1">{senderName}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">
                    Ghi chú
                  </dt>
                  <dd className="min-w-0 flex-1 whitespace-pre-wrap">
                    {document.note || "—"}
                  </dd>
                </div>
              </dl>

              {/* Lộ trình */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Lộ trình</h3>
                  {canManage && !document.finished_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRouteEditorOpen(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Sửa lộ trình
                    </Button>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/20 px-2 py-3">
                  <DocumentStepper
                    steps={document.steps}
                    finishedAt={document.finished_at}
                  />
                </div>
              </div>

              {/* Lịch sử */}
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  Lịch sử xử lý
                  {events.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {events.length} mốc
                    </span>
                  )}
                </h3>

                {eventsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Chưa có hoạt động nào.
                  </p>
                ) : (
                  <ol className="space-y-4">
                    {events.map((event) => {
                      const undone = undoneIds.has(event.id);
                      const isReturn = event.action === "return";
                      return (
                        <li key={event.id} className="flex gap-3">
                          <span
                            className={cn(
                              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                              undone
                                ? "bg-muted-foreground/30"
                                : ACTION_DOT[event.action],
                            )}
                          />
                          <div
                            className={cn(
                              "min-w-0 flex-1 space-y-1",
                              undone && "text-muted-foreground/60",
                            )}
                          >
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <p
                                className={cn(
                                  "text-sm font-medium",
                                  undone && "line-through",
                                )}
                              >
                                {eventTitle(event)}
                              </p>
                              <span className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatShortDateTime(event.created_at)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              {event.department && (
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium",
                                    TAG_COLOR_CLASS[
                                      colorOf(DEPARTMENTS, event.department)
                                    ],
                                  )}
                                >
                                  {event.department}
                                </span>
                              )}
                              {event.handler_name && (
                                <span>{event.handler_name}</span>
                              )}
                              <span>
                                {event.actor?.full_name ??
                                  event.actor?.email ??
                                  "—"}
                              </span>
                            </div>

                            {event.note && (
                              <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                                <span className="font-medium">
                                  {isReturn ? "Lý do:" : "Ghi chú:"}
                                </span>{" "}
                                {event.note}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Child dialogs live inside SheetContent so Radix treats them as
          nested layers: rendered as siblings, closing one (e.g. the undo
          confirm) also dismissed the Sheet. */}
      {action && document && (
        <DocumentActionDialog
          open
          onOpenChange={(v) => !v && setAction(null)}
          documentId={document.id}
          stepId={action.stepId}
          action={action.key}
        />
      )}

      {routeEditorOpen && document && (
        <DocumentRouteEditor
          open
          onOpenChange={(v) => !v && setRouteEditorOpen(false)}
          document={document}
        />
      )}

      <ConfirmDialog
        open={!!undoTarget}
        onOpenChange={(v) => !v && setUndoTarget(null)}
        title="Hoàn tác thao tác?"
        description={
          undoTarget
            ? `Hồ sơ sẽ trở lại trạng thái trước thao tác "${undoTarget.label}".`
            : undefined
        }
        confirmLabel="Hoàn tác"
        onConfirm={() => {
          if (undoTarget && document) {
            undoAction.mutate({
              documentId: document.id,
              eventId: undoTarget.eventId,
            });
          }
        }}
      />
      </SheetContent>
    </Sheet>
  );
}
