import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TaskTrash } from "@/modules/tasks/components/task-trash";

/** Admin-only: blocked on the server so other roles cannot open it by URL. */
export default async function TaskTrashPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role !== "admin") redirect("/tasks");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Công việc
        </Link>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Thùng rác
        </h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Công việc đã bị xoá. Lịch sử, bình luận và tiến độ vẫn được giữ; bấm
          Khôi phục để đưa công việc về danh sách.
        </p>
      </div>
      <TaskTrash />
    </div>
  );
}
