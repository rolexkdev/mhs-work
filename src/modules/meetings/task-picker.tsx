"use client";

import { useMemo, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { norm } from "@/lib/text";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { TASK_STATUS_META } from "@/modules/tasks/constants";
import { useTasks } from "@/modules/tasks/hooks";
import { useMeetings } from "@/modules/meetings/hooks";

/**
 * Searchable multi-select over non-deleted tasks. Tasks already in
 * `meetingId` are hidden; picking one that belongs to another meeting shows a
 * warning because linking moves it.
 */
export function TaskPicker({
  meetingId,
  selected,
  onChange,
  listClassName = "max-h-64",
}: {
  meetingId?: string | null;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Height of the scrolling list; defaults to a compact 16rem. */
  listClassName?: string;
}) {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: meetings = [] } = useMeetings();
  const [query, setQuery] = useState("");

  const meetingTitle = useMemo(
    () => new Map(meetings.map((m) => [m.id, m.title])),
    [meetings],
  );

  const candidates = useMemo(
    () => tasks.filter((t) => !meetingId || t.meeting_id !== meetingId),
    [tasks, meetingId],
  );

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return q ? candidates.filter((t) => norm(t.title).includes(q)) : candidates;
  }, [candidates, query]);

  const moving = candidates.filter(
    (t) => selected.includes(t.id) && t.meeting_id,
  );

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm công việc theo tên..."
          className="pl-8"
        />
      </div>

      <div className={cn("overflow-y-auto rounded-md border", listClassName)}>
        {isLoading ? (
          <p className="p-3 text-xs text-muted-foreground">Đang tải...</p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            Không có công việc phù hợp.
          </p>
        ) : (
          visible.map((t) => {
            const meta = TASK_STATUS_META[t.status];
            const current = t.meeting_id ? meetingTitle.get(t.meeting_id) : null;
            return (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selected.includes(t.id)}
                  onCheckedChange={() => toggle(t.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{t.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "rounded border px-1.5 text-[11px] font-medium",
                        meta.badge,
                      )}
                    >
                      {meta.label}
                    </span>
                    {current && <span className="truncate">Họp: {current}</span>}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>

      {moving.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {moving.length} công việc đang thuộc cuộc họp khác và sẽ được chuyển
            sang cuộc họp này:{" "}
            {moving
              .map((t) => `${t.title} (${meetingTitle.get(t.meeting_id!) ?? "họp khác"})`)
              .join("; ")}
          </span>
        </div>
      )}
    </div>
  );
}
