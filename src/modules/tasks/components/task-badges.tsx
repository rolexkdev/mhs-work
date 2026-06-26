import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  TASK_STATUS_META,
  TASK_PRIORITY_META,
} from "@/modules/tasks/constants";
import type { TaskStatus, TaskPriority } from "@/types/database";

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = TASK_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        meta.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const meta = TASK_PRIORITY_META[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        meta.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function AssigneeChip({ name }: { name: string | null }) {
  if (!name)
    return (
      <span className="text-xs italic text-muted-foreground">Chưa giao</span>
    );
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarFallback className="text-[10px]">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-xs">{name}</span>
    </span>
  );
}
