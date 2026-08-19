"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { isBillingEnabled } from "@/lib/billing";

const items = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/inventory", label: "Inventory" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/test-drives", label: "Test Drives" },
  { href: "/dashboard/transfers", label: "RC Transfers" },
  { href: "/dashboard/store", label: "Storefront" },
  { href: "/dashboard/inspections", label: "Inspections" },
  { href: "/dashboard/loans", label: "Loans" },
  ...(isBillingEnabled() ? [{ href: "/dashboard/billing", label: "Billing" }] : []),
];

export function DashboardNav() {
  const pathname = usePathname();
  const [chatUnread, setChatUnread] = useState(0);
  const [leadsUnread, setLeadsUnread] = useState(0);

  useEffect(() => {
    const check = () => {
      fetch("/api/chat/conversations")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Array<{ unread: number }> | null) => {
          if (data) setChatUnread(data.reduce((s, c) => s + c.unread, 0));
        })
        .catch(() => {});
      fetch("/api/dealer/leads/unread-count")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { count: number } | null) => {
          if (data) setLeadsUnread(data.count);
        })
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [pathname]);

  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-red/10 text-brand-red"
                  : "text-foreground hover:bg-surface-muted"
              }`}
            >
              <span>{item.label}</span>
              {item.href === "/dashboard/leads" && leadsUnread > 0 ? (
                <span className="bg-brand-red inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
                  {leadsUnread}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
      <li>
        <Link
          href="/dashboard"
          className={`text-foreground hover:bg-surface-muted flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            chatUnread > 0 ? "font-semibold" : ""
          }`}
        >
          <span>Messages</span>
          {chatUnread > 0 && (
            <span className="bg-brand-red inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
              {chatUnread}
            </span>
          )}
        </Link>
      </li>
    </ul>
  );
}
