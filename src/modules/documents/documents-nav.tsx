"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyPendingHandoffs } from "@/modules/documents/handoff-hooks";
import { useMyShipmentConfirmations } from "@/modules/documents/shipment-hooks";

export function DocumentsNav() {
  const pathname = usePathname();
  const { data: pendingHandoffs = [] } = useMyPendingHandoffs();
  const { data: pendingShipments = [] } = useMyShipmentConfirmations();

  const isShipments = pathname.startsWith("/documents/shipments");
  const isExternalUnits = pathname.startsWith("/documents/external-units");
  const isDocuments = !isShipments && !isExternalUnits;

  const items = [
    {
      href: "/documents",
      label: "Hồ sơ",
      icon: FileText,
      active: isDocuments,
      badge: pendingHandoffs.length,
    },
    {
      href: "/documents/shipments",
      label: "Vận chuyển",
      icon: Truck,
      active: isShipments,
      badge: pendingShipments.length,
    },
    {
      href: "/documents/external-units",
      label: "Đơn vị nhận",
      icon: Building2,
      active: isExternalUnits,
      badge: 0,
    },
  ];

  return (
    <nav
      aria-label="Điều hướng phân hệ hồ sơ"
      className="flex items-center gap-1 overflow-x-auto border-b pb-2"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              item.active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
            {item.badge > 0 && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                  item.active
                    ? "bg-primary-foreground text-primary"
                    : "bg-amber-500 text-white",
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
