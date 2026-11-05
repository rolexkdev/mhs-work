import { cn } from "@/lib/utils";
import {
  DOCUMENT_FLOW_STATUS_META,
  type DocumentFlowStatus,
} from "@/modules/documents/constants";
import type { Office } from "@/types/database";

export function DocumentFlowStatusBadge({
  status,
  office,
  recipientNames,
  className,
}: {
  status: DocumentFlowStatus;
  office: Office | undefined;
  recipientNames?: string[];
  className?: string;
}) {
  const meta = DOCUMENT_FLOW_STATUS_META[status];
  const names = recipientNames?.filter(Boolean) ?? [];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        meta.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      <span>{meta.label}</span>
      {status === "in_transit"
        ? names.length > 0 && (
            <span className="font-normal">→ {names.join(", ")}</span>
          )
        : office && (
            <span title={office.name} className="font-normal">
              · {office.code}
            </span>
          )}
    </span>
  );
}
