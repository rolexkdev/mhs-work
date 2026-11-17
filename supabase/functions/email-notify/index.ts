// Email notifications for task assignment and new comments.
//
// Called only by Postgres triggers (migration 0022) through pg_net, with
// header `x-notify-secret: <EMAIL_NOTIFY_SECRET>`. Body:
//   { type: "assigned", task_id, actor_id, recipient_ids: uuid[] }
//   { type: "comment",  comment_id }
//
// Sends through the Resend HTTP API (https://resend.com/docs/api-reference).
// EMAIL_FROM must use a domain verified in Resend; without one, Resend only
// delivers to the Resend account owner's own address.
//
// Env (supabase secrets set …):
//   EMAIL_NOTIFY_SECRET  shared secret, same value as the Vault secret
//   RESEND_API_KEY       Resend API key (re_…)
//   EMAIL_FROM           e.g. "TaskApp <taskapp@company.vn>"
//   APP_URL              e.g. https://taskapp.company.vn — used for links
//
// Deploy: supabase functions deploy email-notify --no-verify-jwt
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, env, json } from "../_shared/zalo.ts";

type Kind = "assigned" | "comment";

type Payload =
  | { type: "assigned"; task_id: string; actor_id: string | null; recipient_ids: string[] }
  | { type: "comment"; comment_id: string };

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  created_by: string;
  assignee_ids: string[];
};

type Person = { id: string; email: string; full_name: string | null };

type Mail = { subject: string; heading: string; lines: [string, string][]; body?: string };

const TZ = "Asia/Ho_Chi_Minh";

const PRIORITY: Record<string, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function vnDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function nameOf(p: Person | undefined | null): string {
  return p?.full_name?.trim() || p?.email || "Ai đó";
}

function taskLink(taskId: string): string {
  const base = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
  return base ? `${base}/tasks?task=${taskId}` : "";
}

function render(mail: Mail, link: string): { html: string; text: string } {
  const rows = mail.lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap">${esc(k)}</td>` +
        `<td style="padding:4px 0;color:#0f172a">${esc(v)}</td></tr>`,
    )
    .join("");
  const body = mail.body
    ? `<div style="margin:16px 0;padding:12px 14px;background:#f1f5f9;border-left:3px solid #2563eb;border-radius:4px;white-space:pre-wrap;color:#0f172a">${esc(mail.body)}</div>`
    : "";
  const button = link
    ? `<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Mở công việc</a></p>`
    : "";
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;max-width:560px">` +
    `<h2 style="font-size:16px;margin:0 0 12px;color:#0f172a">${esc(mail.heading)}</h2>` +
    `<table style="border-collapse:collapse">${rows}</table>${body}${button}` +
    `<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">Email tự động từ TaskApp — vui lòng không trả lời.</p>` +
    `</div>`;

  const text = [
    mail.heading,
    "",
    ...mail.lines.map(([k, v]) => `${k}: ${v}`),
    ...(mail.body ? ["", mail.body] : []),
    ...(link ? ["", `Mở công việc: ${link}`] : []),
  ].join("\n");

  return { html, text };
}

async function loadTask(db: SupabaseClient, id: string): Promise<Task | null> {
  const { data, error } = await db
    .from("tasks")
    .select("id, title, description, due_date, priority, created_by, assignee_ids")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Task | null;
}

async function loadPeople(db: SupabaseClient, ids: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("id", unique);
  if (error) throw error;
  return new Map((data as Person[]).map((p) => [p.id, p]));
}

/** Locked accounts (banned in /accounts) should not receive mail. */
async function isLocked(db: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await db.auth.admin.getUserById(id);
  const until = (data?.user as { banned_until?: string | null } | undefined)?.banned_until;
  return !!until && Date.parse(until) > Date.now();
}

async function sendResend(
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
}

function taskLines(task: Task): [string, string][] {
  const lines: [string, string][] = [["Công việc", task.title]];
  if (task.due_date) lines.push(["Hạn hoàn thành", vnDate(task.due_date)]);
  lines.push(["Độ ưu tiên", PRIORITY[task.priority] ?? task.priority]);
  return lines;
}

async function build(
  db: SupabaseClient,
  p: Payload,
): Promise<{ kind: Kind; task: Task; recipients: string[]; mail: Mail } | null> {
  if (p.type === "assigned") {
    const task = await loadTask(db, p.task_id);
    if (!task) return null;
    // Only people still assigned when the mail goes out.
    const recipients = p.recipient_ids.filter((id) => task.assignee_ids.includes(id));
    const people = await loadPeople(db, p.actor_id ? [p.actor_id] : []);
    const actor = p.actor_id ? nameOf(people.get(p.actor_id)) : "Hệ thống";
    const description = task.description?.trim();
    return {
      kind: "assigned",
      task,
      recipients,
      mail: {
        subject: `[TaskApp] Bạn được giao việc: ${task.title}`,
        heading: `${actor} đã giao cho bạn một công việc`,
        lines: taskLines(task),
        body: description ? description.slice(0, 1000) : undefined,
      },
    };
  }

  if (p.type === "comment") {
    const { data: comment, error } = await db
      .from("task_comments")
      .select("id, task_id, user_id, content")
      .eq("id", p.comment_id)
      .maybeSingle();
    if (error) throw error;
    if (!comment) return null;
    const task = await loadTask(db, comment.task_id);
    if (!task) return null;
    const recipients = [...new Set([...task.assignee_ids, task.created_by])].filter(
      (id) => id && id !== comment.user_id,
    );
    const people = await loadPeople(db, [comment.user_id]);
    const author = nameOf(people.get(comment.user_id));
    return {
      kind: "comment",
      task,
      recipients,
      mail: {
        subject: `[TaskApp] ${author} bình luận: ${task.title}`,
        heading: `${author} đã bình luận về công việc`,
        lines: taskLines(task),
        body: String(comment.content).slice(0, 2000),
      },
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);
  if (req.headers.get("x-notify-secret") !== env("EMAIL_NOTIFY_SECRET")) {
    return json({ message: "Unauthorized" }, 401);
  }

  const db = adminClient();
  try {
    const payload = (await req.json()) as Payload;
    const built = await build(db, payload);
    if (!built || !built.recipients.length) return json({ sent: 0 });

    const { kind, task, recipients, mail } = built;
    const people = await loadPeople(db, recipients);
    const { html, text } = render(mail, taskLink(task.id));

    const from = env("EMAIL_FROM");

    const results: { recipient_id: string; status: string; error?: string }[] = [];
    for (const id of recipients) {
      const person = people.get(id);
      const log = (status: string, error?: string) =>
        db.from("email_notification_log").insert({
          kind,
          task_id: task.id,
          recipient_id: id,
          email: person?.email ?? null,
          status,
          error: error ?? null,
        });

      if (!person?.email || (await isLocked(db, id))) {
        await log("skipped", person?.email ? "account locked" : "no email");
        results.push({ recipient_id: id, status: "skipped" });
        continue;
      }
      try {
        await sendResend(from, person.email, mail.subject, html, text);
        await log("sent");
        results.push({ recipient_id: id, status: "sent" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await log("failed", msg);
        results.push({ recipient_id: id, status: "failed", error: msg });
      }
    }

    return json({ sent: results.filter((r) => r.status === "sent").length, results });
  } catch (e) {
    console.error("email-notify", e);
    return json({ message: e instanceof Error ? e.message : "Lỗi không xác định" }, 500);
  }
});
