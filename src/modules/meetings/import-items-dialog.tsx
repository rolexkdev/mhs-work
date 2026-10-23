"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, ClipboardPaste } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  parseDocx,
  parsePastedText,
  type ParsedItem,
} from "@/modules/meetings/parse-minutes";
import { useAddMeetingItems } from "@/modules/meetings/item-hooks";
import { useUpdateMeeting } from "@/modules/meetings/hooks";
import type { Meeting } from "@/types/database";

/**
 * Nhập đầu mục cho cuộc họp: tải file biên bản .docx (tự lấy bảng tổng hợp
 * nhiệm vụ) hoặc dán bảng copy từ Word/Excel. Xem trước, bỏ chọn dòng thừa
 * rồi mới thêm.
 */
export function ImportItemsDialog({
  open,
  onOpenChange,
  meeting,
  canEditMeeting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meeting: Meeting;
  /** Chỉ leader/admin sửa được cuộc họp → mới cho lưu toàn văn biên bản. */
  canEditMeeting: boolean;
}) {
  const addItems = useAddMeetingItems(meeting.id);
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

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setPicked([]);
    setFileName(null);
    setFullText(null);
    setPasted("");
    setSaveText(!meeting.description);
  }, [open, meeting.description]);

  function show(next: ParsedItem[]) {
    setItems(next);
    setPicked(next.map(() => true));
  }

  async function handleFile(file: File) {
    setReading(true);
    try {
      const parsed = await parseDocx(file);
      setFileName(file.name);
      setFullText(parsed.text);
      show(parsed.items);
      if (!parsed.items.length)
        toast.error("Không tìm thấy bảng nhiệm vụ trong biên bản");
    } catch (e) {
      toast.error((e as Error).message || "Không đọc được file");
    } finally {
      setReading(false);
    }
  }

  const count = picked.filter(Boolean).length;

  async function handleSubmit() {
    const chosen = items.filter((_, i) => picked[i]);
    if (!chosen.length) return;
    await addItems.mutateAsync(chosen);
    if (tab === "docx" && canEditMeeting && saveText && fullText) {
      await updateMeeting.mutateAsync({ id: meeting.id, description: fullText });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Nhập đầu mục từ biên bản</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Mỗi đầu mục là 1 nội dung chỉ đạo — mọi người sẽ nhận/giao việc và
            đánh dấu đã xử lý trên từng đầu mục.
          </p>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v);
              show([]);
            }}
          >
            <TabsList>
              <TabsTrigger value="docx">
                <FileUp className="mr-1.5 h-4 w-4" /> File Word (.docx)
              </TabsTrigger>
              <TabsTrigger value="paste">
                <ClipboardPaste className="mr-1.5 h-4 w-4" /> Dán bảng
              </TabsTrigger>
            </TabsList>

            <TabsContent value="docx" className="space-y-3">
              <input
                ref={fileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                  : fileName ?? "Chọn file biên bản họp (.docx)"}
                <span className="text-xs">
                  Tự lấy “Bảng tổng hợp nhiệm vụ” (Hạng mục · Nội dung · Đơn vị
                  · Thời hạn)
                </span>
              </button>
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
            </TabsContent>

            <TabsContent value="paste" className="space-y-2">
              <Textarea
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  show(parsePastedText(e.target.value));
                }}
                placeholder={
                  "Copy bảng tổng hợp trong Word rồi dán vào đây (giữ dòng tiêu đề nếu có).\nHoặc gõ mỗi dòng 1 đầu mục."
                }
                className="min-h-[140px] font-mono text-xs"
              />
            </TabsContent>
          </Tabs>

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
            disabled={!count || addItems.isPending}
          >
            {addItems.isPending ? "Đang thêm..." : `Thêm ${count} đầu mục`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
