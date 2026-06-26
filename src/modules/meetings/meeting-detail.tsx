"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMeeting } from "@/modules/meetings/hooks";
import { MeetingFormDialog } from "@/modules/meetings/meeting-form-dialog";
import { MEETING_STATUS_META } from "@/modules/tasks/constants";
import { TasksWorkspace } from "@/modules/tasks/components/tasks-workspace";

export function MeetingDetail({ id }: { id: string }) {
  const { data: meeting, isLoading } = useMeeting(id);
  const [editOpen, setEditOpen] = useState(false);

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

  return (
    <div className="space-y-6">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Họp giao ban
      </Link>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
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
              {meeting.description && (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {meeting.description}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Sửa
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold">Công việc được giao</h2>
        <TasksWorkspace meetingId={meeting.id} />
      </div>

      <MeetingFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        meeting={meeting}
      />
    </div>
  );
}
