"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/modules/tasks/constants";
import { TaskCard } from "@/modules/tasks/components/task-card";
import type { Task, TaskStatus } from "@/types/database";

function DraggableCard({
  task,
  assigneeName,
  onEdit,
}: {
  task: Task;
  assigneeName: string | null;
  onEdit: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <TaskCard
        task={task}
        assigneeName={assigneeName}
        dragging={isDragging}
        onClick={() => onEdit(task)}
      />
    </div>
  );
}

function Column({
  status,
  tasks,
  nameOf,
  onEdit,
}: {
  status: TaskStatus;
  tasks: Task[];
  nameOf: (id: string | null) => string | null;
  onEdit: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = TASK_STATUS_META[status];
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <span className="text-sm font-medium">{meta.label}</span>
        <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver ? "border-primary bg-primary/5" : "border-transparent bg-muted/40",
        )}
      >
        {tasks.map((t) => (
          <DraggableCard
            key={t.id}
            task={t}
            assigneeName={nameOf(t.assignee_id)}
            onEdit={onEdit}
          />
        ))}
        {tasks.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Kéo thẻ vào đây
          </p>
        )}
      </div>
    </div>
  );
}

export function TaskBoard({
  tasks,
  nameOf,
  onEdit,
  onStatusChange,
}: {
  tasks: Task[];
  nameOf: (id: string | null) => string | null;
  onEdit: (t: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = String(over.id) as TaskStatus;
    const task = tasks.find((t) => t.id === active.id);
    if (task && task.status !== newStatus) {
      onStatusChange(task.id, newStatus);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status)}
            nameOf={nameOf}
            onEdit={onEdit}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            assigneeName={nameOf(activeTask.assignee_id)}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
