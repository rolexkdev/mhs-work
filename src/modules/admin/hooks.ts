"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import {
  createAccount,
  createAccountsBulk,
  deleteAccount,
  listAccounts,
  resetPassword,
  setAccountLocked,
  updateAccount,
} from "@/modules/admin/actions";
import type { AccountRow } from "@/modules/admin/constants";
import type { UserRole } from "@/types/database";

/** Dùng chung cho mọi mutation: làm mới bảng tài khoản + dropdown người thực hiện. */
function useRefreshAccounts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.accounts });
    qc.invalidateQueries({ queryKey: queryKeys.profiles });
  };
}

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async (): Promise<AccountRow[]> => {
      const res = await listAccounts();
      if (res.error) throw new Error(res.error);
      return res.accounts ?? [];
    },
  });
}

export function useCreateAccount() {
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: async (input: {
      fullName: string;
      email: string;
      role: UserRole;
      password?: string;
    }) => {
      const res = await createAccount(input);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      refresh();
      toast.success("Đã tạo tài khoản");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateAccountsBulk() {
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: async (input: { text: string; password?: string }) => {
      const res = await createAccountsBulk(input);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      refresh();
      const created = res.created?.length ?? 0;
      const failed = res.failed?.length ?? 0;
      if (created > 0) toast.success(`Đã tạo ${created} tài khoản`);
      if (failed > 0) toast.error(`${failed} dòng không tạo được`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateAccount() {
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      fullName: string;
      role: UserRole;
    }) => {
      const res = await updateAccount(input);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      refresh();
      toast.success("Đã cập nhật tài khoản");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: { userId: string; password?: string }) => {
      const res = await resetPassword(input);
      if (res.error) throw new Error(res.error);
      return res.password!;
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetAccountLocked() {
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: async (input: { userId: string; locked: boolean }) => {
      const res = await setAccountLocked(input);
      if (res.error) throw new Error(res.error);
      return input.locked;
    },
    onSuccess: (locked) => {
      refresh();
      toast.success(locked ? "Đã khoá tài khoản" : "Đã mở khoá tài khoản");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAccount() {
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await deleteAccount({ userId });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      refresh();
      toast.success("Đã xoá tài khoản");
    },
    // Lý do bị chặn xoá thường dài (còn công việc, bình luận...) — cho hiện lâu.
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });
}
