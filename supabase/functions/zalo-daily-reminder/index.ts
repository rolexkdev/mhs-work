// Nhắc việc hằng ngày qua Zalo OA.
//
// Gọi bởi pg_cron mỗi sáng (xem supabase/zalo-cron.sql), header
// `x-cron-secret: <REMINDER_CRON_SECRET>`.
//   ?dry=1           → chỉ soạn tin, không gửi (xem trước nội dung)
//   ?profile=<uuid>  → chỉ chạy cho 1 người (thử nghiệm)
//   ?force=1         → gửi lại dù hôm nay đã gửi
//
// Deploy: supabase functions deploy zalo-daily-reminder --no-verify-jwt
import {
  adminClient,
  corsHeaders,
  env,
  getOaAccessToken,
  json,
  sendOaText,
} from "../_shared/zalo.ts";

type Task = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  assignee_id: string | null;
  manual_progress: number;
};

const TZ = "Asia/Ho_Chi_Minh";
const MAX_LINES = 5;

/** yyyy-mm-dd theo giờ Việt Nam. */
function vnDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function dayDiff(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(toYmd) - Date.parse(fromYmd)) / 86_400_000);
}

function ddmm(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

function compose(name: string, tasks: Task[], today: string): string | null {
  const overdue: string[] = [];
  const dueToday: string[] = [];
  const soon: string[] = [];

  const sorted = [...tasks].sort((a, b) =>
    (a.due_date ?? "").localeCompare(b.due_date ?? ""),
  );
  for (const t of sorted) {
    if (!t.due_date) continue;
    const due = vnDay(new Date(t.due_date));
    const diff = dayDiff(today, due);
    if (diff < 0) overdue.push(`• ${t.title} (trễ ${-diff} ngày)`);
    else if (diff === 0) dueToday.push(`• ${t.title} (${t.manual_progress ?? 0}%)`);
    else if (diff <= 3) soon.push(`• ${t.title} (hạn ${ddmm(due)})`);
  }
  if (!overdue.length && !dueToday.length && !soon.length) return null;

  const block = (title: string, lines: string[]) =>
    lines.length
      ? `${title} (${lines.length}):\n${lines.slice(0, MAX_LINES).join("\n")}${
          lines.length > MAX_LINES ? `\n… và ${lines.length - MAX_LINES} việc khác` : ""
        }`
      : null;

  const parts = [
    `📋 Chào ${name}, đây là việc cần chú ý hôm nay (${ddmm(today)}):`,
    block("⚠️ Quá hạn", overdue),
    block("📅 Đến hạn hôm nay", dueToday),
    block("🔜 3 ngày tới", soon),
  ].filter(Boolean);

  const miniAppId = Deno.env.get("ZALO_MINI_APP_ID");
  if (miniAppId) parts.push(`👉 Cập nhật tiến độ: https://zalo.me/s/${miniAppId}/`);

  // Tin tư vấn của OA giới hạn 2000 ký tự.
  return parts.join("\n\n").slice(0, 1990);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.headers.get("x-cron-secret") !== env("REMINDER_CRON_SECRET")) {
    return json({ message: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const onlyProfile = url.searchParams.get("profile");
  const today = vnDay(new Date());
  const db = adminClient();

  try {
    let q = db
      .from("zalo_links")
      .select("profile_id, zalo_oa_user_id, profiles(full_name, email)")
      .eq("remind_enabled", true)
      .not("zalo_oa_user_id", "is", null);
    if (onlyProfile) q = q.eq("profile_id", onlyProfile);
    const { data: links, error } = await q;
    if (error) throw error;
    if (!links?.length) return json({ today, sent: 0, note: "Không có ai cần nhắc" });

    const ids = links.map((l) => l.profile_id);
    const { data: tasks, error: taskErr } = await db
      .from("tasks")
      .select("id, title, status, due_date, assignee_id, manual_progress")
      .in("assignee_id", ids)
      .neq("status", "done");
    if (taskErr) throw taskErr;

    const { data: sentToday } = await db
      .from("zalo_reminder_log")
      .select("profile_id")
      .eq("sent_on", today)
      .eq("status", "sent");
    const already = new Set((sentToday ?? []).map((r) => r.profile_id));

    const token = dry ? "" : await getOaAccessToken(db);
    const results: { profile_id: string; status: string; message?: string; error?: string }[] = [];

    for (const l of links) {
      if (!force && already.has(l.profile_id)) {
        results.push({ profile_id: l.profile_id, status: "already_sent" });
        continue;
      }
      // deno-lint-ignore no-explicit-any
      const p = (l as any).profiles as { full_name: string | null; email: string } | null;
      const name = p?.full_name?.trim().split(/\s+/).pop() ?? "bạn";
      const text = compose(
        name,
        (tasks ?? []).filter((t) => t.assignee_id === l.profile_id),
        today,
      );

      if (!text) {
        results.push({ profile_id: l.profile_id, status: "nothing" });
        continue;
      }
      if (dry) {
        results.push({ profile_id: l.profile_id, status: "dry", message: text });
        continue;
      }

      try {
        await sendOaText(token, l.zalo_oa_user_id!, text);
        await db.from("zalo_reminder_log").insert({
          profile_id: l.profile_id,
          sent_on: today,
          status: "sent",
        });
        results.push({ profile_id: l.profile_id, status: "sent" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.from("zalo_reminder_log").insert({
          profile_id: l.profile_id,
          sent_on: today,
          status: "failed",
          error: msg,
        });
        results.push({ profile_id: l.profile_id, status: "failed", error: msg });
      }
    }

    return json({
      today,
      sent: results.filter((r) => r.status === "sent").length,
      results,
    });
  } catch (e) {
    console.error("zalo-daily-reminder", e);
    return json({ message: e instanceof Error ? e.message : "Lỗi không xác định" }, 500);
  }
});
