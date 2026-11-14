"use client";

import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { TaskLog } from "@/types/database";

/** One row in an account's activity timeline (newest first). */
export type ActivityEvent =
  | { type: "login"; id: string; at: string }
  | { type: "page_view"; id: string; at: string; path: string }
  | {
      type: "task_change";
      id: string;
      at: string;
      taskId: string;
      taskTitle: string | null;
      log: TaskLog;
    }
  | {
      type: "assigned";
      id: string;
      at: string;
      taskId: string;
      taskTitle: string | null;
      /** Who made the assignment; null when unknown. */
      byId: string | null;
    }
  | {
      type: "comment";
      id: string;
      at: string;
      taskId: string;
      taskTitle: string | null;
      content: string;
    };

const LIMIT = 1000;

/** Assignee logs store a list of ids since 0015 (a single id before). */
function hasUser(value: unknown, userId: string): boolean {
  return Array.isArray(value) ? value.includes(userId) : value === userId;
}

/**
 * Activity of one account over the last `days` days: sign-ins and page views
 * (user_activity, 0021), task changes and comments they made, and tasks
 * assigned to them. Admin-only — user_activity RLS returns nothing otherwise.
 */
export function useAccountActivity(userId: string | null, days: number) {
  return useQuery({
    queryKey: queryKeys.accountActivity(userId ?? "", days),
    enabled: !!userId,
    queryFn: async (): Promise<{
      events: ActivityEvent[];
      /** True when sign-ins / page views could not be read (0021 missing). */
      trackingUnavailable: boolean;
    }> => {
      const uid = userId!;
      const supabase = createClient();
      const since = subDays(new Date(), days).toISOString();

      const [visits, ownLogs, assignLogs, createdTasks, comments] =
        await Promise.all([
          supabase
            .from("user_activity")
            .select("*")
            .eq("user_id", uid)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(LIMIT),
          // Changes the user made (including the assignee changes they made).
          supabase
            .from("task_logs")
            .select("*")
            .eq("created_by", uid)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(LIMIT),
          // Assignee changes that put the user on a task.
          supabase
            .from("task_logs")
            .select("*")
            .eq("action", "assignee")
            .contains("new_value", JSON.stringify([uid]))
            .gte("created_at", since)
            .limit(LIMIT),
          // Tasks created with the user already assigned.
          supabase
            .from("tasks")
            .select("id, title, created_at, created_by")
            .contains("assignee_ids", [uid])
            .gte("created_at", since)
            .limit(LIMIT),
          supabase
            .from("task_comments")
            .select("*")
            .eq("user_id", uid)
            .gte("created_at", since)
            .limit(LIMIT),
        ]);

      // user_activity may not exist yet if 0021 has not been applied: show
      // the rest of the history instead of failing the whole panel.
      for (const res of [ownLogs, assignLogs, createdTasks, comments]) {
        if (res.error) throw res.error;
      }

      const events: ActivityEvent[] = [];

      for (const v of visits.data ?? []) {
        events.push(
          v.kind === "login"
            ? { type: "login", id: `a${v.id}`, at: v.created_at }
            : {
                type: "page_view",
                id: `a${v.id}`,
                at: v.created_at,
                path: v.path ?? "/",
              },
        );
      }

      const addedLogs = (assignLogs.data ?? []).filter(
        (l) => !hasUser(l.old_value, uid),
      );
      const addedTaskIds = new Set(addedLogs.map((l) => l.task_id));

      for (const l of addedLogs) {
        events.push({
          type: "assigned",
          id: `g${l.id}`,
          at: l.created_at,
          taskId: l.task_id,
          taskTitle: null,
          byId: l.created_by,
        });
      }

      // A task whose assignees were never changed to include the user was
      // assigned at creation time.
      for (const t of createdTasks.data ?? []) {
        if (addedTaskIds.has(t.id)) continue;
        events.push({
          type: "assigned",
          id: `n${t.id}`,
          at: t.created_at,
          taskId: t.id,
          taskTitle: t.title,
          byId: t.created_by,
        });
      }

      for (const l of ownLogs.data ?? []) {
        events.push({
          type: "task_change",
          id: `l${l.id}`,
          at: l.created_at,
          taskId: l.task_id,
          taskTitle: null,
          log: l,
        });
      }

      for (const c of comments.data ?? []) {
        events.push({
          type: "comment",
          id: `c${c.id}`,
          at: c.created_at,
          taskId: c.task_id,
          taskTitle: null,
          content: c.content,
        });
      }

      // Fill in task titles in one extra query.
      const missing = [
        ...new Set(
          events.flatMap((e) =>
            "taskId" in e && e.taskTitle === null ? [e.taskId] : [],
          ),
        ),
      ];
      if (missing.length > 0) {
        const { data: tasks, error } = await supabase
          .from("tasks")
          .select("id, title")
          .in("id", missing);
        if (error) throw error;
        const titleById = new Map((tasks ?? []).map((t) => [t.id, t.title]));
        for (const e of events) {
          if ("taskId" in e && e.taskTitle === null) {
            e.taskTitle = titleById.get(e.taskId) ?? null;
          }
        }
      }

      events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return { events, trackingUnavailable: !!visits.error };
    },
  });
}
