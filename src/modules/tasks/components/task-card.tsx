"use client";

import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import {
  PriorityBadge,
  AssigneeChip,
} from "@/modules/tasks/components/task-badges";
import type { Task } from "@/types/database";

const DUE_TONE: Record<string, string> = {
  overdue: "text-red-600",
  today: "text-amber-600",
  soon: "text-amber-600",
  normal: "text-muted-foreground",
  none: "text-muted-foreground",
};

export function TaskCard({
  task,
  assigneeName,
  assigneeAvatar,
  onClick,
  dragging,
}: {
  task: Task;
  assigneeName: string | null;
  assigneeAvatar?: string | null;
  onClick?: () => void;
  dragging?: boolean;
}) {
  const due = dueLabel(task.due_date);
  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer space-y-2.5 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        <PriorityBadge priority={task.priority} />
      </div>

      {task.progress > 0 && (
        <div className="flex items-center gap-2">
          <Progress value={task.progress} className="h-1.5" />
          <span className="text-[10px] text-muted-foreground">
            {task.progress}%
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <AssigneeChip name={assigneeName} avatarUrl={assigneeAvatar} />
        {task.due_date && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px]",
              DUE_TONE[due.tone],
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {due.text}
          </span>
        )}
      </div>
    </div>
  );
}
