"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useDeleteMeeting,
  useMeeting,
  useMeetingTaskCounts,
} from "@/modules/meetings/hooks";
import { useIsAdmin } from "@/modules/documents/hooks";
import { useMeetingItems } from "@/modules/meetings/item-hooks";
import { MeetingItems } from "@/modules/meetings/meeting-items";
import { MeetingFormDialog } from "@/modules/meetings/meeting-form-dialog";
import { MEETING_STATUS_META } from "@/modules/tasks/constants";
import { MarkdownView } from "@/components/markdown-view";
import { TasksWorkspace } from "@/modules/tasks/components/tasks-workspace";

export function MeetingDetail({ id }: { id: string }) {
  const { data: meeting, isLoading } = useMeeting(id);
  const { data: items = [] } = useMeetingItems(id);
  const { data: counts = {} } = useMeetingTaskCounts();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const deleteMeeting = useDeleteMeeting();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showText, setShowText] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (!meeting) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Không tìm thấy cuộc họp.
        </p>
        <Link
          href="/meetings"
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  const meta = MEETING_STATUS_META[meeting.status];
  const count = counts[meeting.id] ?? { total: 0, done: 0 };

  return (
    <div className="space-y-6">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Họp giao ban
      </Link>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                    meta.badge,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  {meta.label}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDateTime(meeting.meeting_date)}
                </span>
              </div>
              <h1 className="text-xl font-semibold tracking-tight">
                {meeting.title}
              </h1>
              <div className="flex items-center gap-3 pt-1">
                <Progress
                  value={count.total ? (count.done / count.total) * 100 : 0}
                  className="max-w-xs flex-1"
                />
                <span className="text-xs text-muted-foreground">
                  {count.done}/{count.total} công việc hoàn thành
                </span>
              </div>
              {meeting.description && (
                <div className="pt-1">
                  <div
                    className={cn(
                      "relative",
                      !showText &&
                        meeting.description.length > 240 &&
                        "max-h-40 overflow-hidden",
                    )}
                  >
                    <MarkdownView source={meeting.description} />
                    {!showText && meeting.description.length > 240 && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
                    )}
                  </div>
                  {meeting.description.length > 240 && (
                    <button
                      type="button"
                      onClick={() => setShowText((v) => !v)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {showText ? "Thu gọn" : "Xem toàn văn biên bản"}
                      <ChevronDown
                        className={cn("h-3.5 w-3.5", showText && "rotate-180")}
                      />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" /> Sửa
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-600"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> Xoá
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Công việc</TabsTrigger>
          {items.length > 0 && (
            <TabsTrigger value="items">Đầu mục (lưu trữ)</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="tasks" className="mt-4">
          <TasksWorkspace meetingId={meeting.id} />
        </TabsContent>
        {items.length > 0 && (
          <TabsContent value="items" className="mt-4">
            <MeetingItems meeting={meeting} />
          </TabsContent>
        )}
      </Tabs>

      <MeetingFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        meeting={meeting}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Xoá cuộc họp?"
        description="Các công việc của cuộc họp vẫn được giữ lại nhưng không còn thuộc cuộc họp nào. Đầu mục lưu trữ sẽ bị xoá cùng cuộc họp, và lịch sử của các việc sẽ không còn hiện tên cuộc họp này. Không thể hoàn tác."
        confirmLabel="Xoá"
        destructive
        onConfirm={() =>
          deleteMeeting.mutate(meeting.id, {
            onSuccess: () => router.push("/meetings"),
          })
        }
      />
    </div>
  );
}
