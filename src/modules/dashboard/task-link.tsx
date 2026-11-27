"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { isPlainClick } from "@/modules/dashboard/drilldown";
import type { Task } from "@/types/database";

/**
 * Links to /tasks?task=<id> for Ctrl/Cmd/Shift/middle click while opening
 * the task detail in place on the dashboard for plain left clicks.
 */
export function TaskLink({
  task,
  onOpenTask,
  className,
  children,
}: {
  task: Task;
  onOpenTask?: (t: Task) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/tasks?task=${task.id}`}
      onClick={(e) => {
        if (onOpenTask && isPlainClick(e)) {
          e.preventDefault();
          onOpenTask(task);
        }
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
