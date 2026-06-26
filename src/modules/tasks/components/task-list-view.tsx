"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel, initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InlineSelectCell,
  type CellOption,
} from "@/modules/tasks/components/tag-cells";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  DEPARTMENTS,
  CATEGORIES,
  TAG_COLOR_CLASS,
} from "@/modules/tasks/constants";
import type { Task, TaskStatus, Profile, Meeting } from "@/types/database";

export type GroupBy =
  | "none"
  | "department"
  | "assignee"
  | "status"
  | "meeting"
  | "priority";

const DUE_TONE: Record<string, string> = {
  overdue: "text-red-600 font-medium",
  today: "text-amber-600 font-medium",
  soon: "text-amber-600",
  normal: "text-foreground",
  none: "text-muted-foreground",
};

const DEPT_OPTIONS: CellOption[] = DEPARTMENTS.map((d) => ({
  value: d.value,
  label: d.value,
  className: TAG_COLOR_CLASS[d.color],
}));
const CAT_OPTIONS: CellOption[] = CATEGORIES.map((c) => ({
  value: c.value,
  label: c.value,
  className: TAG_COLOR_CLASS[c.color],
}));
const STATUS_OPTIONS: CellOption[] = TASK_STATUS_ORDER.map((s) => ({
  value: s,
  label: TASK_STATUS_META[s].label,
  className: TASK_STATUS_META[s].badge,
}));

type Group = { key: string; label: string; tasks: Task[] };

function buildGroups(
  tasks: Task[],
  groupBy: GroupBy,
  profiles: Profile[],
  meetings: Meeting[],
): Group[] {
  if (groupBy === "none") return [{ key: "all", label: "", tasks }];

  const map = new Map<string, Task[]>();
  const push = (k: string, t: Task) => {
    const arr = map.get(k) ?? [];
    arr.push(t);
    map.set(k, arr);
  };
  for (const t of tasks) {
    if (groupBy === "status") push(t.status, t);
    else if (groupBy === "department") push(t.department ?? "__none__", t);
    else if (groupBy === "assignee") push(t.assignee_id ?? "__none__", t);
    else if (groupBy === "meeting") push(t.meeting_id ?? "__none__", t);
    else push("__none__", t);
  }

  const labelFor = (key: string): string => {
    if (key === "__none__") {
      if (groupBy === "assignee") return "Chưa giao";
      if (groupBy === "department") return "Chưa phân phòng";
      if (groupBy === "meeting") return "Không gắn họp";
    }
    if (groupBy === "status") return TASK_STATUS_META[key as TaskStatus].label;
    if (groupBy === "assignee")
      return profiles.find((p) => p.id === key)?.full_name ?? "—";
    if (groupBy === "meeting")
      return meetings.find((m) => m.id === key)?.title ?? "—";
    return key; // department dùng chính text
  };

  let order: string[];
  if (groupBy === "status") order = [...TASK_STATUS_ORDER];
  else if (groupBy === "department")
    order = [...DEPARTMENTS.map((d) => d.value), "__none__"];
  else if (groupBy === "meeting")
    order = [...meetings.map((m) => m.id), "__none__"];
  else order = [...profiles.map((p) => p.id), "__none__"];

  const groups: Group[] = [];
  for (const key of order) {
    const t = map.get(key);
    if (t && t.length) groups.push({ key, label: labelFor(key), tasks: t });
  }
  // các nhóm còn lại không nằm trong order (vd phòng tự nhập)
  for (const [key, t] of map) {
    if (!groups.find((g) => g.key === key))
      groups.push({ key, label: labelFor(key), tasks: t });
  }
  return groups;
}

export function TaskListView({
  tasks,
  groupBy,
  profiles,
  meetings,
  nameOf,
  onOpen,
  onDelete,
  onPatch,
}: {
  tasks: Task[];
  groupBy: GroupBy;
  profiles: Profile[];
  meetings: Meeting[];
  nameOf: (id: string | null) => string | null;
  onOpen: (t: Task) => void;
  onDelete: (t: Task) => void;
  onPatch: (taskId: string, patch: Partial<Task>) => void;
}) {
  const groups = useMemo(
    () => buildGroups(tasks, groupBy, profiles, meetings),
    [tasks, groupBy, profiles, meetings],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const showDept = groupBy !== "department";

  // Bố cục cột (inline style để Tailwind không phải sinh class động)
  const template = [
    "minmax(220px,1.6fr)", // Công việc
    showDept ? "150px" : null, // Phòng/Nhóm
    "110px", // Hạng mục
    "170px", // Người phụ trách
    "160px", // Trạng thái
    "130px", // Tiến độ
    "120px", // Ngày kết thúc
    "minmax(170px,1fr)", // Cập nhật mới nhất
    "44px", // actions
  ]
    .filter(Boolean)
    .join(" ");

  const gridStyle = { gridTemplateColumns: template };

  const assigneeOptions: CellOption[] = profiles.map((p) => ({
    value: p.id,
    label: p.full_name ?? p.email,
    className: "bg-slate-100 text-slate-700 border-slate-200",
  }));

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="min-w-max">
        {/* Header */}
        <div
          className="grid items-center gap-x-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground"
          style={gridStyle}
        >
          <span className="truncate">Công việc</span>
          {showDept && <span className="truncate">Phòng/Nhóm</span>}
          <span className="truncate">Hạng mục</span>
          <span className="truncate">Người phụ trách</span>
          <span className="truncate">Trạng thái</span>
          <span className="truncate">Tiến độ</span>
          <span className="truncate">Ngày kết thúc</span>
          <span className="truncate">Cập nhật mới nhất</span>
          <span />
        </div>

        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          const done = g.tasks.filter((t) => t.status === "done").length;
          return (
            <div key={g.key}>
              {groupBy !== "none" && (
                <button
                  onClick={() => toggle(g.key)}
                  className="flex w-full items-center gap-2 border-b bg-muted/20 px-3 py-2 text-left hover:bg-muted/40"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold">{g.label}</span>
                  <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                    {g.tasks.length}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {done} xong
                  </span>
                </button>
              )}

              {!isCollapsed &&
                g.tasks.map((t) => {
                  const due = dueLabel(t.due_date);
                  const isDone = t.status === "done";
                  return (
                    <div
                      key={t.id}
                      className="grid items-center gap-x-4 border-b px-4 py-2 last:border-0 hover:bg-muted/30"
                      style={gridStyle}
                    >
                      {/* Công việc */}
                      <div className="flex min-w-0 items-center gap-2.5">
                        <button
                          onClick={() =>
                            onPatch(t.id, {
                              status: isDone ? "todo" : "done",
                            })
                          }
                          title={isDone ? "Bỏ hoàn thành" : "Đánh dấu xong"}
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground" />
                          )}
                        </button>
                        <button
                          onClick={() => onOpen(t)}
                          className={cn(
                            "truncate text-left text-sm font-medium hover:underline",
                            isDone &&
                              "text-muted-foreground line-through",
                          )}
                        >
                          {t.title}
                        </button>
                      </div>

                      {/* Phòng/Nhóm */}
                      {showDept && (
                        <div className="min-w-0">
                          <InlineSelectCell
                            value={t.department}
                            options={DEPT_OPTIONS}
                            onChange={(v) => onPatch(t.id, { department: v })}
                          />
                        </div>
                      )}

                      {/* Hạng mục */}
                      <div className="min-w-0">
                        <InlineSelectCell
                          value={t.category}
                          options={CAT_OPTIONS}
                          onChange={(v) => onPatch(t.id, { category: v })}
                        />
                      </div>

                      {/* Người phụ trách */}
                      <div className="min-w-0">
                        <AssigneeCell
                          assigneeId={t.assignee_id}
                          name={nameOf(t.assignee_id)}
                          options={assigneeOptions}
                          onChange={(v) =>
                            onPatch(t.id, { assignee_id: v })
                          }
                        />
                      </div>

                      {/* Trạng thái */}
                      <div className="min-w-0">
                        <InlineSelectCell
                          value={t.status}
                          options={STATUS_OPTIONS}
                          allowEmpty={false}
                          onChange={(v) =>
                            v && onPatch(t.id, { status: v as TaskStatus })
                          }
                        />
                      </div>

                      {/* Tiến độ */}
                      <div className="flex min-w-0 items-center gap-2">
                        <Progress value={t.progress} className="h-1.5" />
                        <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">
                          {t.progress}%
                        </span>
                      </div>

                      {/* Ngày kết thúc */}
                      <span
                        className={cn(
                          "truncate text-xs",
                          DUE_TONE[due.tone],
                        )}
                      >
                        {due.text}
                      </span>

                      {/* Cập nhật mới nhất */}
                      <button
                        onClick={() => onOpen(t)}
                        className="truncate text-left text-xs text-muted-foreground hover:text-foreground"
                        title={t.latest_update ?? ""}
                      >
                        {t.latest_update || (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </button>

                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onOpen(t)}>
                            <Pencil className="h-4 w-4" /> Mở chi tiết
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete(t)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" /> Xoá
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssigneeCell({
  assigneeId,
  name,
  options,
  onChange,
}: {
  assigneeId: string | null;
  name: string | null;
  options: CellOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex min-w-0 max-w-full items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60">
          {assigneeId && name ? (
            <>
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarFallback className="text-[10px]">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs">{name}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground/60">+ Trống</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 overflow-y-auto"
      >
        <DropdownMenuItem onClick={() => onChange(null)}>
          <span className="text-xs text-muted-foreground">Chưa giao</span>
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[10px]">
                {initials(o.label)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm">{o.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
