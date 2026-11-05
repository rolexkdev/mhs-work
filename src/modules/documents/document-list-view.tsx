"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  PanelRightOpen,
  Send,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EditableTitle,
  InlineDateCell,
  InlineNumberCell,
  InlineTextCell,
} from "@/components/inline-edit-cells";
import {
  InlineSelectCell,
  Pill,
  type CellOption,
} from "@/modules/tasks/components/tag-cells";
import {
  DOCUMENT_CATEGORY_SUGGESTIONS,
  DOCUMENT_FLOW_STATUS_META,
  DOCUMENT_FLOW_STATUS_ORDER,
  DOCUMENT_PRIORITY_META,
  DOCUMENT_PRIORITY_ORDER,
  NON_HANDOFFABLE_DOCUMENT_STATUSES,
  getDocumentFlowStatus,
  type DocumentFlowStatus,
} from "@/modules/documents/constants";
import { DocumentFlowStatusBadge } from "@/modules/documents/document-flow-status-badge";
import { RecipientPickerCell } from "@/modules/documents/recipient-picker-cell";
import type {
  DocumentRecord,
  Office,
  Profile,
  TaskPriority,
} from "@/types/database";
import type { UpdateDocumentInput } from "@/modules/documents/hooks";

export type DocumentGroupBy = "none" | "status" | "office" | "category";

export type DocumentPatch = Omit<UpdateDocumentInput, "id">;

const NONE_KEY = "__none__";
const CATEGORY_LIST_ID = "doc-list-category-suggestions";

const PRIORITY_OPTIONS: CellOption[] = DOCUMENT_PRIORITY_ORDER.map((p) => ({
  value: p,
  label: DOCUMENT_PRIORITY_META[p].label,
  className: DOCUMENT_PRIORITY_META[p].badge,
}));

const STATUS_BORDER: Record<DocumentFlowStatus, string> = {
  at_office: "border-l-sky-500",
  in_transit: "border-l-amber-500",
  received: "border-l-emerald-500",
};

type Row = {
  doc: DocumentRecord;
  flowStatus: DocumentFlowStatus;
  pendingRecipientNames: string[];
  finalReceiverId: string | null;
};

type Group = { key: string; label: string; rows: Row[] };

function groupAccent(groupBy: DocumentGroupBy, key: string) {
  if (groupBy === "status") {
    const meta = DOCUMENT_FLOW_STATUS_META[key as DocumentFlowStatus];
    return {
      bar: cn(meta.badge, "hover:brightness-95"),
      dot: meta.dot,
      border: STATUS_BORDER[key as DocumentFlowStatus],
    };
  }
  return {
    bar: "bg-muted/20 hover:bg-muted/40",
    dot: "bg-muted-foreground/40",
    border: "border-l-muted-foreground/30",
  };
}

function buildGroups(
  rows: Row[],
  groupBy: DocumentGroupBy,
  offices: Office[],
): Group[] {
  if (groupBy === "none") return [{ key: "all", label: "", rows }];

  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const key =
      groupBy === "status"
        ? r.flowStatus
        : groupBy === "office"
          ? (r.doc.current_office_id ?? NONE_KEY)
          : r.doc.category?.trim() || NONE_KEY;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }

  const labelFor = (key: string) => {
    if (groupBy === "status")
      return DOCUMENT_FLOW_STATUS_META[key as DocumentFlowStatus].label;
    if (key === NONE_KEY)
      return groupBy === "office" ? "Chưa xác định văn phòng" : "Chưa phân loại";
    if (groupBy === "office") {
      const o = offices.find((x) => x.id === key);
      return o ? `${o.code} — ${o.name}` : "—";
    }
    return key;
  };

  let order: string[];
  if (groupBy === "status") order = [...DOCUMENT_FLOW_STATUS_ORDER];
  else if (groupBy === "office") order = [...offices.map((o) => o.id), NONE_KEY];
  else
    order = [
      ...Array.from(map.keys())
        .filter((k) => k !== NONE_KEY)
        .sort((a, b) => a.localeCompare(b, "vi")),
      NONE_KEY,
    ];

  const groups: Group[] = [];
  for (const key of order) {
    const r = map.get(key);
    if (r?.length) groups.push({ key, label: labelFor(key), rows: r });
  }
  for (const [key, r] of map) {
    if (!groups.some((g) => g.key === key))
      groups.push({ key, label: labelFor(key), rows: r });
  }
  return groups;
}

export function DocumentListView({
  documents,
  groupBy,
  profiles,
  offices,
  pendingRecipientsByDoc,
  isDocumentManager,
  canManage,
  onOpen,
  onPatch,
  onHandoff,
  onDelete,
}: {
  documents: DocumentRecord[];
  groupBy: DocumentGroupBy;
  profiles: Profile[];
  offices: Office[];
  pendingRecipientsByDoc: Map<string, string[]>;
  isDocumentManager: (userId: string) => boolean;
  canManage: boolean;
  onOpen: (doc: DocumentRecord) => void;
  onPatch: (id: string, patch: DocumentPatch) => void;
  onHandoff: (doc: DocumentRecord) => void;
  onDelete: (doc: DocumentRecord) => void;
}) {
  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const officeById = useMemo(
    () => new Map(offices.map((o) => [o.id, o])),
    [offices],
  );

  const rows = useMemo<Row[]>(
    () =>
      documents.map((doc) => {
        const pendingIds = pendingRecipientsByDoc.get(doc.id) ?? [];
        const finalReceiverId =
          doc.delivered_to && !isDocumentManager(doc.delivered_to)
            ? doc.delivered_to
            : null;
        return {
          doc,
          flowStatus: getDocumentFlowStatus(
            doc,
            pendingRecipientsByDoc.has(doc.id),
            isDocumentManager,
          ),
          pendingRecipientNames: pendingIds
            .map((id) => {
              const p = profileById.get(id);
              return p ? (p.full_name ?? p.email) : null;
            })
            .filter((n): n is string => Boolean(n)),
          finalReceiverId,
        };
      }),
    [documents, pendingRecipientsByDoc, isDocumentManager, profileById],
  );

  const groups = useMemo(
    () => buildGroups(rows, groupBy, offices),
    [rows, groupBy, offices],
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const showStatus = groupBy !== "status";

  const template = [
    "110px", // Mã hồ sơ
    "minmax(240px,1.6fr)", // Tiêu đề
    showStatus ? "150px" : null, // Trạng thái
    "120px", // Ưu tiên
    "150px", // Loại hồ sơ
    "56px", // SL
    "110px", // Ngày tiếp nhận
    "180px", // Người nhận dự kiến
    "160px", // Đang giữ
    "170px", // Người nhận / Ngày nhận
    "44px", // actions
  ]
    .filter(Boolean)
    .join(" ");
  const gridStyle = { gridTemplateColumns: template };

  const canHandoff = (doc: DocumentRecord) =>
    canManage && !NON_HANDOFFABLE_DOCUMENT_STATUSES.has(doc.status);

  const renderGroupHeader = (g: Group) => {
    const isCollapsed = collapsed.has(g.key);
    const accent = groupAccent(groupBy, g.key);
    const received = g.rows.filter((r) => r.flowStatus === "received").length;
    return (
      <button
        onClick={() => toggle(g.key)}
        className={cn(
          "flex w-full items-center gap-2 border-b px-3 py-2.5 text-left transition sm:gap-2.5",
          accent.bar,
        )}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        )}
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accent.dot)} />
        <span className="min-w-0 truncate text-sm font-bold uppercase tracking-wide">
          {g.label}
        </span>
        <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-semibold">
          {g.rows.length} hồ sơ
        </span>
        {groupBy !== "status" && (
          <span className="ml-auto flex shrink-0 items-center gap-2 text-xs font-medium">
            <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-black/10 sm:block">
              <span
                className="block h-full rounded-full bg-current opacity-50"
                style={{
                  width: `${Math.round((received / g.rows.length) * 100)}%`,
                }}
              />
            </span>
            {received}/{g.rows.length} đã nhận
          </span>
        )}
      </button>
    );
  };

  const actionsMenu = (doc: DocumentRecord, className?: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", className)}
          aria-label="Thao tác"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onOpen(doc)}>
          <PanelRightOpen className="h-4 w-4" /> Mở chi tiết
        </DropdownMenuItem>
        {canHandoff(doc) && (
          <DropdownMenuItem onClick={() => onHandoff(doc)}>
            <Send className="h-4 w-4" /> Bàn giao
          </DropdownMenuItem>
        )}
        {canManage && (
          <DropdownMenuItem
            onClick={() => onDelete(doc)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="h-4 w-4" /> Xoá
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <datalist id={CATEGORY_LIST_ID}>
        {DOCUMENT_CATEGORY_SUGGESTIONS.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      {/* ── Phone: one card per document, tap to open the detail panel ── */}
      <div className="space-y-3 md:hidden">
        {groups.map((g) => {
          const accent = groupAccent(groupBy, g.key);
          return (
            <div
              key={g.key}
              className={cn(
                "overflow-hidden rounded-lg border bg-card",
                groupBy !== "none" && cn("border-l-4", accent.border),
              )}
            >
              {groupBy !== "none" && renderGroupHeader(g)}
              {!collapsed.has(g.key) && (
                <div className="divide-y">
                  {g.rows.map((r) => (
                    <MobileDocumentRow
                      key={r.doc.id}
                      row={r}
                      office={
                        r.doc.current_office_id
                          ? officeById.get(r.doc.current_office_id)
                          : undefined
                      }
                      intendedRecipient={
                        r.doc.intended_recipient_id
                          ? profileById.get(r.doc.intended_recipient_id)
                          : undefined
                      }
                      holder={
                        r.doc.current_holder_id
                          ? profileById.get(r.doc.current_holder_id)
                          : undefined
                      }
                      onOpen={() => onOpen(r.doc)}
                      actions={actionsMenu(r.doc, "h-8 w-8")}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Desktop: full table with inline editing ── */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <div className="min-w-[1450px]">
          <div
            className="grid items-center gap-x-3 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground"
            style={gridStyle}
          >
            <span className="truncate">Mã hồ sơ</span>
            <span className="truncate">Tiêu đề</span>
            {showStatus && <span className="truncate">Trạng thái</span>}
            <span className="truncate">Ưu tiên</span>
            <span className="truncate">Loại hồ sơ</span>
            <span className="truncate">SL</span>
            <span className="truncate">Ngày tiếp nhận</span>
            <span className="truncate">Người nhận dự kiến</span>
            <span className="truncate">Đang giữ</span>
            <span className="truncate">Người nhận / Ngày nhận</span>
            <span />
          </div>

          {groups.map((g) => {
            const accent = groupAccent(groupBy, g.key);
            return (
              <div
                key={g.key}
                className={cn(groupBy !== "none" && cn("border-l-4", accent.border))}
              >
                {groupBy !== "none" && renderGroupHeader(g)}
                {!collapsed.has(g.key) &&
                  g.rows.map((r) => {
                    const doc = r.doc;
                    const office = doc.current_office_id
                      ? officeById.get(doc.current_office_id)
                      : undefined;
                    const holder = doc.current_holder_id
                      ? profileById.get(doc.current_holder_id)
                      : undefined;
                    const finalReceiver = r.finalReceiverId
                      ? profileById.get(r.finalReceiverId)
                      : undefined;
                    return (
                      <div
                        key={doc.id}
                        className="grid items-center gap-x-3 border-b px-4 py-2 last:border-0 hover:bg-muted/30"
                        style={gridStyle}
                      >
                        <button
                          onClick={() => onOpen(doc)}
                          className="truncate text-left font-mono text-xs font-semibold text-primary hover:underline"
                          title={doc.title}
                        >
                          {doc.code}
                        </button>

                        <div className="min-w-0">
                          <EditableTitle
                            value={doc.title}
                            onOpen={() => onOpen(doc)}
                            onRename={(title) => onPatch(doc.id, { title })}
                            disabled={!canManage}
                          />
                        </div>

                        {showStatus && (
                          <div className="min-w-0">
                            <DocumentFlowStatusBadge
                              status={r.flowStatus}
                              office={office}
                              recipientNames={r.pendingRecipientNames}
                            />
                          </div>
                        )}

                        <div className="min-w-0">
                          {canManage ? (
                            <InlineSelectCell
                              value={doc.priority}
                              options={PRIORITY_OPTIONS}
                              allowEmpty={false}
                              onChange={(v) =>
                                v &&
                                onPatch(doc.id, { priority: v as TaskPriority })
                              }
                            />
                          ) : (
                            <Pill
                              label={DOCUMENT_PRIORITY_META[doc.priority].label}
                              className={DOCUMENT_PRIORITY_META[doc.priority].badge}
                            />
                          )}
                        </div>

                        <div className="min-w-0">
                          <InlineTextCell
                            value={doc.category}
                            listId={CATEGORY_LIST_ID}
                            onChange={(category) => onPatch(doc.id, { category })}
                            disabled={!canManage}
                          />
                        </div>

                        <InlineNumberCell
                          value={doc.quantity}
                          onChange={(quantity) => onPatch(doc.id, { quantity })}
                          disabled={!canManage}
                        />

                        <InlineDateCell
                          value={doc.received_at}
                          label={formatDate(doc.received_at)}
                          onChange={(iso) =>
                            iso && onPatch(doc.id, { received_at: iso })
                          }
                          disabled={!canManage}
                        />

                        <div className="min-w-0">
                          <RecipientPickerCell
                            value={doc.intended_recipient_id}
                            profiles={profiles}
                            offices={offices}
                            onChange={(id) =>
                              onPatch(doc.id, { intended_recipient_id: id })
                            }
                            disabled={!canManage}
                          />
                        </div>

                        <div className="min-w-0">
                          <PersonInline profile={holder} />
                        </div>

                        <div className="min-w-0 text-xs">
                          {finalReceiver ? (
                            <>
                              <PersonInline profile={finalReceiver} />
                              {doc.delivered_at && (
                                <p className="pl-6 text-[11px] text-muted-foreground">
                                  {formatDate(doc.delivered_at)}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>

                        {actionsMenu(doc)}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function PersonInline({ profile }: { profile?: Profile }) {
  if (!profile) return <span className="text-xs text-muted-foreground">—</span>;
  const name = profile.full_name ?? profile.email;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      <Avatar className="h-5 w-5 shrink-0">
        {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={name} />}
        <AvatarFallback className="text-[9px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

function MobileDocumentRow({
  row,
  office,
  intendedRecipient,
  holder,
  onOpen,
  actions,
}: {
  row: Row;
  office?: Office;
  intendedRecipient?: Profile;
  holder?: Profile;
  onOpen: () => void;
  actions: React.ReactNode;
}) {
  const doc = row.doc;
  const priority = DOCUMENT_PRIORITY_META[doc.priority];
  return (
    <div className="flex items-start gap-2 px-3 py-3 active:bg-muted/40">
      <button onClick={onOpen} className="min-w-0 flex-1 space-y-1.5 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-primary">
            {doc.code}
          </span>
          <DocumentFlowStatusBadge
            status={row.flowStatus}
            office={office}
            recipientNames={row.pendingRecipientNames}
          />
          <Pill label={priority.label} className={priority.badge} />
          {doc.category && (
            <span className="max-w-[45%] truncate rounded border px-1.5 py-0.5 text-[11px]">
              {doc.category}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-[15px] font-medium leading-snug">
          {doc.title}
        </p>
        <p className="text-xs text-muted-foreground">
          Tiếp nhận {formatDate(doc.received_at)} · SL {doc.quantity}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            Dự kiến:{" "}
            <span className="font-medium text-foreground">
              {intendedRecipient
                ? (intendedRecipient.full_name ?? intendedRecipient.email)
                : "—"}
            </span>
          </span>
          <span className="flex items-center gap-1">
            Đang giữ:{" "}
            <span className="font-medium text-foreground">
              {holder ? (holder.full_name ?? holder.email) : "—"}
            </span>
          </span>
        </div>
      </button>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}
