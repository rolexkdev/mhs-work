import { TasksWorkspace } from "@/modules/tasks/components/tasks-workspace";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Công việc</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Quản lý toàn bộ công việc — kéo thả thẻ giữa các cột để đổi trạng
          thái.
        </p>
      </div>
      <TasksWorkspace />
    </div>
  );
}
