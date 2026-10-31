"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, ClipboardPaste, Copy, Sparkles } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  looksLikeMarkdown,
  parseMarkdown,
  parseMinutesFile,
  parsePastedText,
  type ParsedItem,
  type ParsedMinutes,
} from "@/modules/meetings/parse-minutes";
import { MINUTES_PROMPT } from "@/modules/meetings/minutes-prompt";
import { useAddMeetingItems } from "@/modules/meetings/item-hooks";
import { useCreateMeeting, useUpdateMeeting } from "@/modules/meetings/hooks";
import { createClient } from "@/lib/supabase/client";
import type { Meeting } from "@/types/database";

function toLocalInput(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function defaultTitle(d: Date): string {
  return `Giao ban ngày ${d.toLocaleDateString("vi-VN")}`;
}

/**
 * Nhập đầu mục từ biên bản: tải file .docx (tự lấy bảng tổng hợp nhiệm vụ)
 * hoặc dán bảng copy từ Word/Excel. Xem trước, bỏ chọn dòng thừa rồi thêm.
 *
 * - Có `meeting`: thêm đầu mục vào cuộc họp đó.
 * - Không có `meeting`: tạo cuộc họp mới (tên, thời gian, toàn văn biên bản)
 *   cùng các đầu mục, rồi mở trang chi tiết.
 */
export function ImportItemsDialog({
  open,
  onOpenChange,
  meeting,
  canEditMeeting = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meeting?: Meeting | null;
  /** Chỉ leader/admin sửa được cuộc họp → mới cho lưu toàn văn biên bản. */
  canEditMeeting?: boolean;
}) {
  const router = useRouter();
  const isCreate = !meeting;
  const addItems = useAddMeetingItems();
  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState("docx");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fullText, setFullText] = useState<string | null>(null);
  const [saveText, setSaveText] = useState(true);
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState(false);
  // Chỉ dùng khi tạo cuộc họp mới
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab("docx");
    setItems([]);
    setPicked([]);
    setFileName(null);
    setFullText(null);
    setPasted("");
    setSaveText(!meeting?.description);
    const now = new Date();
    setTitle(defaultTitle(now));
    setDate(toLocalInput(now));
  }, [open, meeting?.description]);

  function show(next: ParsedItem[]) {
    setItems(next);
    setPicked(next.map(() => true));
  }

  /** Đổ kết quả đọc biên bản (docx / markdown) vào form. */
  function apply(parsed: ParsedMinutes, fallbackDate: Date | null) {
    setFullText(parsed.text);
    show(parsed.items);
    if (!isCreate) return;
    // Ngày họp: ghi trong biên bản, không có thì lấy ngày sửa file
    const d = parsed.date ?? fallbackDate;
    if (d) setDate(toLocalInput(d));
    // Tên: frontmatter "title" của markdown; docx thì đặt theo ngày họp
    const mdTitle = parsed.title && !/biên bản/i.test(parsed.title) ? parsed.title : null;
    setTitle(mdTitle ?? defaultTitle(d ?? new Date()));
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(MINUTES_PROMPT);
      toast.success("Đã copy prompt — dán vào Claude/ChatGPT kèm file Word");
    } catch {
      toast.error("Không copy được, hãy mở file mẫu để lấy prompt");
    }
  }

  async function handleFile(file: File) {
    setReading(true);
    try {
      const parsed = await parseMinutesFile(file);
      setFileName(file.name);
      apply(parsed, file.lastModified ? new Date(file.lastModified) : null);
      if (!parsed.items.length)
        toast.error("Không tìm thấy bảng nhiệm vụ trong biên bản");
    } catch (e) {
      toast.error((e as Error).message || "Không đọc được file");
    } finally {
      setReading(false);
    }
  }

  const count = picked.filter(Boolean).length;
  const pending =
    addItems.isPending || createMeeting.isPending || updateMeeting.isPending;
  const withText = canEditMeeting && saveText && !!fullText;

  async function handleSubmit() {
    const chosen = items.filter((_, i) => picked[i]);
    if (isCreate) {
      if (!title.trim()) return;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const created = await createMeeting.mutateAsync({
        title: title.trim(),
        description: withText ? fullText : null,
        meeting_date: date ? new Date(date).toISOString() : new Date().toISOString(),
        created_by: user.id,
      });
      if (chosen.length)
        await addItems.mutateAsync({ meetingId: created.id, items: chosen });
      onOpenChange(false);
      router.push(`/meetings/${created.id}`);
      return;
    }

    if (!chosen.length) return;
    await addItems.mutateAsync({ meetingId: meeting.id, items: chosen });
    if (withText) {
      await updateMeeting.mutateAsync({ id: meeting.id, description: fullText });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {isCreate ? "Tạo cuộc họp từ biên bản" : "Nhập đầu mục từ biên bản"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Mỗi đầu mục sẽ tạo thành 1 công việc giao theo phòng phụ trách, các
            anh chị tự cập nhật tiến độ.
          </p>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Cách nhanh: nhờ AI chuyển file Word sang markdown chuẩn */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> Cách nhanh từ file
              Word
            </p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-muted-foreground">
              <li>Copy prompt mẫu, dán vào Claude/ChatGPT kèm file Word biên bản.</li>
              <li>Copy markdown AI trả về → dán vào tab “Dán markdown”.</li>
              <li>Xem trước, bỏ chọn dòng thừa rồi tạo.</li>
            </ol>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Button type="button" size="sm" variant="outline" onClick={copyPrompt}>
                <Copy className="h-3.5 w-3.5" /> Copy prompt mẫu
              </Button>
              <a
                href="/mau-bien-ban-giao-ban.md"
                download
                className="text-xs font-medium text-primary hover:underline"
              >
                File mẫu .md
              </a>
              <a
                href="/mau-bien-ban-giao-ban.docx"
                download
                className="text-xs font-medium text-primary hover:underline"
              >
                File mẫu .docx
              </a>
            </div>
          </div>

          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v);
              setFullText(null);
              show([]);
            }}
          >
            <TabsList>
              <TabsTrigger value="docx">
                <FileUp className="mr-1.5 h-4 w-4" /> Tải file
              </TabsTrigger>
              <TabsTrigger value="paste">
                <ClipboardPaste className="mr-1.5 h-4 w-4" /> Dán markdown
              </TabsTrigger>
            </TabsList>

            <TabsContent value="docx" className="space-y-3">
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.md,.markdown,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed py-6 text-sm text-muted-foreground hover:bg-muted/40"
              >
                <FileUp className="h-6 w-6" />
                {reading
                  ? "Đang đọc..."
                  : fileName ?? "Chọn file biên bản (.md hoặc .docx)"}
                <span className="text-xs">
                  Tự lấy bảng nhiệm vụ (Hạng mục · Nội dung · Đơn vị · Thời
                  hạn)
                </span>
              </button>
            </TabsContent>

            <TabsContent value="paste" className="space-y-2">
              <Textarea
                value={pasted}
                onChange={(e) => {
                  const v = e.target.value;
                  setPasted(v);
                  if (looksLikeMarkdown(v)) {
                    apply(parseMarkdown(v), null);
                  } else {
                    setFullText(null);
                    show(parsePastedText(v));
                  }
                }}
                placeholder={
                  "Dán markdown biên bản (kết quả AI trả về) vào đây.\nHoặc dán bảng copy từ Word/Excel, hoặc gõ mỗi dòng 1 đầu mục."
                }
                className="min-h-[160px] font-mono text-xs"
              />
            </TabsContent>
          </Tabs>

          {fullText && canEditMeeting && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveText}
                onChange={(e) => setSaveText(e.target.checked)}
              />
              Lưu toàn văn biên bản vào nội dung cuộc họp
            </label>
          )}

          {isCreate && (
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="im-title">Tên cuộc họp *</Label>
                <Input
                  id="im-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="im-date">Thời gian họp</Label>
                <Input
                  id="im-date"
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  Xem trước — chọn {count}/{items.length} đầu mục
                </span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    setPicked(items.map(() => count !== items.length))
                  }
                >
                  {count === items.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
              </div>
              <ul className="divide-y rounded-lg border">
                {items.map((it, i) => (
                  <li key={i}>
                    <label
                      className={cn(
                        "flex cursor-pointer gap-3 px-3 py-2.5 text-sm",
                        !picked[i] && "opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={picked[i] ?? false}
                        onChange={(e) =>
                          setPicked((p) =>
                            p.map((v, j) => (j === i ? e.target.checked : v)),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        {it.title && (
                          <p className="font-medium">{it.title}</p>
                        )}
                        <p className="whitespace-pre-wrap text-muted-foreground">
                          {it.content}
                        </p>
                        {(it.department || it.deadline) && (
                          <p className="text-xs text-muted-foreground">
                            {it.department && <>👥 {it.department}</>}
                            {it.department && it.deadline && " · "}
                            {it.deadline && <>⏰ {it.deadline}</>}
                          </p>
                        )}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || (isCreate ? !title.trim() : !count)}
          >
            {pending
              ? "Đang lưu..."
              : isCreate
                ? `Tạo cuộc họp${count ? ` + ${count} công việc` : ""}`
                : `Tạo ${count} công việc`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
