"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { Bell, CalendarClock, CheckCheck, MessageSquare, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProfiles } from "@/modules/auth/use-profiles";
import {
  useMarkNotificationsRead,
  useNotifications,
} from "@/modules/notifications/hooks";
import type { AppNotification, NotificationKind } from "@/types/database";

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  assigned: UserPlus,
  comment: MessageSquare,
  due_date: CalendarClock,
};

function describe(n: AppNotification) {
  const title = <b className="font-medium text-foreground">{n.data.title ?? "một công việc"}</b>;
  switch (n.kind) {
    case "assigned":
      return (
        <>
          đã giao cho bạn {title}
          {n.data.due_date && <> · hạn {formatDate(n.data.due_date)}</>}
        </>
      );
    case "comment":
      return (
        <>
          đã bình luận trong {title}
          {n.data.comment && (
            <span className="mt-0.5 line-clamp-2 block italic">
              “{n.data.comment}”
            </span>
          )}
        </>
      );
    case "due_date":
      return n.data.due_date ? (
        <>
          đã đặt hạn chót {title} là{" "}
          <b className="font-medium text-foreground">{formatDate(n.data.due_date)}</b>
        </>
      ) : (
        <>đã bỏ hạn chót của {title}</>
      );
  }
}

/** Chuông thông báo: số chưa đọc, danh sách mới nhất, bấm vào mở công việc. */
export function NotificationBell({
  align = "end",
  className,
}: {
  align?: "start" | "end";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const { data: profiles = [] } = useProfiles();
  const markRead = useMarkNotificationsRead();

  const profileOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [profiles]);

  const unread = notifications.filter((n) => !n.read_at).length;

  function openNotification(n: AppNotification) {
    if (!n.read_at) markRead.mutate([n.id]);
    setOpen(false);
    if (n.task_id) router.push(`/tasks?task=${n.task_id}`);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            className,
          )}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Thông báo</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => markRead.mutate(undefined)}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Đánh dấu đã đọc
            </Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Chưa có thông báo nào.
          </p>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {notifications.map((n) => {
              const actor = profileOf(n.actor_id);
              const name = actor?.full_name ?? actor?.email ?? "Ai đó";
              const Icon = KIND_ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      "flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                      !n.read_at && "bg-primary/5",
                    )}
                  >
                    <span className="relative shrink-0">
                      <Avatar className="h-8 w-8">
                        {actor?.avatar_url && (
                          <AvatarImage src={actor.avatar_url} alt={name} />
                        )}
                        <AvatarFallback className="text-[11px]">
                          {initials(name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-1 ring-border">
                        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">{name}</span>{" "}
                      {describe(n)}
                      <span className="mt-0.5 block text-[11px]">
                        {formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                          locale: vi,
                        })}
                      </span>
                    </span>
                    {!n.read_at && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
