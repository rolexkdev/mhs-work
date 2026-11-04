"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { friendlyError } from "@/lib/errors";
import type { ExternalUnit } from "@/types/database";

export function useExternalUnits(
  opts: { includeInactive?: boolean } = {},
) {
  const includeInactive = !!opts.includeInactive;
  return useQuery({
    queryKey: queryKeys.externalUnits({ includeInactive }),
    queryFn: async (): Promise<ExternalUnit[]> => {
      const supabase = createClient();
      let q = supabase.from("external_units").select("*");
      if (!includeInactive) {
        q = q.eq("is_active", true);
      }
      const { data, error } = await q.order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CreateExternalUnitInput {
  name: string;
  address?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  note?: string | null;
}

export function useCreateExternalUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateExternalUnitInput,
    ): Promise<ExternalUnit> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("external_units")
        .insert({
          name: input.name.trim(),
          address: input.address?.trim() || null,
          contact_name: input.contact_name?.trim() || null,
          phone: input.phone?.trim() || null,
          note: input.note?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.externalUnitsAll });
      toast.success("Đã thêm đơn vị nhận");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export interface UpdateExternalUnitInput {
  id: string;
  name?: string;
  address?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  note?: string | null;
}

export function useUpdateExternalUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: UpdateExternalUnitInput,
    ): Promise<ExternalUnit> => {
      const supabase = createClient();
      const patch: {
        name?: string;
        address?: string | null;
        contact_name?: string | null;
        phone?: string | null;
        note?: string | null;
      } = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.address !== undefined)
        patch.address = input.address?.trim() || null;
      if (input.contact_name !== undefined)
        patch.contact_name = input.contact_name?.trim() || null;
      if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
      if (input.note !== undefined) patch.note = input.note?.trim() || null;

      const { data, error } = await supabase
        .from("external_units")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.externalUnitsAll });
      toast.success("Đã cập nhật đơn vị nhận");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useSetExternalUnitActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      isActive,
    }: {
      id: string;
      isActive: boolean;
    }): Promise<ExternalUnit> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("external_units")
        .update({ is_active: isActive })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_unit, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.externalUnitsAll });
      toast.success(
        vars.isActive
          ? "Đã kích hoạt lại đơn vị nhận"
          : "Đã ngừng sử dụng đơn vị nhận",
      );
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useDeleteExternalUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("external_units")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.externalUnitsAll });
      toast.success("Đã xoá đơn vị nhận");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
