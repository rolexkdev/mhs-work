"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import { DEPARTMENTS } from "@/modules/tasks/constants";
import { useProfiles } from "@/modules/auth/use-profiles";
import {
  useAddMeetingItems,
  useAssignMeetingItem,
  useResolveMeetingItem,
  useUpdateMeetingItem,
} from "@/modules/meetings/item-hooks";
import type { MeetingItem } from "@/types/database";

const NO_DEPT = "__none__";

/** Đoán phòng/nhóm của task từ "Đơn vị phụ trách" ghi trong biên bản. */
function guessDepartment(text: string | null): string {
  if (!text) return NO_DEPT;
  const t = text.toLowerCase();
  return (
    DEPARTMENTS.find((d) => t.includes(d.value.toLowerCase()))?.value ?? NO_DEPT
  );
}

// ---------------------------------------------------------------------------
// Giao việc từ đầu mục
// ---------------------------------------------------------------------------
export function AssignItemDialog({
  item,
  meId,
  onOpenChange,
}: {
  item: MeetingItem | null;
  meId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const open = !!item;
  const { data: profiles = [] } = useProfiles();
  const assign = useAssignMeetingItem();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [department, setDepartment] = useState(NO_DEPT);
  const [dueDate, setDueDate] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!item) return;
    setTitle(item.title ? `${item.title}: ${item.content}` : item.content);
    setDescription(
      [
        item.department && `Đơn vị phụ trách (biên bản): ${item.department}`,
        item.deadline && `Thời hạn (biên bản): ${item.deadline}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    setAssignees(meId ? [meId] : []);
    setDepartment(guessDepartment(item.department));
    setDueDate(item.due_date ?? "");
    setQuery("");
  }, [item, meId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? profiles.filter((p) =>
          `${p.full_name ?? ""} ${p.email}`.toLowerCase().includes(q),
        )
      : profiles;
    // Người đang chọn lên đầu
    return [...list].sort(
      (a, b) => Number(assignees.includes(b.id)) - Number(assignees.includes(a.id)),
    );
  }, [profiles, query, assignees]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !title.trim()) return;
    await assign.mutateAsync({
      item,
      title: title.trim(),
      description: description.trim() || null,
      assigneeIds: assignees,
      department: department === NO_DEPT ? null : department,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Giao việc từ đầu mục</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Mỗi người được chọn sẽ có 1 công việc riêng, gắn với cuộc họp này.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="ai-title">Tên công việc *</Label>
              <Textarea
                id="ai-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-[64px] font-medium"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Người thực hiện{" "}
                <span className="font-normal text-muted-foreground">
                  ({assignees.length} người)
                </span>
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm người..."
                  className="pl-8"
                />
              </div>
              <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
                {shown.map((p) => {
                  const on = assignees.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50",
                        on && "bg-primary/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setAssignees((a) =>
                            e.target.checked
                              ? [...a, p.id]
                              : a.filter((x) => x !== p.id),
                          )
                        }
                      />
                      <span className="flex-1 truncate">
                        {p.full_name ?? p.email}
                        {p.id === meId && (
                          <span className="text-muted-foreground"> (tôi)</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {!assignees.length && (
                <p className="text-xs text-muted-foreground">
                  Không chọn ai → tạo 1 việc “Chưa giao”.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Phòng/Nhóm</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPT}>Chưa phân phòng</SelectItem>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-due">
                  Hạn chót
                  {item?.deadline && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (biên bản: {item.deadline})
                    </span>
                  )}
                </Label>
                <Input
                  id="ai-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-desc">Mô tả</Label>
              <Textarea
                id="ai-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[64px]"
              />
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={assign.isPending}>
              {assign.isPending
                ? "Đang tạo..."
                : assignees.length > 1
                  ? `Tạo ${assignees.length} công việc`
                  : "Tạo công việc"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Đánh dấu đã xử lý (ghi kết quả)
// ---------------------------------------------------------------------------
export function ResolveItemDialog({
  item,
  onOpenChange,
}: {
  item: MeetingItem | null;
  onOpenChange: (v: boolean) => void;
}) {
  const resolve = useResolveMeetingItem();
  const [result, setResult] = useState("");

  useEffect(() => {
    if (item) setResult(item.result ?? "");
  }, [item]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    await resolve.mutateAsync({
      id: item.id,
      done: true,
      result: result.trim() || null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đánh dấu đã xử lý</DialogTitle>
          {item && (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {item.title ? `${item.title}: ` : ""}
              {item.content}
            </p>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ri-result">Kết quả / cách đã xử lý</Label>
            <Textarea
              id="ri-result"
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="VD: Đã ký hợp đồng ngày 25/10, hàng về kho 28/10..."
              className="min-h-[100px]"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Lãnh đạo sẽ xem phần này khi mở lại cuộc họp.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={resolve.isPending}>
              {resolve.isPending ? "Đang lưu..." : "Đã xử lý"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Thêm / sửa 1 đầu mục
// ---------------------------------------------------------------------------
export function ItemFormDialog({
  open,
  onOpenChange,
  meetingId,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meetingId: string;
  item?: MeetingItem | null;
}) {
  const add = useAddMeetingItems();
  const update = useUpdateMeetingItem();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [department, setDepartment] = useState("");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setContent(item?.content ?? "");
    setDepartment(item?.department ?? "");
    setDeadline(item?.deadline ?? "");
  }, [open, item]);

  const pending = add.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    const fields = {
      title: title.trim() || null,
      content: content.trim(),
      department: department.trim() || null,
      deadline: deadline.trim() || null,
    };
    if (item) await update.mutateAsync({ id: item.id, ...fields });
    else
      await add.mutateAsync({
        meetingId,
        items: [{ section: null, ...fields }],
      });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Sửa đầu mục" : "Thêm đầu mục"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="if-title">Hạng mục</Label>
            <Input
              id="if-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Ống hóa chất Javel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="if-content">Nội dung chỉ đạo *</Label>
            <Textarea
              id="if-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[90px]"
              required
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="if-dept">Đơn vị phụ trách</Label>
              <Input
                id="if-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="VD: Hạ tầng / Kỹ thuật"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="if-deadline">Thời hạn</Label>
              <Input
                id="if-deadline"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="VD: Tuần tới"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : item ? "Lưu" : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
