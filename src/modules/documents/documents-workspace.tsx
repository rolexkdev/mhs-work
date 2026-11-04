"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  X,
  Plus,
  Search,
  FileText,
  ArrowRight,
  CalendarClock,
  Building2,
  User,
  Filter,
  Loader2,
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
  DOCUMENT_STATUS_META,
  DOCUMENT_STATUS_ORDER,
  DOCUMENT_PRIORITY_META,
  HANDOFF_KIND_META,
} from "@/modules/documents/constants";
import { useDocuments } from "@/modules/documents/hooks";
import {
  useMyPendingHandoffs,
  useMyHeldDocumentIds,
  useRespondHandoff,
  type PendingHandoffWithDocument,
} from "@/modules/documents/handoff-hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMe } from "@/modules/meetings/item-hooks";
import { DocumentFormDialog } from "@/modules/documents/document-form-dialog";
import { RespondHandoffDialog } from "@/modules/documents/respond-handoff-dialog";
import type { DocumentRecord, DocumentStatus, Office } from "@/types/database";

const ALL = "__all__";

export function DocumentsWorkspace() {
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();

  const [tab, setTab] = useState<"pending" | "holding" | "all">("pending");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [officeFilter, setOfficeFilter] = useState<string>(ALL);
  const [categorySearch, setCategorySearch] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const [respondTarget, setRespondTarget] = useState<{
    handoff: PendingHandoffWithDocument;
    accept: boolean;
  } | null>(null);

  const queryFilters = useMemo(
    () => ({
      status:
        statusFilter === ALL ? null : (statusFilter as DocumentStatus),
      officeId: officeFilter === ALL ? null : officeFilter,
      category: categorySearch.trim() || null,
      search: search.trim() || null,
    }),
    [statusFilter, officeFilter, categorySearch, search],
  );

  const { data: documents = [], isLoading: docsLoading } =
    useDocuments(queryFilters);
  const { data: pendingHandoffs = [], isLoading: pendingLoading } =
    useMyPendingHandoffs();
  const { data: myHeldDocIds = [] } = useMyHeldDocumentIds();
  const respondHandoff = useRespondHandoff();

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const officeById = useMemo(
    () => new Map(offices.map((o) => [o.id, o])),
    [offices],
  );
  const myProfile = me ? profileById.get(me.id) : undefined;

  const heldSet = useMemo(() => new Set(myHeldDocIds), [myHeldDocIds]);

  const holdingDocuments = useMemo(() => {
    if (!me) return [];
    return documents.filter(
      (doc) => doc.current_holder_id === me.id || heldSet.has(doc.id),
    );
  }, [documents, me, heldSet]);

  const filteredPending = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cat = categorySearch.trim().toLowerCase();
    return pendingHandoffs.filter((h) => {
      const doc = h.document;
      if (!doc) return false;
      if (statusFilter !== ALL && doc.status !== statusFilter) return false;
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
  }, [pendingHandoffs, statusFilter, officeFilter, categorySearch, search]);

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
      {/* Toolbar: search, filters, and create button */}
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
            {DOCUMENT_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {DOCUMENT_STATUS_META[s].label}
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
          <Plus className="h-4 w-4" /> Tạo hồ sơ
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "pending" | "holding" | "all")}
      >
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="pending" className="gap-1.5">
            <span>Cần tôi xác nhận</span>
            {pendingHandoffs.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                {pendingHandoffs.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="holding" className="gap-1.5">
            <span>Tôi đang giữ</span>
            {holdingDocuments.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-foreground/20 px-1.5 text-[11px] font-semibold text-foreground">
                {holdingDocuments.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5">
            <span>Tất cả</span>
            <span className="text-xs text-muted-foreground">
              ({documents.length})
            </span>
          </TabsTrigger>
        </TabsList>

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
            <DocumentsListView
              documents={holdingDocuments}
              currentUserId={me?.id ?? null}
              heldSet={heldSet}
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
            />
          )}
        </TabsContent>

        <TabsContent value="all">
          {docsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? "Không tìm thấy hồ sơ nào khớp bộ lọc."
                  : "Chưa có hồ sơ nào. Bấm Tạo hồ sơ để bắt đầu."
              }
            />
          ) : (
            <DocumentsListView
              documents={documents}
              currentUserId={me?.id ?? null}
              heldSet={heldSet}
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
            />
          )}
        </TabsContent>
      </Tabs>

      <DocumentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultOfficeId={myProfile?.office_id ?? null}
        navigateOnCreate
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
  isResponding,
  onQuickAccept,
  onOpenRespondDialog,
}: {
  items: PendingHandoffWithDocument[];
  nameOf: (id: string | null) => string | null;
  avatarOf: (id: string | null) => string | null;
  officeById: Map<string, Office>;
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
          const kindMeta = HANDOFF_KIND_META[h.kind];
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
                    <Link
                      href={`/documents/${h.document_id}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {doc?.code ?? "—"}
                    </Link>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                        kindMeta.badge,
                      )}
                    >
                      <span
                        className={cn("h-1.5 w-1.5 rounded-full", kindMeta.dot)}
                      />
                      {kindMeta.label}
                    </span>
                    {office && (
                      <Badge
                        variant="secondary"
                        className="text-[11px] font-normal"
                      >
                        {office.code}
                      </Badge>
                    )}
                  </div>
                  <Link
                    href={`/documents/${h.document_id}`}
                    className="mt-1 block font-medium leading-snug hover:underline"
                  >
                    {doc?.title ?? "Hồ sơ không xác định"}
                  </Link>
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
                Tiêu đề & Ghi chú
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Hình thức</th>
              <th className="px-4 py-2.5 text-left font-medium">Người giao</th>
              <th className="px-4 py-2.5 text-left font-medium">Thời gian</th>
              <th className="px-4 py-2.5 text-right font-medium">Xác nhận</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => {
              const doc = h.document;
              const kindMeta = HANDOFF_KIND_META[h.kind];
              const senderName = nameOf(h.from_user) ?? "—";
              const senderAvatar = avatarOf(h.from_user);
              return (
                <tr
                  key={h.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">
                    <Link
                      href={`/documents/${h.document_id}`}
                      className="text-primary hover:underline"
                    >
                      {doc?.code ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/documents/${h.document_id}`}
                      className="font-medium hover:underline"
                    >
                      {doc?.title ?? "Hồ sơ không xác định"}
                    </Link>
                    {h.note && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Ghi chú: {h.note}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                        kindMeta.badge,
                      )}
                    >
                      <span
                        className={cn("h-1.5 w-1.5 rounded-full", kindMeta.dot)}
                      />
                      {kindMeta.label}
                    </span>
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

function DocumentsListView({
  documents,
  currentUserId,
  heldSet,
  nameOf,
  avatarOf,
  officeById,
}: {
  documents: DocumentRecord[];
  currentUserId: string | null;
  heldSet: Set<string>;
  nameOf: (id: string | null) => string | null;
  avatarOf: (id: string | null) => string | null;
  officeById: Map<string, Office>;
}) {
  return (
    <>
      {/* Mobile cards */}
      <div className="divide-y rounded-lg border bg-background md:hidden">
        {documents.map((doc) => {
          const statusMeta = DOCUMENT_STATUS_META[doc.status];
          const priorityMeta = DOCUMENT_PRIORITY_META[doc.priority];
          const holderName = nameOf(doc.current_holder_id);
          const holderAvatar = avatarOf(doc.current_holder_id);
          const currentOffice = doc.current_office_id
            ? officeById.get(doc.current_office_id)
            : undefined;
          const isDone = doc.status === "done" || doc.status === "archived";
          const due = dueLabel(doc.due_date, { done: isDone });
          const isPrimaryHolder =
            !!currentUserId && doc.current_holder_id === currentUserId;
          const isCopyHolder = !isPrimaryHolder && heldSet.has(doc.id);

          return (
            <Link
              key={doc.id}
              href={`/documents/${doc.id}`}
              className="block space-y-2 p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold text-primary">
                    {doc.code}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                      statusMeta.badge,
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)}
                    />
                    {statusMeta.label}
                  </span>
                  {doc.category && (
                    <Badge
                      variant="outline"
                      className="text-[11px] font-normal"
                    >
                      {doc.category}
                    </Badge>
                  )}
                  {isCopyHolder && (
                    <Badge
                      variant="secondary"
                      className="text-[11px] font-normal"
                    >
                      Giữ bản sao
                    </Badge>
                  )}
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                    priorityMeta.badge,
                  )}
                >
                  {priorityMeta.label}
                </span>
              </div>

              <p className="font-medium leading-snug">{doc.title}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {currentOffice && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {currentOffice.code}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  {holderName ? (
                    <>
                      <Avatar className="h-4 w-4">
                        {holderAvatar && (
                          <AvatarImage src={holderAvatar} alt={holderName} />
                        )}
                        <AvatarFallback className="text-[9px]">
                          {initials(holderName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-foreground">{holderName}</span>
                    </>
                  ) : (
                    <>
                      <User className="h-3.5 w-3.5" /> Chưa có người giữ
                    </>
                  )}
                </span>
                {doc.due_date && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      due.tone === "overdue" && "font-medium text-red-600",
                      due.tone === "today" && "font-medium text-amber-600",
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {due.text}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Mã hồ sơ</th>
              <th className="px-4 py-2.5 text-left font-medium">Tiêu đề</th>
              <th className="px-4 py-2.5 text-left font-medium">Loại</th>
              <th className="px-4 py-2.5 text-left font-medium">Trạng thái</th>
              <th className="px-4 py-2.5 text-left font-medium">Văn phòng</th>
              <th className="px-4 py-2.5 text-left font-medium">
                Người đang giữ
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Ưu tiên</th>
              <th className="px-4 py-2.5 text-left font-medium">Hạn xử lý</th>
              <th className="px-4 py-2.5 text-left font-medium">Ngày tạo</th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const statusMeta = DOCUMENT_STATUS_META[doc.status];
              const priorityMeta = DOCUMENT_PRIORITY_META[doc.priority];
              const holderName = nameOf(doc.current_holder_id);
              const holderAvatar = avatarOf(doc.current_holder_id);
              const currentOffice = doc.current_office_id
                ? officeById.get(doc.current_office_id)
                : undefined;
              const isDone =
                doc.status === "done" || doc.status === "archived";
              const due = dueLabel(doc.due_date, { done: isDone });
              const isPrimaryHolder =
                !!currentUserId && doc.current_holder_id === currentUserId;
              const isCopyHolder = !isPrimaryHolder && heldSet.has(doc.id);

              return (
                <tr
                  key={doc.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="text-primary hover:underline"
                    >
                      {doc.code}
                    </Link>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="line-clamp-2 font-medium hover:underline"
                    >
                      {doc.title}
                    </Link>
                    {isCopyHolder && (
                      <span className="mt-0.5 inline-block text-[11px] text-muted-foreground">
                        (Đang giữ bản sao)
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {doc.category || <span className="text-xs">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
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
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {currentOffice ? (
                      <Badge
                        variant="secondary"
                        className="font-normal"
                        title={currentOffice.name}
                      >
                        {currentOffice.code}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {holderName ? (
                      <div className="flex items-center gap-2">
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
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                        priorityMeta.badge,
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          priorityMeta.dot,
                        )}
                      />
                      {priorityMeta.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {doc.due_date ? (
                      <span
                        className={cn(
                          due.tone === "overdue" && "font-medium text-red-600",
                          due.tone === "today" && "font-medium text-amber-600",
                          due.tone === "normal" && "text-muted-foreground",
                        )}
                      >
                        {due.text}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(doc.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="inline-flex items-center text-muted-foreground hover:text-foreground"
                      title="Xem chi tiết"
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
