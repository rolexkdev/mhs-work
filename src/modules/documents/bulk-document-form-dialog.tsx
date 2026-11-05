"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_PRIORITY_META,
  DOCUMENT_PRIORITY_ORDER,
  DOCUMENT_CATEGORY_SUGGESTIONS,
} from "@/modules/documents/constants";
import { useCreateDocuments } from "@/modules/documents/hooks";
import { useOffices } from "@/modules/documents/office-hooks";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMe } from "@/modules/meetings/item-hooks";
import type { TaskPriority } from "@/types/database";

const NO_OFFICE = "__none__";
const NO_RECEIVER = "__no_receiver__";
const INITIAL_ROW_COUNT = 5;
const MAX_ROWS = 50;
const BULK_CATEGORY_DATALIST_ID = "bulk-doc-category-suggestions";

interface BulkDocumentRow {
  key: string;
  title: string;
  receiverId: string;
  category: string;
  quantity: string;
  note: string;
}

interface ReceiverOption {
  id: string;
  label: string;
  officeCode: string | null;
}

function ReceiverSelect({
  value,
  onChange,
  options,
  placeholder = "Chưa chọn",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReceiverOption[];
  placeholder?: string;
  className?: string;
}) {
  // Radix Select cannot hold an empty value, so "no receiver" uses a sentinel.
  return (
    <Select
      value={value || NO_RECEIVER}
      onValueChange={(v) => onChange(v === NO_RECEIVER ? "" : v)}
    >
      <SelectTrigger className={cn("h-10", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_RECEIVER}>
          <span className="text-muted-foreground">{placeholder}</span>
        </SelectItem>
        {options.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            Không có người nhận khả dụng
          </div>
        ) : (
          options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              <span>{opt.label}</span>
              {opt.officeCode && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  · {opt.officeCode}
                </span>
              )}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

/** Local calendar date (YYYY-MM-DD) of a timestamp. */
function toLocalDateInput(iso?: string | null): string {
  return new Date(iso ?? Date.now()).toLocaleDateString("sv-SE");
}

function isRowEmpty(row: BulkDocumentRow): boolean {
  return !row.title.trim() && !row.category.trim() && !row.note.trim();
}

function isRowInvalid(row: BulkDocumentRow): boolean {
  return !isRowEmpty(row) && !row.title.trim();
}

function isRowValid(row: BulkDocumentRow): boolean {
  return !isRowEmpty(row) && Boolean(row.title.trim());
}

export function BulkDocumentFormDialog({
  open,
  onOpenChange,
  defaultOfficeId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultOfficeId?: string | null;
}) {
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();
  const { data: offices = [] } = useOffices();
  const createDocuments = useCreateDocuments();

  const keyCounterRef = useRef(0);
  const makeRow = (
    overrides?: Partial<Omit<BulkDocumentRow, "key">>,
  ): BulkDocumentRow => {
    keyCounterRef.current += 1;
    return {
      key: `bulk-row-${keyCounterRef.current}`,
      title: overrides?.title ?? "",
      receiverId: overrides?.receiverId ?? "",
      category: overrides?.category ?? "",
      quantity: overrides?.quantity ?? "1",
      note: overrides?.note ?? "",
    };
  };

  const [receivedDate, setReceivedDate] = useState("");
  const [originOfficeId, setOriginOfficeId] = useState<string>(NO_OFFICE);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [defaultReceiverId, setDefaultReceiverId] = useState("");
  const [rows, setRows] = useState<BulkDocumentRow[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  useEffect(() => {
    if (!open) return;
    setReceivedDate(toLocalDateInput());
    setOriginOfficeId(defaultOfficeId ?? NO_OFFICE);
    setPriority("medium");
    setDefaultReceiverId("");
    setRows(Array.from({ length: INITIAL_ROW_COUNT }, () => makeRow()));
    setPasteOpen(false);
    setPasteText("");
  }, [open, defaultOfficeId]);

  const officeById = useMemo(
    () => new Map(offices.map((o) => [o.id, o])),
    [offices],
  );

  const candidateProfiles = useMemo(
    () => profiles.filter((p) => p.id !== me?.id),
    [profiles, me?.id],
  );

  const receiverOptions = useMemo<ReceiverOption[]>(() => {
    const items = candidateProfiles.map((p) => {
      const office = p.office_id ? officeById.get(p.office_id) : undefined;
      return {
        id: p.id,
        label: p.full_name ?? p.email,
        officeCode: office?.code ?? null,
      };
    });
    items.sort((a, b) => {
      const officeA = a.officeCode ?? "\uffff";
      const officeB = b.officeCode ?? "\uffff";
      const officeCmp = officeA.localeCompare(officeB, "vi");
      if (officeCmp !== 0) return officeCmp;
      return a.label.localeCompare(b.label, "vi");
    });
    return items;
  }, [candidateProfiles, officeById]);

  const validRows = useMemo(() => rows.filter(isRowValid), [rows]);
  const invalidRowCount = useMemo(
    () => rows.filter(isRowInvalid).length,
    [rows],
  );
  const hasUnassignedRow = useMemo(
    () => rows.some((r) => !r.receiverId),
    [rows],
  );

  const canSubmit = validRows.length > 0 && invalidRowCount === 0;

  const missingHint = useMemo(() => {
    if (invalidRowCount > 0) {
      return `Có ${invalidRowCount} dòng thiếu tiêu đề.`;
    }
    if (validRows.length === 0) {
      return "Vui lòng nhập ít nhất 1 hồ sơ.";
    }
    return null;
  }, [invalidRowCount, validRows.length]);

  const pending = createDocuments.isPending;

  function updateRow(
    key: string,
    patch: Partial<Omit<BulkDocumentRow, "key">>,
  ) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(key: string) {
    setRows((prev) => {
      if (prev.length <= 1) {
        return [makeRow({ receiverId: defaultReceiverId })];
      }
      return prev.filter((r) => r.key !== key);
    });
  }

  function addRow() {
    setRows((prev) => {
      if (prev.length >= MAX_ROWS) return prev;
      return [...prev, makeRow({ receiverId: defaultReceiverId })];
    });
  }

  function applyDefaultReceiverToEmptyRows() {
    if (!defaultReceiverId) return;
    setRows((prev) =>
      prev.map((r) =>
        r.receiverId ? r : { ...r, receiverId: defaultReceiverId },
      ),
    );
  }

  function matchProfileByReceiverText(raw: string): string | null {
    const needle = raw.trim().toLowerCase();
    if (!needle) return null;
    const emailMatches = candidateProfiles.filter(
      (p) => p.email.trim().toLowerCase() === needle,
    );
    if (emailMatches.length === 1) return emailMatches[0].id;
    const nameMatches = candidateProfiles.filter(
      (p) => (p.full_name ?? "").trim().toLowerCase() === needle,
    );
    if (nameMatches.length === 1) return nameMatches[0].id;
    return null;
  }

  function handlePasteRows() {
    const rawLines = pasteText
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "");
    if (rawLines.length === 0) return;

    let unmatchedReceiverCount = 0;
    const parsed: BulkDocumentRow[] = rawLines.map((line) => {
      const cols = line.split("\t");
      const title = (cols[0] ?? "").trim();
      const category = (cols[1] ?? "").trim();
      const rawQty = (cols[2] ?? "").trim();
      const rawReceiver = (cols[3] ?? "").trim();
      const note = cols.slice(4).join(" ").trim();
      const numQty = Number(rawQty);
      const quantity =
        rawQty !== "" && Number.isFinite(numQty) && numQty >= 1
          ? String(Math.floor(numQty))
          : "1";
      const matchedReceiverId = matchProfileByReceiverText(rawReceiver);
      if (rawReceiver && !matchedReceiverId) {
        unmatchedReceiverCount += 1;
      }
      const receiverId = matchedReceiverId ?? defaultReceiverId;
      return makeRow({ title, receiverId, category, quantity, note });
    });

    let queueIdx = 0;
    const replaced = rows.map((r) => {
      if (isRowEmpty(r) && queueIdx < parsed.length) {
        const item = parsed[queueIdx];
        queueIdx += 1;
        return item;
      }
      return r;
    });

    const remaining = parsed.slice(queueIdx);
    const availableSlots = Math.max(0, MAX_ROWS - replaced.length);
    const appended = remaining.slice(0, availableSlots);
    const droppedCount = remaining.length - appended.length;

    setRows([...replaced, ...appended]);
    setPasteText("");
    setPasteOpen(false);

    if (unmatchedReceiverCount > 0) {
      toast.warning(
        `Không khớp người nhận ở ${unmatchedReceiverCount} dòng, vui lòng chọn lại.`,
      );
    }

    if (droppedCount > 0) {
      toast.warning(
        `Đã đạt giới hạn ${MAX_ROWS} dòng, bỏ qua ${droppedCount} dòng vượt quá.`,
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || pending) return;

    const receivedAt = receivedDate
      ? new Date(`${receivedDate}T00:00:00`).toISOString()
      : null;
    const officeId = originOfficeId === NO_OFFICE ? null : originOfficeId;

    // Creating documents never hands them off: the intended recipient is only
    // recorded so intake staff know who the document is ultimately for.
    const payloads = validRows.map((row) => ({
      title: row.title.trim(),
      category: row.category.trim() || null,
      quantity: Math.max(1, Math.floor(Number(row.quantity)) || 1),
      description: row.note.trim() || null,
      origin_office_id: officeId,
      intended_recipient_id: row.receiverId || null,
      priority,
      received_at: receivedAt,
    }));

    try {
      const created = await createDocuments.mutateAsync(payloads);
      toast.success(`Đã tạo ${created.length} hồ sơ`);
    } catch {
      return;
    }
    onOpenChange(false);
  }

  const atRowLimit = rows.length >= MAX_ROWS;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) onOpenChange(v);
      }}
    >
      <DialogContent className="flex h-[94dvh] max-h-[94dvh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:h-[92dvh] sm:max-h-[92dvh] sm:w-[min(96vw,1400px)] sm:max-w-[min(96vw,1400px)] sm:p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3.5 sm:px-6 sm:py-4">
          <DialogTitle className="text-lg">Tiếp nhận nhiều hồ sơ</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Nhập danh sách hồ sơ cùng tiếp nhận. Người nhận dự kiến chỉ để ghi chú,
            hồ sơ chưa được bàn giao khi tạo.
          </p>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-5">
            {/* Shared fields */}
            <div className="grid gap-4 pt-4 sm:grid-cols-3 sm:pt-5">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-doc-received">Ngày tiếp nhận hồ sơ</Label>
                <Input
                  id="bulk-doc-received"
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="h-10 sm:h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Văn phòng khởi tạo</Label>
                <Select
                  value={originOfficeId}
                  onValueChange={setOriginOfficeId}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Chọn văn phòng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_OFFICE}>
                      Theo văn phòng của tôi
                    </SelectItem>
                    {offices.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.code} — {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Độ ưu tiên</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as TaskPriority)}
                >
                  <SelectTrigger className="h-10">
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
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Người nhận dự kiến mặc định</Label>
                {defaultReceiverId && (
                  <button
                    type="button"
                    onClick={() => setDefaultReceiverId("")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Bỏ chọn
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <ReceiverSelect
                    value={defaultReceiverId}
                    onChange={setDefaultReceiverId}
                    options={receiverOptions}
                    placeholder="Không chọn"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!defaultReceiverId || !hasUnassignedRow}
                  onClick={applyDefaultReceiverToEmptyRows}
                  className="h-10 shrink-0"
                >
                  Áp dụng cho các dòng chưa chọn
                </Button>
              </div>
            </div>

            {/* Rows section */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm font-semibold">
                  Danh sách hồ sơ ({validRows.length}/{rows.length})
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPasteOpen((v) => !v)}
                  className="h-8 gap-1.5 text-xs"
                >
                  {pasteOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Dán từ Excel
                </Button>
              </div>

              {pasteOpen && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Dán các dòng từ Excel (các cột cách nhau bằng phím TAB theo
                    thứ tự:{" "}
                    <span className="font-medium text-foreground">
                      Tiêu đề · Loại hồ sơ · Số lượng · Người nhận dự kiến · Ghi chú
                    </span>
                    ).
                  </p>
                  <Textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={
                      "Công văn về việc phê duyệt...\tCông văn đến\t2\tNguyễn Văn A\tBản chính\nTờ trình kinh phí...\tTờ trình\t1\tbinh@company.com\t"
                    }
                    className="min-h-[88px] font-mono text-xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!pasteText.trim()}
                      onClick={handlePasteRows}
                    >
                      Thêm vào danh sách
                    </Button>
                  </div>
                </div>
              )}

              <datalist id={BULK_CATEGORY_DATALIST_ID}>
                {DOCUMENT_CATEGORY_SUGGESTIONS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              {/* Desktop table */}
              <div className="hidden rounded-lg border md:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 border-b bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="w-11 rounded-tl-lg px-3 py-2.5 text-center font-medium">
                        #
                      </th>
                      <th className="min-w-[220px] px-3 py-2.5 text-left font-medium">
                        Tiêu đề *
                      </th>
                      <th className="w-64 px-3 py-2.5 text-left font-medium">
                        Người nhận dự kiến
                      </th>
                      <th className="w-44 px-3 py-2.5 text-left font-medium">
                        Loại hồ sơ
                      </th>
                      <th className="w-24 px-3 py-2.5 text-left font-medium">
                        Số lượng
                      </th>
                      <th className="w-60 min-w-[14rem] px-3 py-2.5 text-left font-medium">
                        Ghi chú
                      </th>
                      <th className="w-12 rounded-tr-lg px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row, index) => {
                      const empty = isRowEmpty(row);
                      const missingTitle = !empty && !row.title.trim();
                      return (
                        <tr key={row.key} className="align-top">
                          <td className="px-3 py-2.5 text-center text-xs leading-10 text-muted-foreground">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              value={row.title}
                              onChange={(e) =>
                                updateRow(row.key, { title: e.target.value })
                              }
                              placeholder="Nhập tiêu đề hồ sơ..."
                              className={cn(
                                "h-10 sm:h-10",
                                missingTitle &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <ReceiverSelect
                              value={row.receiverId}
                              onChange={(v) =>
                                updateRow(row.key, { receiverId: v })
                              }
                              options={receiverOptions}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              list={BULK_CATEGORY_DATALIST_ID}
                              value={row.category}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  category: e.target.value,
                                })
                              }
                              placeholder="Loại hồ sơ..."
                              className="h-10 sm:h-10"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              value={row.quantity}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  quantity: e.target.value,
                                })
                              }
                              className="h-10 sm:h-10"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              value={row.note}
                              onChange={(e) =>
                                updateRow(row.key, { note: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  !e.nativeEvent.isComposing &&
                                  index === rows.length - 1 &&
                                  !atRowLimit
                                ) {
                                  e.preventDefault();
                                  addRow();
                                }
                              }}
                              placeholder="Ghi chú..."
                              className="h-10 sm:h-10"
                            />
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRow(row.key)}
                              className="h-10 w-10 text-muted-foreground hover:text-destructive"
                              aria-label="Xoá dòng"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacked cards */}
              <div className="space-y-3 md:hidden">
                {rows.map((row, index) => {
                  const empty = isRowEmpty(row);
                  const missingTitle = !empty && !row.title.trim();
                  return (
                    <div
                      key={row.key}
                      className="space-y-2.5 rounded-lg border bg-background p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Hồ sơ #{index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(row.key)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label="Xoá dòng"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Tiêu đề *</Label>
                        <Input
                          value={row.title}
                          onChange={(e) =>
                            updateRow(row.key, { title: e.target.value })
                          }
                          placeholder="Nhập tiêu đề hồ sơ..."
                          className={cn(
                            missingTitle &&
                              "border-destructive focus-visible:ring-destructive",
                          )}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Người nhận dự kiến</Label>
                        <ReceiverSelect
                          value={row.receiverId}
                          onChange={(v) =>
                            updateRow(row.key, { receiverId: v })
                          }
                          options={receiverOptions}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Loại hồ sơ</Label>
                          <Input
                            list={BULK_CATEGORY_DATALIST_ID}
                            value={row.category}
                            onChange={(e) =>
                              updateRow(row.key, { category: e.target.value })
                            }
                            placeholder="Loại hồ sơ..."
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Số lượng</Label>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={row.quantity}
                            onChange={(e) =>
                              updateRow(row.key, { quantity: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Ghi chú</Label>
                        <Input
                          value={row.note}
                          onChange={(e) =>
                            updateRow(row.key, { note: e.target.value })
                          }
                          placeholder="Ghi chú..."
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRow}
                    disabled={atRowLimit}
                  >
                    <Plus className="h-3.5 w-3.5" /> Thêm dòng
                  </Button>
                  {atRowLimit && (
                    <span className="text-xs text-amber-600">
                      Đã đạt tối đa {MAX_ROWS} dòng mỗi lần tạo.
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tệp đính kèm có thể tải lên sau trong trang chi tiết từng hồ
                  sơ.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t bg-muted/30 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="text-xs text-amber-600">{missingHint}</div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={pending || !canSubmit}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending
                  ? "Đang lưu..."
                  : `Tạo ${validRows.length} hồ sơ`}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
