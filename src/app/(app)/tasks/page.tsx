import Link from "next/link";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { TasksWorkspace } from "@/modules/tasks/components/tasks-workspace";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("role").eq("id", userId).single()
    : { data: null };
  const isAdmin = profile?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Công việc</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Xem theo hạng mục của từng phòng/nhóm — bấm vào hạng mục để xem
            các công việc bên trong.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/tasks/trash"
            className={buttonVariants({ variant: "outline", size: "sm", className: "shrink-0" })}
          >
            <Trash2 className="h-4 w-4" /> Thùng rác
          </Link>
        )}
      </div>
      <TasksWorkspace />
    </div>
  );
}
