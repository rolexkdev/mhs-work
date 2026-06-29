"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, ListChecks, CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTasks } from "@/modules/tasks/hooks";
import { useMeetings } from "@/modules/meetings/hooks";
import { TASK_STATUS_META } from "@/modules/tasks/constants";
import { formatDateTime } from "@/lib/format";

/** Hộp tìm nhanh toàn cục — mở bằng Ctrl/Cmd + K. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: tasks = [] } = useTasks();
  const { data: meetings = [] } = useMeetings();

  // Phím tắt Ctrl/Cmd + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("command-palette:open", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("command-palette:open", onOpen);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Tìm kiếm nhanh</DialogTitle>
        <Command className="flex flex-col" loop>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Tìm công việc, cuộc họp..."
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              Không tìm thấy kết quả.
            </Command.Empty>

            {tasks.length > 0 && (
              <Command.Group
                heading="Công việc"
                className="px-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {tasks.map((t) => (
                  <Command.Item
                    key={t.id}
                    value={`task ${t.title} ${t.id}`}
                    onSelect={() => go(`/tasks?task=${t.id}`)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{t.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {TASK_STATUS_META[t.status].label}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {meetings.length > 0 && (
              <Command.Group
                heading="Cuộc họp"
                className="px-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {meetings.map((m) => (
                  <Command.Item
                    key={m.id}
                    value={`meeting ${m.title} ${m.id}`}
                    onSelect={() => go(`/meetings/${m.id}`)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{m.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(m.meeting_date)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
