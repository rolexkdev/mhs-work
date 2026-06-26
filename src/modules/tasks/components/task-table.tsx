"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PriorityBadge,
  AssigneeChip,
} from "@/modules/tasks/components/task-badges";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/modules/tasks/constants";
import type { Task, TaskStatus } from "@/types/database";

const DUE_TONE: Record<string, string> = {
  overdue: "text-red-600 font-medium",
  today: "text-amber-600 font-medium",
  soon: "text-amber-600",
  normal: "text-muted-foreground",
  none: "text-muted-foreground",
};

export function TaskTable({
  tasks,
  nameOf,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  tasks: Task[];
  nameOf: (id: string | null) => string | null;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Công việc</th>
            <th className="px-4 py-2.5 font-medium">Người thực hiện</th>
            <th className="px-4 py-2.5 font-medium">Ưu tiên</th>
            <th className="w-40 px-4 py-2.5 font-medium">Tiến độ</th>
            <th className="px-4 py-2.5 font-medium">Hạn chót</th>
            <th className="w-40 px-4 py-2.5 font-medium">Trạng thái</th>
            <th className="w-10 px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const due = dueLabel(t.due_date);
            return (
              <tr
                key={t.id}
                className="border-b last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3">
                  <button
                    onClick={() => onEdit(t)}
                    className="text-left font-medium hover:underline"
                  >
                    {t.title}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <AssigneeChip name={nameOf(t.assignee_id)} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={t.priority} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Progress value={t.progress} className="h-1.5" />
                    <span className="w-8 text-xs text-muted-foreground">
                      {t.progress}%
                    </span>
                  </div>
                </td>
                <td className={cn("px-4 py-3 text-xs", DUE_TONE[due.tone])}>
                  {due.text}
                </td>
                <td className="px-4 py-3">
                  <Select
                    value={t.status}
                    onValueChange={(v) =>
                      onStatusChange(t.id, v as TaskStatus)
                    }
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUS_ORDER.map((s) => (
                        <SelectItem key={s} value={s}>
                          {TASK_STATUS_META[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(t)}>
                        <Pencil className="h-4 w-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(t)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                        Xoá
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
