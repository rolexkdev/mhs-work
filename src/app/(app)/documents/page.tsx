import { DocumentsNav } from "@/modules/documents/documents-nav";
import { DocumentsWorkspace } from "@/modules/documents/documents-workspace";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Hồ sơ – Công văn
          </h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Quản lý hồ sơ, công văn, bàn giao xác nhận nội bộ và vận chuyển giữa
            các văn phòng, đơn vị.
          </p>
        </div>
        <DocumentsNav />
      </div>
      <DocumentsWorkspace />
    </div>
  );
}
