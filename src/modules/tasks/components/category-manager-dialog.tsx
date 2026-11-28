"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  TAG_ACCENT_CLASS,
  TAG_COLORS,
  TASK_DEPARTMENTS,
  categoryColor,
  nextCategoryColor,
  taskDepartmentsFor,
  type TagColor,
} from "@/modules/tasks/constants";
import { useTasks } from "@/modules/tasks/hooks";
import {
  categoriesOf,
  useCreateTaskCategory,
  useDeleteTaskCategory,
  useReorderTaskCategories,
  useTaskCategories,
  useUpdateTaskCategory,
} from "@/modules/tasks/category-hooks";
import type { TaskCategory } from "@/types/database";

/**
 * Add, rename, reorder and delete the categories of a department.
 * Mount it only while open: it loads every active task to count them.
 */
export function CategoryManagerDialog({
  open,
  onOpenChange,
  department: initialDepartment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Department shown first; the user can switch inside the dialog. */
  department: string | null;
}) {
  const { data: allCategories = [] } = useTaskCategories();
  const { data: tasks = [] } = useTasks();
  const countById = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks)
      if (t.category_id) m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1);
    return m;
  }, [tasks]);
  const taskCountOf = (id: string) => countById.get(id) ?? 0;
  const createCategory = useCreateTaskCategory();
  const updateCategory = useUpdateTaskCategory();
  const reorder = useReorderTaskCategories();
  const deleteCategory = useDeleteTaskCategory();

  const [department, setDepartment] = useState<string>(
    initialDepartment ?? TASK_DEPARTMENTS[0].value,
  );
  const [newName, setNewName] = useState("");
  /** null = use the suggested color (first one unused in the department). */
  const [newColor, setNewColor] = useState<TagColor | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TaskCategory | null>(null);

  useEffect(() => {
    if (!open) return;
    setDepartment(initialDepartment ?? TASK_DEPARTMENTS[0].value);
    setNewName("");
    setNewColor(null);
    setEditingId(null);
  }, [open, initialDepartment]);

  const categories = categoriesOf(allCategories, department);
  const addColor = newColor ?? nextCategoryColor(categories);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), 0);
    createCategory.mutate(
      {
        department,
        name,
        sort_order: maxOrder + 1,
        color: addColor,
      },
      {
        onSuccess: () => {
          setNewName("");
          setNewColor(null);
        },
      },
    );
  }

  function startEdit(c: TaskCategory) {
    setEditingId(c.id);
    setEditName(c.name);
  }

  function saveEdit(c: TaskCategory) {
    const name = editName.trim();
    if (!name || name === c.name) {
      setEditingId(null);
      return;
    }
    updateCategory.mutate(
      { id: c.id, name },
      { onSuccess: () => setEditingId(null) },
    );
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next);
  }

  const pendingCount = pendingDelete ? taskCountOf(pendingDelete.id) : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          onEscapeKeyDown={(e) => {
            if (editingId) {
              e.preventDefault();
              setEditingId(null);
            }
          }}
        >
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-lg">Quản lý hạng mục</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Mỗi phòng/nhóm có danh sách hạng mục riêng. Nhân viên tự xếp công
              việc vào hạng mục phù hợp.
            </p>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <Select
              value={department}
              onValueChange={(v) => {
                setDepartment(v);
                setNewColor(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {taskDepartmentsFor(department).map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {categories.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                Phòng/nhóm này chưa có hạng mục nào.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {categories.map((c, index) => (
                  <li key={c.id} className="flex items-center gap-1 px-2 py-1.5">
                    {editingId === c.id ? (
                      <>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveEdit(c);
                            }
                          }}
                          className="h-8 flex-1"
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Lưu"
                          onClick={() => saveEdit(c)}
                          disabled={updateCategory.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Huỷ"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <ColorPicker
                          value={categoryColor(c)}
                          onChange={(color) =>
                            updateCategory.mutate({ id: c.id, color })
                          }
                          disabled={updateCategory.isPending}
                        />
                        <span className="min-w-0 flex-1 truncate px-1 text-sm">
                          {c.name}
                        </span>
                        <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground">
                          {taskCountOf(c.id)} việc
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Lên"
                          disabled={index === 0 || reorder.isPending}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Xuống"
                          disabled={
                            index === categories.length - 1 || reorder.isPending
                          }
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Đổi tên"
                          onClick={() => startEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Xoá"
                          onClick={() => setPendingDelete(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAdd} className="flex items-center gap-2">
              <ColorPicker value={addColor} onChange={setNewColor} large />
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tên hạng mục mới"
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={!newName.trim() || createCategory.isPending}
              >
                <Plus className="h-4 w-4" /> Thêm
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Xoá hạng mục?"
        description={
          pendingDelete
            ? pendingCount > 0
              ? `"${pendingDelete.name}" đang có ${pendingCount} công việc. Các công việc này sẽ chuyển về "Chưa phân hạng mục", không bị xoá.`
              : `"${pendingDelete.name}" sẽ bị xoá.`
            : undefined
        }
        confirmLabel="Xoá"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteCategory.mutate(pendingDelete.id);
        }}
      />
    </>
  );
}

/** Swatch button opening the 12 tag colors. */
function ColorPicker({
  value,
  onChange,
  disabled,
  large,
}: {
  value: TagColor;
  onChange: (color: TagColor) => void;
  disabled?: boolean;
  /** Match the 36px input of the add form. */
  large?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Chọn màu hạng mục"
          title="Chọn màu"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            large ? "h-9 w-9" : "h-8 w-8",
          )}
        >
          <span
            className={cn(
              "h-4 w-4 rounded-full shadow-sm",
              TAG_ACCENT_CLASS[value].solid,
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto p-2">
        <DropdownMenuLabel className="px-1 pb-2 pt-0 text-xs font-medium text-muted-foreground">
          Màu hạng mục
        </DropdownMenuLabel>
        <div className="grid grid-cols-6 gap-1.5">
          {TAG_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => {
                setOpen(false);
                if (color !== value) onChange(color);
              }}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-white transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                TAG_ACCENT_CLASS[color].solid,
                color === value && "ring-2 ring-foreground ring-offset-2",
              )}
            >
              {color === value && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
