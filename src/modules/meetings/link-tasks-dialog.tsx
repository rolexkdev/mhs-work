"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskPicker } from "@/modules/meetings/task-picker";
import { useLinkTasksToMeeting } from "@/modules/meetings/hooks";

/** Pick existing tasks and link them to a meeting. */
export function LinkTasksDialog({
  open,
  onOpenChange,
  meetingId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meetingId: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const link = useLinkTasksToMeeting();

  const close = (v: boolean) => {
    if (!v) setSelected([]);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thêm việc có sẵn</DialogTitle>
          <DialogDescription>
            Chọn các công việc để gắn vào cuộc họp này.
          </DialogDescription>
        </DialogHeader>
        <TaskPicker
          meetingId={meetingId}
          selected={selected}
          onChange={setSelected}
          listClassName="h-[50dvh] min-h-64"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Huỷ
          </Button>
          <Button
            disabled={selected.length === 0 || link.isPending}
            onClick={() =>
              link.mutate(
                { meetingId, taskIds: selected },
                { onSuccess: () => close(false) },
              )
            }
          >
            {link.isPending ? "Đang lưu..." : `Thêm ${selected.length || ""} việc`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
