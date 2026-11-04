import { notFound } from "next/navigation";
import { DocumentDetail } from "@/modules/documents/document-detail";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    notFound();
  }
  return (
    <div className="space-y-4">
      <DocumentDetail id={id} />
    </div>
  );
}
