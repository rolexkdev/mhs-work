import { TasksWorkspace } from "@/modules/tasks/components/tasks-workspace";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Công việc</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý toàn bộ công việc — kéo thả thẻ giữa các cột để đổi trạng
          thái.
        </p>
      </div>
      <TasksWorkspace />
    </div>
  );
}
