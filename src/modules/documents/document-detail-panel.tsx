"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CalendarClock,
  Check,
  Flag,
  Hash,
  History,
  Link2,
  Loader2,
  Paperclip,
  Send,
  Tag,
  Trash2,
  User,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_CATEGORY_SUGGESTIONS,
  DOCUMENT_PRIORITY_META,
  DOCUMENT_PRIORITY_ORDER,
  NON_HANDOFFABLE_DOCUMENT_STATUSES,
  getDocumentFlowStatus,
} from "@/modules/documents/constants";
import { DocumentFlowStatusBadge } from "@/modules/documents/document-flow-status-badge";
import {
  useDocument,
  useDeleteDocument,
  useUpdateDocument,
  type UpdateDocumentInput,
} from "@/modules/documents/hooks";
import {
  useDocumentHandoffs,
  useCancelHandoff,
} from "@/modules/documents/handoff-hooks";
import { useDocumentAttachments } from "@/modules/documents/attachment-hooks";
import { useDocumentLogs } from "@/modules/documents/log-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMe } from "@/modules/meetings/item-hooks";
import { TimelineSection } from "@/modules/documents/document-timeline";
import { AttachmentsCard } from "@/modules/documents/document-attachments";
import { RecipientPickerCell } from "@/modules/documents/recipient-picker-cell";
import { HandoffDialog } from "@/modules/documents/handoff-dialog";
import { RespondHandoffDialog } from "@/modules/documents/respond-handoff-dialog";
import type { DocumentHandoff, TaskPriority } from "@/types/database";

const PANEL_CATEGORY_LIST_ID = "doc-panel-category-suggestions";
const TAB_TRIGGER_CLASS =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-2 pt-1 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none";

/** Local calendar date (YYYY-MM-DD) of a timestamp. */
const toLocalDateInput = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE");

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  // Narrow screens: label above, value takes the full width below.
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3 sm:py-1.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground sm:w-40 sm:shrink-0">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

function Person({
  name,
  avatar,
}: {
  name: string | null;
  avatar: string | null;
}) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="h-6 w-6 shrink-0">
        {avatar && <AvatarImage src={avatar} alt={name} />}
        <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Document detail as a right-side sheet, mirroring TaskDetailPanel. Intake
 * staff edit fields inline (autosaved); everyone else sees them read-only.
 * Status and holders only change through handoffs.
 */
export function DocumentDetailPanel({
  documentId,
  open,
  onOpenChange,
}: {
  documentId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: me } = useMe();
  const { data: document, isLoading } = useDocument(documentId);
  const { data: handoffs = [] } = useDocumentHandoffs(documentId);
  const { data: attachments = [] } = useDocumentAttachments(documentId);
  const { data: logs = [] } = useDocumentLogs(documentId);
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();

  const update = useUpdateDocument();
  const deleteDocument = useDeleteDocument();
  const cancelHandoff = useCancelHandoff();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const loadedId = useRef<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const [handoffOpen, setHandoffOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancellingHandoff, setCancellingHandoff] =
    useState<DocumentHandoff | null>(null);
  const [respondState, setRespondState] = useState<{
    handoff: DocumentHandoff;
    accept: boolean;
  } | null>(null);

  // Re-seed local inputs only when another document is loaded, so realtime
  // refreshes of the same document never clobber what the user is typing.
  // Reset when the panel closes so reopening picks up edits made in the table.
  useEffect(() => {
    if (!open) loadedId.current = null;
  }, [open]);
  useEffect(() => {
    if (open && document && document.id !== loadedId.current) {
      setTitle(document.title);
      setDescription(document.description ?? "");
      setCategory(document.category ?? "");
      setQuantity(String(document.quantity));
      loadedId.current = document.id;
    }
  }, [document, open]);

  // Grow the title textarea with its content.
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [title, open]);

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const officeById = useMemo(
    () => new Map(offices.map((o) => [o.id, o])),
    [offices],
  );
  const nameOf = (userId: string | null | undefined) => {
    if (!userId) return null;
    const p = profileById.get(userId);
    return p ? (p.full_name ?? p.email) : null;
  };
  const avatarOf = (userId: string | null | undefined) =>
    userId ? (profileById.get(userId)?.avatar_url ?? null) : null;

  function patch(p: Omit<UpdateDocumentInput, "id">) {
    if (document) update.mutate({ id: document.id, ...p });
  }

  // The document id is captured when typing, so a save that fires after the
  // user switched to another document still targets the one being edited.
  const saveTitle = useDebouncedCallback((id: string, value: string) => {
    if (value.trim()) update.mutate({ id, title: value.trim() });
  });
  const saveDescription = useDebouncedCallback((id: string, value: string) => {
    update.mutate({ id, description: value || null });
  });

  function commitCategory() {
    if (!document) return;
    const v = category.trim() || null;
    if (v !== (document.category ?? null)) patch({ category: v });
  }
  function commitQuantity() {
    if (!document) return;
    const n = Math.floor(Number(quantity));
    if (Number.isFinite(n) && n >= 1) {
      if (n !== document.quantity) patch({ quantity: n });
    } else {
      setQuantity(String(document.quantity));
    }
  }

  function copyLink() {
    if (!document) return;
    const url = `${window.location.origin}/documents?doc=${document.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Đã chép liên kết hồ sơ"))
      .catch(() => toast.error("Không chép được liên kết"));
  }

  const canManage = !!me?.can_manage_documents;
  const readOnly = !canManage;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto p-0 sm:max-w-2xl">
        {!document ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <SheetTitle className="sr-only">Chi tiết hồ sơ</SheetTitle>
            {isLoading || !documentId ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Không tìm thấy hồ sơ.
              </p>
            )}
          </div>
        ) : (
          (() => {
            const pendingRecipientIds = handoffs
              .filter((h) => h.status === "pending")
              .map((h) => h.to_user);
            const isDocumentManager = (userId: string) =>
              profileById.get(userId)?.can_manage_documents ?? true;
            const flowStatus = getDocumentFlowStatus(
              document,
              pendingRecipientIds.length > 0,
              isDocumentManager,
            );
            const currentOffice = document.current_office_id
              ? officeById.get(document.current_office_id)
              : undefined;
            const originOffice = document.origin_office_id
              ? officeById.get(document.origin_office_id)
              : undefined;
            const hasFinalReceiver =
              Boolean(document.delivered_to) &&
              !isDocumentManager(document.delivered_to!);
            const myPendingHandoff = me
              ? (handoffs.find(
                  (h) => h.to_user === me.id && h.status === "pending",
                ) ?? null)
              : null;
            const canCreateHandoff =
              canManage &&
              !NON_HANDOFFABLE_DOCUMENT_STATUSES.has(document.status);
            const priorityMeta = DOCUMENT_PRIORITY_META[document.priority];

            return (
              <div className="flex h-full flex-col">
                {/* Header — leave 3rem on the right for the sheet close button */}
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 pr-12 sm:px-5">
                  <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                    {document.code}
                  </span>
                  <DocumentFlowStatusBadge
                    status={flowStatus}
                    office={currentOffice}
                    recipientNames={pendingRecipientIds
                      .map((id) => nameOf(id))
                      .filter((n): n is string => Boolean(n))}
                  />
                  {update.isPending && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="hidden sm:inline">Đang lưu</span>
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    {canCreateHandoff && (
                      <Button size="sm" onClick={() => setHandoffOpen(true)}>
                        <Send className="h-4 w-4" /> Bàn giao
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={copyLink}
                      title="Chép liên kết hồ sơ"
                    >
                      <Link2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Chép liên kết</span>
                    </Button>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteOpen(true)}
                        aria-label="Xoá hồ sơ"
                        title="Xoá hồ sơ"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {myPendingHandoff && (
                  <div className="flex flex-col justify-between gap-3 border-b border-amber-300 bg-amber-50/90 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-amber-900">
                        Hồ sơ đang chờ bạn xác nhận nhận bàn giao
                      </p>
                      <p className="text-xs text-amber-800">
                        Người giao:{" "}
                        <span className="font-medium">
                          {nameOf(myPendingHandoff.from_user) ?? "—"}
                        </span>{" "}
                        · {formatDateTime(myPendingHandoff.created_at)}
                        {myPendingHandoff.note &&
                          ` · Ghi chú: "${myPendingHandoff.note}"`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() =>
                          setRespondState({
                            handoff: myPendingHandoff,
                            accept: true,
                          })
                        }
                      >
                        <Check className="h-4 w-4" /> Đã nhận
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 bg-white text-red-700 hover:bg-red-50"
                        onClick={() =>
                          setRespondState({
                            handoff: myPendingHandoff,
                            accept: false,
                          })
                        }
                      >
                        <X className="h-4 w-4" /> Từ chối
                      </Button>
                    </div>
                  </div>
                )}

                <Tabs defaultValue="detail" className="flex min-h-0 flex-1 flex-col">
                  <div className="border-b px-4 sm:px-5">
                    <TabsList className="h-10 justify-start gap-3 rounded-none bg-transparent p-0">
                      <TabsTrigger value="detail" className={TAB_TRIGGER_CLASS}>
                        Chi tiết
                      </TabsTrigger>
                      <TabsTrigger value="history" className={TAB_TRIGGER_CLASS}>
                        <History className="h-3.5 w-3.5" /> Lịch sử
                      </TabsTrigger>
                      <TabsTrigger value="files" className={TAB_TRIGGER_CLASS}>
                        <Paperclip className="h-3.5 w-3.5" /> Tệp (
                        {attachments.length})
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent
                    value="detail"
                    className="mt-0 flex-1 space-y-1 overflow-y-auto px-4 py-4 pb-safe sm:px-5"
                  >
                    <SheetTitle className="sr-only">
                      {document.code} — {document.title}
                    </SheetTitle>
                    {readOnly ? (
                        <h2 className="text-lg font-semibold leading-snug">
                          {document.title}
                        </h2>
                      ) : (
                        <textarea
                          ref={titleRef}
                          value={title}
                          onChange={(e) => {
                            setTitle(e.target.value);
                            saveTitle(document.id, e.target.value);
                          }}
                          rows={1}
                          aria-label="Tiêu đề hồ sơ"
                          className="w-full resize-none overflow-hidden border-0 bg-transparent text-lg font-semibold leading-snug outline-none placeholder:text-muted-foreground"
                          placeholder="Tiêu đề hồ sơ"
                        />
                      )}

                    <div className="divide-y sm:divide-y-0">
                      <Row icon={Flag} label="Ưu tiên">
                        {readOnly ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                              priorityMeta.badge,
                            )}
                          >
                            {priorityMeta.label}
                          </span>
                        ) : (
                          <Select
                            value={document.priority}
                            onValueChange={(v) =>
                              patch({ priority: v as TaskPriority })
                            }
                          >
                            <SelectTrigger className="h-8 w-full sm:w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOCUMENT_PRIORITY_ORDER.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {DOCUMENT_PRIORITY_META[p].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </Row>

                      <Row icon={Tag} label="Loại hồ sơ">
                        {readOnly ? (
                          (document.category ?? (
                            <span className="text-muted-foreground">—</span>
                          ))
                        ) : (
                          <>
                            <Input
                              list={PANEL_CATEGORY_LIST_ID}
                              value={category}
                              onChange={(e) => setCategory(e.target.value)}
                              onBlur={commitCategory}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                              placeholder="VD: Công văn đến, Tờ trình..."
                              className="h-8"
                            />
                            <datalist id={PANEL_CATEGORY_LIST_ID}>
                              {DOCUMENT_CATEGORY_SUGGESTIONS.map((item) => (
                                <option key={item} value={item} />
                              ))}
                            </datalist>
                          </>
                        )}
                      </Row>

                      <Row icon={Hash} label="Số lượng">
                        {readOnly ? (
                          document.quantity
                        ) : (
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            onBlur={commitQuantity}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                            className="h-8 w-full sm:w-28"
                          />
                        )}
                      </Row>

                      <Row icon={CalendarClock} label="Ngày tiếp nhận">
                        {readOnly ? (
                          formatDate(document.received_at)
                        ) : (
                          <Input
                            type="date"
                            // Remount when the stored value changes elsewhere.
                            key={document.received_at}
                            defaultValue={toLocalDateInput(document.received_at)}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const iso = new Date(
                                `${e.target.value}T00:00:00`,
                              ).toISOString();
                              if (iso !== document.received_at)
                                patch({ received_at: iso });
                            }}
                            className="h-8 w-full sm:w-44"
                          />
                        )}
                      </Row>

                      <Row icon={UserRound} label="Người tiếp nhận">
                        <Person
                          name={nameOf(document.received_by)}
                          avatar={avatarOf(document.received_by)}
                        />
                      </Row>

                      <Row icon={Building2} label="Văn phòng">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {currentOffice ? (
                            <span title={currentOffice.name}>
                              {currentOffice.code} — {currentOffice.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {originOffice &&
                            originOffice.id !== currentOffice?.id && (
                              <span className="text-xs text-muted-foreground">
                                (Khởi tạo: {originOffice.code})
                              </span>
                            )}
                        </span>
                      </Row>

                      <Row icon={User} label="Đang giữ bản chính">
                        <Person
                          name={nameOf(document.current_holder_id)}
                          avatar={avatarOf(document.current_holder_id)}
                        />
                      </Row>

                      <Row icon={Send} label="Người nhận dự kiến">
                        <RecipientPickerCell
                          value={document.intended_recipient_id}
                          profiles={profiles}
                          offices={offices}
                          onChange={(id) =>
                            patch({ intended_recipient_id: id })
                          }
                          disabled={readOnly}
                          triggerClassName="text-sm"
                        />
                      </Row>

                      <Row icon={UserCheck} label="Người nhận">
                        {hasFinalReceiver ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Person
                              name={nameOf(document.delivered_to)}
                              avatar={avatarOf(document.delivered_to)}
                            />
                            {document.delivered_at && (
                              <span className="text-xs text-muted-foreground">
                                · {formatDate(document.delivered_at)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Chưa có người nhận
                          </span>
                        )}
                      </Row>

                    </div>

                    <div className="space-y-1.5 pt-4">
                      <p className="text-sm font-medium">
                        Mô tả / Nội dung tóm tắt
                      </p>
                      {readOnly ? (
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {document.description || "—"}
                        </p>
                      ) : (
                        <AutoGrowTextarea
                          value={description}
                          onChange={(e) => {
                            setDescription(e.target.value);
                            saveDescription(document.id, e.target.value);
                          }}
                          minRows={3}
                          recalcKey={open}
                          placeholder="Ghi chú số hiệu gốc, đơn vị gửi, nội dung chính..."
                          className="w-full rounded-md border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                        />
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="history"
                    className="mt-0 flex-1 overflow-y-auto px-4 py-4 pb-safe sm:px-5"
                  >
                    <TimelineSection
                      handoffs={handoffs}
                      logs={logs}
                      attachments={attachments}
                      currentUserId={me?.id ?? null}
                      canManage={canManage}
                      nameOf={nameOf}
                      avatarOf={avatarOf}
                      onRespond={(h, accept) =>
                        setRespondState({ handoff: h, accept })
                      }
                      onCancel={(h) => setCancellingHandoff(h)}
                    />
                  </TabsContent>

                  <TabsContent
                    value="files"
                    className="mt-0 flex-1 overflow-y-auto px-4 py-4 pb-safe sm:px-5"
                  >
                    <AttachmentsCard
                      documentId={document.id}
                      attachments={attachments}
                      currentUserId={me?.id ?? null}
                      canManage={canManage}
                      nameOf={nameOf}
                    />
                  </TabsContent>
                </Tabs>

                <HandoffDialog
                  open={handoffOpen}
                  onOpenChange={setHandoffOpen}
                  documentId={document.id}
                  currentUserId={me?.id ?? null}
                  pendingRecipientIds={pendingRecipientIds}
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
                    onOpenChange(false);
                  }}
                />
              </div>
            );
          })()
        )}
      </SheetContent>
    </Sheet>
  );
}
