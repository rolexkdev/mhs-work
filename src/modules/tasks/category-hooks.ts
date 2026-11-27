"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import type { TaskCategory } from "@/types/database";

/** All categories, ordered by department then sort_order. */
export function useTaskCategories() {
  return useQuery({
    queryKey: queryKeys.taskCategories,
    queryFn: async (): Promise<TaskCategory[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_categories")
        .select("*")
        .order("department")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/** Categories of one department, in display order. */
export function categoriesOf(
  categories: TaskCategory[],
  department: string | null,
): TaskCategory[] {
  if (!department) return [];
  return categories.filter((c) => c.department === department);
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.taskCategories });
    // Deleting a category clears category_id on its tasks.
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };
}

export function useCreateTaskCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      department: string;
      name: string;
      sort_order: number;
      color: string;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_categories")
        .insert({ ...input, name: input.name.trim() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Đã thêm hạng mục");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useUpdateTaskCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<
      Pick<TaskCategory, "name" | "sort_order" | "color">
    >) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("task_categories")
        .update(patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Saves a new order: sort_order becomes the 1-based position in the list. */
export function useReorderTaskCategories() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (ordered: TaskCategory[]) => {
      const supabase = createClient();
      const changed = ordered
        .map((c, index) => ({ c, order: index + 1 }))
        .filter(({ c, order }) => c.sort_order !== order);
      const results = await Promise.all(
        changed.map(({ c, order }) =>
          supabase
            .from("task_categories")
            .update({ sort_order: order })
            .eq("id", c.id),
        ),
      );
      const error = results.find((r) => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useDeleteTaskCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_categories")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Không có quyền xoá hạng mục này");
    },
    onSuccess: () => {
      invalidate();
      toast.success("Đã xoá hạng mục");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
