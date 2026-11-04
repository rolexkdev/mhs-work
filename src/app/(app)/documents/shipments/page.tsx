import { DocumentsNav } from "@/modules/documents/documents-nav";
import { ShipmentsWorkspace } from "@/modules/documents/shipments-workspace";

export default function ShipmentsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Vận chuyển hồ sơ
          </h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Theo dõi các chuyến vận chuyển hồ sơ giữa các văn phòng và gửi đến
            đơn vị bên ngoài.
          </p>
        </div>
        <DocumentsNav />
      </div>
      <ShipmentsWorkspace />
    </div>
  );
}
