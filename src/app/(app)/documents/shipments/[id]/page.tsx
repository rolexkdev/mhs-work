import { DocumentsNav } from "@/modules/documents/documents-nav";
import { ShipmentDetail } from "@/modules/documents/shipment-detail";

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <DocumentsNav />
      <ShipmentDetail id={id} />
    </div>
  );
}
