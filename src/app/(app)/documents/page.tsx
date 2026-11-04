import { DocumentsWorkspace } from "@/modules/documents/documents-workspace";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Hồ sơ – Công văn
        </h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Quản lý hồ sơ, công văn và bàn giao xác nhận nội bộ giữa các văn phòng,
          phòng ban.
        </p>
      </div>
      <DocumentsWorkspace />
    </div>
  );
}
