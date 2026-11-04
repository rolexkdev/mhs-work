import { DocumentDetail } from "@/modules/documents/document-detail";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <DocumentDetail id={id} />
    </div>
  );
}
