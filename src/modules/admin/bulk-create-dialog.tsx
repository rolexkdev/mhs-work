"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_PASSWORD,
  ROLE_LABEL,
  parseAccountLines,
} from "@/modules/admin/constants";
import { useCreateAccountsBulk } from "@/modules/admin/hooks";

const PLACEHOLDER = `Phạm Thị Anh Đào	daopham.mh@sikico.com	admin
Nguyễn Ngọc Sơn	sonnguyen.mh@sikico.com	member
Vũ Minh Phú	phuvu.mh@sikico.com`;

export function BulkCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const bulk = useCreateAccountsBulk();
  const [text, setText] = useState("");
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof bulk.mutateAsync>
  > | null>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setPassword(DEFAULT_PASSWORD);
    setResult(null);
  }, [open]);

  // Xem trước ngay khi gõ để admin phát hiện dòng sai trước lúc bấm tạo.
  const preview = useMemo(() => parseAccountLines(text), [text]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview.accounts.length === 0) return;
    setResult(await bulk.mutateAsync({ text, password }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo tài khoản hàng loạt</DialogTitle>
          <DialogDescription>
            Dán thẳng bảng từ Excel hoặc Word. Mỗi dòng một người: họ tên, email,
            vai trò — phân cách bằng tab, dấu cách hay dấu | đều được. Thiếu vai
            trò thì mặc định là Thành viên.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium">
              Tạo thành công {result.created?.length ?? 0} tài khoản.
            </p>

            {!!result.failed?.length && (
              <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="font-medium text-destructive">
                  {result.failed.length} dòng không tạo được:
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {result.failed.map((f) => (
                    <li key={f.email}>
                      <span className="font-mono">{f.email}</span> — {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!result.skipped?.length && (
              <div className="space-y-1 rounded-md border bg-muted/40 p-3">
                <p className="font-medium">
                  {result.skipped.length} dòng bị bỏ qua (không tìm thấy email):
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {result.skipped.map((s, i) => (
                    <li key={i} className="truncate">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Xong
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="b-list">Danh sách</Label>
              <Textarea
                id="b-list"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PLACEHOLDER}
                className="min-h-48 font-mono text-xs"
                autoFocus
              />
            </div>

            {preview.accounts.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.accounts.map((a) => (
                      <tr key={a.email} className="border-b last:border-0">
                        <td className="px-3 py-1.5">{a.fullName}</td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">
                          {a.email}
                        </td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">
                          {ROLE_LABEL[a.role]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="b-password">Mật khẩu ban đầu (dùng chung)</Label>
              <Input
                id="b-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                disabled={bulk.isPending || preview.accounts.length === 0}
              >
                <Users className="h-4 w-4" />
                {bulk.isPending
                  ? "Đang tạo..."
                  : `Tạo ${preview.accounts.length} tài khoản`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
