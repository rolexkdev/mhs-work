"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  X,
  Plus,
  ListPlus,
  Search,
  FileText,
  Filter,
  Layers,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  DOCUMENT_FLOW_STATUS_META,
  DOCUMENT_FLOW_STATUS_ORDER,
  getDocumentFlowStatus,
} from "@/modules/documents/constants";
import {
  useDocuments,
  useDeleteDocument,
  useUpdateDocument,
} from "@/modules/documents/hooks";
import {
  DocumentListView,
  type DocumentGroupBy,
  type DocumentPatch,
} from "@/modules/documents/document-list-view";
import { DocumentDetailPanel } from "@/modules/documents/document-detail-panel";
import { HandoffDialog } from "@/modules/documents/handoff-dialog";
import {
  useMyPendingHandoffs,
  useMyHeldDocumentIds,
  usePendingHandoffRecipients,
  useRespondHandoff,
  type PendingHandoffWithDocument,
} from "@/modules/documents/handoff-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMe } from "@/modules/meetings/item-hooks";
import { DocumentFormDialog } from "@/modules/documents/document-form-dialog";
import { BulkDocumentFormDialog } from "@/modules/documents/bulk-document-form-dialog";
import { RespondHandoffDialog } from "@/modules/documents/respond-handoff-dialog";
import type { DocumentRecord, Office } from "@/types/database";

const GROUP_OPTIONS: { value: DocumentGroupBy; label: string }[] = [
  { value: "none", label: "Không nhóm" },
  { value: "status", label: "Trạng thái" },
  { value: "office", label: "Văn phòng" },
  { value: "category", label: "Loại hồ sơ" },
];

const ALL = "__all__";
const EMPTY_RECIPIENTS_MAP = new Map<string, string[]>();

export function DocumentsWorkspace() {
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();

  const [tab, setTab] = useState<"all" | "holding" | "pending">("all");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [officeFilter, setOfficeFilter] = useState<string>(ALL);
  const [categorySearch, setCategorySearch] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);

  const [groupBy, setGroupBy] = useState<DocumentGroupBy>("status");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [handoffDoc, setHandoffDoc] = useState<DocumentRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(
    null,
  );

  // Open the detail panel for ?doc=<id> (old /documents/<id> links redirect here).
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("doc");
    if (id) {
      setDetailId(id);
      setDetailOpen(true);
    }
  }, [searchParams]);

  function openDetail(id: string) {
    setDetailId(id);
    setDetailOpen(true);
    // Put ?doc=<id> in the address bar so the link can be shared.
    window.history.replaceState(null, "", `${window.location.pathname}?doc=${id}`);
  }
  function handleDetailOpenChange(v: boolean) {
    setDetailOpen(v);
    if (!v) window.history.replaceState(null, "", window.location.pathname);
  }

  const [respondTarget, setRespondTarget] = useState<{
    handoff: PendingHandoffWithDocument;
    accept: boolean;
  } | null>(null);

  const queryFilters = useMemo(
    () => ({
      officeId: officeFilter === ALL ? null : officeFilter,
      category: categorySearch.trim() || null,
      search: search.trim() || null,
    }),
    [officeFilter, categorySearch, search],
  );

  const { data: documents = [], isLoading: docsLoading } =
    useDocuments(queryFilters);
  const { data: pendingHandoffs = [], isLoading: pendingLoading } =
    useMyPendingHandoffs();
  const { data: myHeldDocIds = [] } = useMyHeldDocumentIds();
  const { data: pendingRecipientsByDoc = EMPTY_RECIPIENTS_MAP } =
    usePendingHandoffRecipients();
  const respondHandoff = useRespondHandoff();
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();

  function handlePatch(id: string, patch: DocumentPatch) {
    updateDocument.mutate({ id, ...patch });
  }

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const officeById = useMemo(
    () => new Map(offices.map((o) => [o.id, o])),
    [offices],
  );
  const myProfile = me ? profileById.get(me.id) : undefined;
  const canManage = !!me?.can_manage_documents;
  const isDocumentManager = useMemo(
    () => (id: string) => profileById.get(id)?.can_manage_documents ?? true,
    [profileById],
  );

  const filteredDocuments = useMemo(() => {
    if (statusFilter === ALL) return documents;
    return documents.filter((doc) => {
      const hasPending = pendingRecipientsByDoc.has(doc.id);
      return (
        getDocumentFlowStatus(doc, hasPending, isDocumentManager) ===
        statusFilter
      );
    });
  }, [documents, statusFilter, pendingRecipientsByDoc, isDocumentManager]);

  const heldSet = useMemo(() => new Set(myHeldDocIds), [myHeldDocIds]);
  const holdingDocuments = useMemo(() => {
    if (!me) return [];
    return filteredDocuments.filter(
      (doc) => doc.current_holder_id === me.id || heldSet.has(doc.id),
    );
  }, [filteredDocuments, me, heldSet]);

  const filteredPending = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cat = categorySearch.trim().toLowerCase();
    return pendingHandoffs.filter((h) => {
      const doc = h.document;
      if (!doc) return false;
      if (
        statusFilter !== ALL &&
        getDocumentFlowStatus(doc, true, isDocumentManager) !== statusFilter
      ) {
        return false;
      }
      if (officeFilter !== ALL && doc.current_office_id !== officeFilter)
        return false;
      if (cat && !(doc.category ?? "").toLowerCase().includes(cat))
        return false;
      if (
        q &&
        !doc.code.toLowerCase().includes(q) &&
        !doc.title.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    pendingHandoffs,
    statusFilter,
    officeFilter,
    categorySearch,
    search,
    isDocumentManager,
  ]);

  const hasFilters =
    statusFilter !== ALL ||
    officeFilter !== ALL ||
    !!categorySearch.trim() ||
    !!search.trim();

  function resetFilters() {
    setStatusFilter(ALL);
    setOfficeFilter(ALL);
    setCategorySearch("");
    setSearch("");
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search, filters and create button */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 basis-full sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã hồ sơ, tiêu đề..."
            className="pl-9"
          />
        </div>

        <Input
          value={categorySearch}
          onChange={(e) => setCategorySearch(e.target.value)}
          placeholder="Loại hồ sơ..."
          className="w-full sm:w-44"
        />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {DOCUMENT_FLOW_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {DOCUMENT_FLOW_STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={officeFilter} onValueChange={setOfficeFilter}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44">
            <SelectValue placeholder="Văn phòng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả văn phòng</SelectItem>
            {offices.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.code} — {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <Layers className="hidden h-4 w-4 text-muted-foreground sm:block" />
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as DocumentGroupBy)}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  Nhóm: {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {canManage && (
            <>
              <Button
                variant="outline"
                onClick={() => setBulkCreateOpen(true)}
                className="flex-1 sm:flex-initial"
              >
                <ListPlus className="h-4 w-4" /> Tiếp nhận nhiều hồ sơ
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                className="flex-1 sm:flex-initial"
              >
                <Plus className="h-4 w-4" /> Tiếp nhận hồ sơ
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "all" | "holding" | "pending")}
      >
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="all" className="gap-1.5">
            <span>Tất cả</span>
            <span className="text-xs text-muted-foreground">
              ({filteredDocuments.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="holding" className="gap-1.5">
            <span>Tôi đang giữ</span>
            {holdingDocuments.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-foreground/20 px-1.5 text-[11px] font-semibold text-foreground">
                {holdingDocuments.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            <span>Cần tôi xác nhận</span>
            {pendingHandoffs.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                {pendingHandoffs.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {docsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredDocuments.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? "Không tìm thấy hồ sơ nào khớp bộ lọc."
                  : "Chưa có hồ sơ nào."
              }
            />
          ) : (
            <DocumentListView
              documents={filteredDocuments}
              groupBy={groupBy}
              profiles={profiles}
              offices={offices}
              pendingRecipientsByDoc={pendingRecipientsByDoc}
              isDocumentManager={isDocumentManager}
              canManage={canManage}
              onOpen={(doc) => openDetail(doc.id)}
              onPatch={handlePatch}
              onHandoff={setHandoffDoc}
              onDelete={setPendingDelete}
            />
          )}
        </TabsContent>

        <TabsContent value="holding">
          {docsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : holdingDocuments.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? "Không có hồ sơ bạn đang giữ khớp bộ lọc."
                  : "Hiện bạn không giữ bản chính hay bản sao của hồ sơ nào."
              }
            />
          ) : (
            <DocumentListView
              documents={holdingDocuments}
              groupBy={groupBy}
              profiles={profiles}
              offices={offices}
              pendingRecipientsByDoc={pendingRecipientsByDoc}
              isDocumentManager={isDocumentManager}
              canManage={canManage}
              onOpen={(doc) => openDetail(doc.id)}
              onPatch={handlePatch}
              onHandoff={setHandoffDoc}
              onDelete={setPendingDelete}
            />
          )}
        </TabsContent>

        <TabsContent value="pending">
          {pendingLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredPending.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? "Không có hồ sơ chờ xác nhận nào khớp bộ lọc."
                  : "Không có hồ sơ nào đang chờ bạn xác nhận."
              }
            />
          ) : (
            <PendingHandoffsView
              items={filteredPending}
              nameOf={(id) =>
                id
                  ? (profileById.get(id)?.full_name ??
                    profileById.get(id)?.email ??
                    null)
                  : null
              }
              avatarOf={(id) =>
                id ? (profileById.get(id)?.avatar_url ?? null) : null
              }
              officeById={officeById}
              onOpen={openDetail}
              isResponding={respondHandoff.isPending}
              onQuickAccept={(h) =>
                respondHandoff.mutate({
                  handoffId: h.id,
                  accept: true,
                  documentId: h.document_id,
                })
              }
              onOpenRespondDialog={(h, accept) =>
                setRespondTarget({ handoff: h, accept })
              }
            />
          )}
        </TabsContent>
      </Tabs>

      <DocumentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultOfficeId={myProfile?.office_id ?? null}
        onCreated={(doc) => openDetail(doc.id)}
      />

      <BulkDocumentFormDialog
        open={bulkCreateOpen}
        onOpenChange={setBulkCreateOpen}
        defaultOfficeId={myProfile?.office_id ?? null}
      />

      <RespondHandoffDialog
        open={!!respondTarget}
        onOpenChange={(v) => !v && setRespondTarget(null)}
        handoff={respondTarget?.handoff ?? null}
        documentTitle={
          respondTarget?.handoff.document
            ? `${respondTarget.handoff.document.code} — ${respondTarget.handoff.document.title}`
            : null
        }
        defaultAccept={respondTarget?.accept ?? true}
      />

      <DocumentDetailPanel
        documentId={detailId}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
      />

      {handoffDoc && (
        <HandoffDialog
          open={!!handoffDoc}
          onOpenChange={(v) => !v && setHandoffDoc(null)}
          documentId={handoffDoc.id}
          currentUserId={me?.id ?? null}
          pendingRecipientIds={pendingRecipientsByDoc.get(handoffDoc.id) ?? []}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Xoá hồ sơ?"
        description={
          pendingDelete
            ? `Hồ sơ "${pendingDelete.code} — ${pendingDelete.title}" sẽ bị xoá vĩnh viễn cùng lịch sử bàn giao và tệp đính kèm.`
            : undefined
        }
        confirmLabel="Xoá hồ sơ"
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return;
          const id = pendingDelete.id;
          try {
            await deleteDocument.mutateAsync(id);
          } catch {
            return;
          }
          if (detailId === id) handleDetailOpenChange(false);
        }}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed py-14 text-center">
      <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function PendingHandoffsView({
  items,
  nameOf,
  avatarOf,
  officeById,
  onOpen,
  isResponding,
  onQuickAccept,
  onOpenRespondDialog,
}: {
  items: PendingHandoffWithDocument[];
  nameOf: (id: string | null) => string | null;
  avatarOf: (id: string | null) => string | null;
  officeById: Map<string, Office>;
  onOpen: (documentId: string) => void;
  isResponding: boolean;
  onQuickAccept: (h: PendingHandoffWithDocument) => void;
  onOpenRespondDialog: (h: PendingHandoffWithDocument, accept: boolean) => void;
}) {
  return (
    <>
      {/* Mobile cards */}
      <div className="divide-y rounded-lg border bg-background md:hidden">
        {items.map((h) => {
          const doc = h.document;
          const senderName = nameOf(h.from_user) ?? "—";
          const senderAvatar = avatarOf(h.from_user);
          const office = doc?.current_office_id
            ? officeById.get(doc.current_office_id)
            : undefined;
          return (
            <div key={h.id} className="space-y-2.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => onOpen(h.document_id)}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {doc?.code ?? "—"}
                    </button>
                    {office && (
                      <Badge
                        variant="secondary"
                        className="text-[11px] font-normal"
                      >
                        {office.code}
                      </Badge>
                    )}
                  </div>
                  <button
                    onClick={() => onOpen(h.document_id)}
                    className="mt-1 block text-left font-medium leading-snug hover:underline"
                  >
                    {doc?.title ?? "Hồ sơ không xác định"}
                  </button>
                </div>
              </div>

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
                  Từ:{" "}
                  <span className="font-medium text-foreground">
                    {senderName}
                  </span>
                </span>
                <span>· {formatDateTime(h.created_at)}</span>
              </div>

              {h.note && (
                <p className="rounded bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                  Ghi chú: {h.note}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={isResponding}
                  onClick={() => onQuickAccept(h)}
                >
                  {isResponding ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Nhận
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={isResponding}
                  onClick={() => onOpenRespondDialog(h, false)}
                >
                  <X className="h-3.5 w-3.5" /> Từ chối
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenRespondDialog(h, true)}
                  title="Nhận kèm ghi chú hoặc ảnh minh chứng"
                >
                  Kèm ảnh
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Mã hồ sơ</th>
              <th className="px-4 py-2.5 text-left font-medium">
                Tiêu đề &amp; Ghi chú
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Người giao</th>
              <th className="px-4 py-2.5 text-left font-medium">Thời gian</th>
              <th className="px-4 py-2.5 text-right font-medium">Xác nhận</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => {
              const doc = h.document;
              const senderName = nameOf(h.from_user) ?? "—";
              const senderAvatar = avatarOf(h.from_user);
              return (
                <tr
                  key={h.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">
                    <button
                      onClick={() => onOpen(h.document_id)}
                      className="text-primary hover:underline"
                    >
                      {doc?.code ?? "—"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onOpen(h.document_id)}
                      className="text-left font-medium hover:underline"
                    >
                      {doc?.title ?? "Hồ sơ không xác định"}
                    </button>
                    {h.note && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Ghi chú: {h.note}
                      </p>
                    )}
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
                    {formatDateTime(h.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={isResponding}
                        onClick={() => onQuickAccept(h)}
                      >
                        <Check className="h-3.5 w-3.5" /> Nhận
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenRespondDialog(h, true)}
                        disabled={isResponding}
                      >
                        Nhận + Ảnh
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        disabled={isResponding}
                        onClick={() => onOpenRespondDialog(h, false)}
                      >
                        <X className="h-3.5 w-3.5" /> Từ chối
                      </Button>
                    </div>
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
