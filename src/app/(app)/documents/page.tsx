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
            Tiếp nhận hồ sơ, công văn và phân chia về đúng phòng ban, người xử lý.
          </p>
        </div>
      </div>
      <DocumentsWorkspace />
    </div>
  );
}
