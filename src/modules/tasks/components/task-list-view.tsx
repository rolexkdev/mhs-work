"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Pencil,
  Trash2,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel, formatDate, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ProgressDial } from "@/modules/tasks/components/progress-dial";
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
  TAG_COLOR_CLASS,
  colorOf,
  type TagColor,
} from "@/modules/tasks/constants";
import type { Task, TaskStatus, Profile, Meeting } from "@/types/database";

export type GroupBy =
  | "none"
  | "department"
  | "assignee"
  | "status"
  | "meeting";

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
const STATUS_OPTIONS: CellOption[] = TASK_STATUS_ORDER.map((s) => ({
  value: s,
  label: TASK_STATUS_META[s].label,
  className: TASK_STATUS_META[s].badge,
}));

// Màu chấm tròn đậm theo màu pill (để dấu hiệu màu ở thanh nhóm rõ hơn).
const DOT_CLASS: Record<TagColor, string> = {
  gray: "bg-slate-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  brown: "bg-amber-600",
  pink: "bg-pink-500",
  sky: "bg-sky-500",
  yellow: "bg-yellow-500",
};

// Viền dọc bên trái: kéo màu của nhóm chạy suốt các hàng thuộc nhóm đó, để
// nhìn là biết ngay khối này thuộc phòng nào mà không phải dò ngược lên header.
const BORDER_CLASS: Record<TagColor, string> = {
  gray: "border-l-slate-400",
  blue: "border-l-blue-500",
  green: "border-l-emerald-500",
  orange: "border-l-orange-500",
  red: "border-l-red-500",
  purple: "border-l-purple-500",
  brown: "border-l-amber-600",
  pink: "border-l-pink-500",
  sky: "border-l-sky-500",
  yellow: "border-l-yellow-500",
};

const STATUS_BORDER: Record<TaskStatus, string> = {
  todo: "border-l-slate-400",
  in_progress: "border-l-blue-500",
  blocked: "border-l-orange-500",
  review: "border-l-amber-500",
  done: "border-l-emerald-500",
};

/** Lớp màu cho thanh header và viền trái của từng nhóm. */
function groupAccent(
  groupBy: GroupBy,
  key: string,
): { bar: string; dot: string; border: string } {
  if (groupBy === "department" && key !== "__none__") {
    const c = colorOf(DEPARTMENTS, key);
    return {
      bar: cn(TAG_COLOR_CLASS[c], "hover:brightness-95"),
      dot: DOT_CLASS[c],
      border: BORDER_CLASS[c],
    };
  }
  if (groupBy === "status") {
    const meta = TASK_STATUS_META[key as TaskStatus];
    return {
      bar: cn(meta.badge, "hover:brightness-95"),
      dot: meta.dot,
      border: STATUS_BORDER[key as TaskStatus],
    };
  }
  return {
    bar: "bg-muted/20 hover:bg-muted/40",
    dot: "bg-muted-foreground/40",
    border: "border-l-muted-foreground/30",
  };
}

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
  canHideWeek = false,
  onToggleWeekHidden,
}: {
  tasks: Task[];
  groupBy: GroupBy;
  profiles: Profile[];
  meetings: Meeting[];
  nameOf: (id: string | null) => string | null;
  onOpen: (t: Task) => void;
  onDelete: (t: Task) => void;
  onPatch: (taskId: string, patch: Partial<Task>) => void;
  canHideWeek?: boolean;
  onToggleWeekHidden?: (t: Task) => void;
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
    "170px", // Người phụ trách
    "160px", // Trạng thái
    "90px", // Tiến độ
    "120px", // Ngày bắt đầu
    "120px", // Ngày kết thúc
    "minmax(170px,1fr)", // Báo cáo mới nhất
    "44px", // actions
  ]
    .filter(Boolean)
    .join(" ");

  const gridStyle = { gridTemplateColumns: template };

  const assigneeOptions: AssigneeOption[] = profiles.map((p) => ({
    value: p.id,
    label: p.full_name ?? p.email,
    avatarUrl: p.avatar_url,
  }));
  const avatarOf = (id: string | null) =>
    id ? profiles.find((p) => p.id === id)?.avatar_url ?? null : null;

  const renderGroupHeader = (g: Group) => {
    const isCollapsed = collapsed.has(g.key);
    const done = g.tasks.filter((t) => t.status === "done").length;
    const accent = groupAccent(groupBy, g.key);
    return (
      <button
        onClick={() => toggle(g.key)}
        className={cn(
          "flex w-full items-center gap-2 border-b px-3 py-2.5 text-left transition sm:gap-2.5",
          accent.bar,
        )}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        )}
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accent.dot)} />
        <span className="min-w-0 truncate text-sm font-bold uppercase tracking-wide">
          {g.label}
        </span>
        <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-semibold">
          {g.tasks.length} việc
        </span>

        {/* Tỷ lệ hoàn thành của nhóm — nhìn thanh là biết phòng nào đang đuối */}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs font-medium">
          <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-black/10 sm:block">
            <span
              className="block h-full rounded-full bg-current opacity-50"
              style={{
                width: `${Math.round((done / g.tasks.length) * 100)}%`,
              }}
            />
          </span>
          {done}/{g.tasks.length} xong
        </span>
      </button>
    );
  };

  return (
    <>
      {/* ── Điện thoại: mỗi việc là một thẻ, chạm để mở chi tiết ── */}
      <div className="space-y-3 md:hidden">
        {groups.map((g) => {
          const accent = groupAccent(groupBy, g.key);
          return (
            <div
              key={g.key}
              className={cn(
                "overflow-hidden rounded-lg border bg-card",
                groupBy !== "none" && cn("border-l-4", accent.border),
              )}
            >
              {groupBy !== "none" && renderGroupHeader(g)}
              {!collapsed.has(g.key) && (
                <div className="divide-y">
                  {g.tasks.map((t) => (
                    <MobileTaskRow
                      key={t.id}
                      task={t}
                      showDept={showDept}
                      assigneeName={nameOf(t.assignee_id)}
                      assigneeAvatar={avatarOf(t.assignee_id)}
                      onOpen={() => onOpen(t)}
                      onPatch={(p) => onPatch(t.id, p)}
                      onDelete={() => onDelete(t)}
                      canHideWeek={canHideWeek}
                      onToggleWeekHidden={
                        onToggleWeekHidden ? () => onToggleWeekHidden(t) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Máy tính: bảng đầy đủ, sửa nhanh ngay trên dòng ── */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
      <div className="min-w-[1400px]">
        {/* Header */}
        <div
          className="grid items-center gap-x-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground"
          style={gridStyle}
        >
          <span className="truncate">Công việc</span>
          {showDept && <span className="truncate">Phòng/Nhóm</span>}
          <span className="truncate">Người phụ trách</span>
          <span className="truncate">Trạng thái</span>
          <span className="truncate">Tiến độ</span>
          <span className="truncate">Ngày bắt đầu</span>
          <span className="truncate">Ngày kết thúc</span>
          <span className="truncate">Báo cáo mới nhất</span>
          <span />
        </div>

        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          const accent = groupAccent(groupBy, g.key);
          return (
            <div
              key={g.key}
              className={cn(groupBy !== "none" && cn("border-l-4", accent.border))}
            >
              {groupBy !== "none" && renderGroupHeader(g)}

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
                              status: isDone ? "in_progress" : "done",
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
                        <EditableTitle
                          value={t.title}
                          isDone={isDone}
                          onOpen={() => onOpen(t)}
                          onRename={(title) => onPatch(t.id, { title })}
                        />
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

                      {/* Người phụ trách */}
                      <div className="min-w-0">
                        <AssigneeCell
                          assigneeId={t.assignee_id}
                          name={nameOf(t.assignee_id)}
                          avatarUrl={avatarOf(t.assignee_id)}
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
                      <div className="flex min-w-0 items-center">
                        <ProgressDial
                          value={t.manual_progress}
                          readOnly
                          size={36}
                          strokeWidth={4}
                        />
                      </div>

                      {/* Ngày bắt đầu */}
                      <InlineDateCell
                        value={t.start_date}
                        label={t.start_date ? formatDate(t.start_date) : "—"}
                        className="text-muted-foreground"
                        onChange={(iso) => onPatch(t.id, { start_date: iso })}
                      />

                      {/* Ngày kết thúc */}
                      <InlineDateCell
                        value={t.due_date}
                        label={due.text}
                        className={DUE_TONE[due.tone]}
                        onChange={(iso) => onPatch(t.id, { due_date: iso })}
                      />

                      {/* Báo cáo mới nhất */}
                      <LatestUpdateCell
                        value={t.latest_update}
                        onOpen={() => onOpen(t)}
                      />

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
                          {canHideWeek && onToggleWeekHidden && (
                            <DropdownMenuItem
                              onClick={() => onToggleWeekHidden(t)}
                            >
                              <EyeOff className="h-4 w-4" /> Ẩn khỏi tuần này
                            </DropdownMenuItem>
                          )}
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
    </>
  );
}

/**
 * Một công việc trên điện thoại.
 *
 * Bảng ngang 1400px không cuộn nổi bằng ngón tay, nên mobile xếp mọi thông tin
 * theo chiều dọc: chạm vào thẻ là mở chi tiết (nơi sửa được mọi trường), chỉ
 * giữ lại nút đánh dấu xong ngay tại thẻ vì đó là thao tác dùng nhiều nhất.
 */
function MobileTaskRow({
  task: t,
  showDept,
  assigneeName,
  assigneeAvatar,
  onOpen,
  onPatch,
  onDelete,
  canHideWeek,
  onToggleWeekHidden,
}: {
  task: Task;
  showDept: boolean;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  onOpen: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
  canHideWeek?: boolean;
  onToggleWeekHidden?: () => void;
}) {
  const due = dueLabel(t.due_date);
  const isDone = t.status === "done";
  const status = TASK_STATUS_META[t.status];
  const deptColor = t.department ? colorOf(DEPARTMENTS, t.department) : null;

  return (
    <div className="flex items-start gap-2 px-3 py-3 active:bg-muted/40">
      {/* Đánh dấu xong — vùng chạm 44px theo khuyến nghị của iOS/Android */}
      <button
        onClick={() => onPatch({ status: isDone ? "in_progress" : "done" })}
        aria-label={isDone ? "Bỏ hoàn thành" : "Đánh dấu xong"}
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center"
      >
        {isDone ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      <button onClick={onOpen} className="min-w-0 flex-1 space-y-1.5 text-left">
        <p
          className={cn(
            "line-clamp-2 text-[15px] font-medium leading-snug",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {t.title}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[11px] font-medium",
              status.badge,
            )}
          >
            {status.label}
          </span>
          {showDept && t.department && deptColor && (
            <span
              className={cn(
                "max-w-[45%] truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                TAG_COLOR_CLASS[deptColor],
              )}
            >
              {t.department}
            </span>
          )}
          <span className={cn("text-[11px]", DUE_TONE[due.tone])}>
            {due.text}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {assigneeName ? (
            <>
              <Avatar className="h-4 w-4 shrink-0">
                {assigneeAvatar && (
                  <AvatarImage src={assigneeAvatar} alt={assigneeName} />
                )}
                <AvatarFallback className="text-[8px]">
                  {initials(assigneeName)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{assigneeName}</span>
            </>
          ) : (
            <span className="italic">Chưa giao</span>
          )}
        </div>

        {t.latest_update && (
          <p className="line-clamp-2 whitespace-pre-line rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            {t.latest_update}
          </p>
        )}
      </button>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <ProgressDial
          value={t.manual_progress}
          readOnly
          size={38}
          strokeWidth={4}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>
              <Pencil className="h-4 w-4" /> Mở chi tiết
            </DropdownMenuItem>
            {canHideWeek && onToggleWeekHidden && (
              <DropdownMenuItem onClick={onToggleWeekHidden}>
                <EyeOff className="h-4 w-4" /> Ẩn khỏi tuần này
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onDelete}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4" /> Xoá
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Tiêu đề: click mở chi tiết, double-click để đổi tên ngay tại dòng. */
function EditableTitle({
  value,
  isDone,
  onOpen,
  onRename,
}: {
  value: string;
  isDone: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const v = draft.trim();
    if (v && v !== value) onRename(v);
    else setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    );
  }

  return (
    <button
      onClick={onOpen}
      onDoubleClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Bấm để mở chi tiết · bấm đúp để đổi tên"
      className={cn(
        "block min-w-0 max-w-full truncate text-left text-sm font-medium hover:underline",
        isDone && "text-muted-foreground line-through",
      )}
    >
      {value}
    </button>
  );
}

/**
 * Báo cáo mới nhất: người dùng hay gõ danh sách nhiều dòng ("1. ... 2. ...")
 * nên hiển thị 2 dòng đầu (giữ nguyên xuống dòng), có nút mở rộng tại chỗ để
 * đọc hết mà không phải mở panel chi tiết.
 */
function LatestUpdateCell({
  value,
  onOpen,
}: {
  value: string | null;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!value) {
    return <span className="text-xs text-muted-foreground/50">—</span>;
  }

  const lineCount = value.split("\n").filter((l) => l.trim()).length;
  // Ước lượng: nhiều dòng, hoặc một dòng dài quá 2 hàng của ô ~170px.
  const isLong = lineCount > 2 || value.length > 90;

  return (
    <div className="min-w-0">
      <button
        onClick={() => onOpen()}
        className={cn(
          // `line-clamp-2` tự đặt display là -webkit-box nên không kèm `block`
          // ở đây, tránh hai utility display đè nhau.
          "w-full whitespace-pre-line break-words text-left text-xs text-muted-foreground hover:text-foreground",
          expanded ? "block" : "line-clamp-2",
        )}
      >
        {value}
      </button>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? "Thu gọn" : `Xem thêm (${lineCount} dòng)`}
        </button>
      )}
    </div>
  );
}

/** Ngày: hiển thị nhãn, click để chọn ngày qua input date. */
function InlineDateCell({
  value,
  label,
  className,
  onChange,
}: {
  value: string | null;
  label: string;
  className?: string;
  onChange: (iso: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value ? value.slice(0, 10) : ""}
        onBlur={() => setEditing(false)}
        onChange={(e) =>
          onChange(e.target.value ? new Date(e.target.value).toISOString() : null)
        }
        className="w-full rounded border border-input bg-background px-1 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Bấm để đổi ngày"
      className={cn(
        "truncate rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60",
        className,
      )}
    >
      {label}
    </button>
  );
}

type AssigneeOption = { value: string; label: string; avatarUrl: string | null };

function AssigneeCell({
  assigneeId,
  name,
  avatarUrl,
  options,
  onChange,
}: {
  assigneeId: string | null;
  name: string | null;
  avatarUrl: string | null;
  options: AssigneeOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex min-w-0 max-w-full items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60">
          {assigneeId && name ? (
            <>
              <Avatar className="h-5 w-5 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="text-[10px]">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate text-xs">{name}</span>
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
              {o.avatarUrl && <AvatarImage src={o.avatarUrl} alt={o.label} />}
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
