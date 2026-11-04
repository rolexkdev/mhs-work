import { DocumentsNav } from "@/modules/documents/documents-nav";
import { ExternalUnitsManager } from "@/modules/documents/external-units-manager";

export default function ExternalUnitsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Đơn vị nhận bên ngoài
          </h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Danh bạ cơ quan, đối tác, đơn vị bên ngoài nhận hồ sơ – công văn.
          </p>
        </div>
        <DocumentsNav />
      </div>
      <ExternalUnitsManager />
    </div>
  );
}
