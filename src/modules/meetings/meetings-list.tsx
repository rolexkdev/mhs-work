"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, CalendarDays, ArrowRight, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMeetings,
  useMeetingTaskCounts,
} from "@/modules/meetings/hooks";
import { useMe } from "@/modules/meetings/item-hooks";
import { MeetingFormDialog } from "@/modules/meetings/meeting-form-dialog";
import { ImportItemsDialog } from "@/modules/meetings/import-items-dialog";
import { MEETING_STATUS_META } from "@/modules/tasks/constants";

export function MeetingsList() {
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data: me } = useMe();
  // Tạo/sửa cuộc họp: chỉ admin/leader (RLS meetings_write_leader_admin)
  const canManage = me?.role === "admin" || me?.role === "leader";
  const { data: meetings = [], isLoading } = useMeetings();
  const { data: counts = {} } = useMeetingTaskCounts();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {meetings.length} cuộc họp
        </p>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Tạo trống
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" /> Tạo từ biên bản
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Chưa có cuộc họp nào. Tải biên bản họp (.docx) lên để tạo cuộc họp
            và tách các đầu mục cần giao.
          </p>
          {canManage && (
            <Button className="mt-4" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" /> Tạo từ biên bản
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((m) => {
            const meta = MEETING_STATUS_META[m.status];
            const c = counts[m.id];
            return (
              <Link key={m.id} href={`/meetings/${m.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                          meta.badge,
                        )}
                      >
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", meta.dot)}
                        />
                        {meta.label}
                      </span>
                    </div>

                    <div>
                      <h3 className="line-clamp-2 font-medium leading-snug">
                        {m.title}
                      </h3>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDateTime(m.meeting_date)}
                      </p>
                    </div>

                    {c ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {c.done}/{c.total}
                          </span>{" "}
                          công việc hoàn thành
                        </p>
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${(c.done / c.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      m.description && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {m.description}
                        </p>
                      )
                    )}

                    <div className="flex items-center gap-1 text-xs font-medium text-primary">
                      Xem chi tiết <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <MeetingFormDialog open={open} onOpenChange={setOpen} />
      <ImportItemsDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
