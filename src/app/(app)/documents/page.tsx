import { DocumentsWorkspace } from "@/modules/documents/components/documents-workspace";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Hồ sơ</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Theo dõi hồ sơ giấy đang được phòng ban nào giữ trong lộ trình xử lý.
        </p>
      </div>
      <DocumentsWorkspace />
    </div>
  );
}
