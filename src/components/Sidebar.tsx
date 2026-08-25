"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, CalendarDays, ChevronLeft, FileText, Gift, LayoutDashboard, LogOut,
  ScrollText, Settings, ShieldCheck, Users, UsersRound,
} from "lucide-react";
import { LeaveBaseLogo, PrismixMark } from "./ui/Logo";
import { Avatar } from "./ui/primitives";
import { ROLE_LABEL } from "@/lib/policy/types";
import type { Role } from "@/lib/policy/types";

export type NavUser = {
  id: string;
  name: string;
  role: string;
  designation: string;
  avatarHue: number;
  empCode: string;
};

type Item = { href: string; label: string; icon: typeof LayoutDashboard; badge?: number };

export function Sidebar({
  user, pendingCount = 0, canApprove, isHr, isAdmin, isFounder = false,
}: {
  user: NavUser;
  pendingCount?: number;
  canApprove: boolean;
  isHr: boolean;
  isAdmin: boolean;
  isFounder?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // A founder sits outside the policy and holds no balances, so the personal leave items would
  // only ever be empty for them.
  const primary: Item[] = isFounder
    ? [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/calendar", label: "Calendar", icon: CalendarDays },
      ]
    : [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/apply", label: "Apply for leave", icon: FileText },
        { href: "/requests", label: "My requests", icon: ScrollText },
        { href: "/comp-off", label: "Comp-off", icon: Gift },
        { href: "/calendar", label: "Calendar", icon: CalendarDays },
      ];

  const manage: Item[] = [
    ...(canApprove
      ? [
          { href: "/approvals", label: "Approvals", icon: ShieldCheck, badge: pendingCount },
          { href: "/team", label: "My team", icon: UsersRound },
        ]
      : []),
    ...(isHr
      ? [
          { href: "/employees", label: "Employees", icon: Users },
          { href: "/reports", label: "Reports", icon: BarChart3 },
        ]
      : []),
  ];

  const system: Item[] = [
    { href: "/policy", label: "Leave policy", icon: ScrollText },
    ...(isAdmin ? [{ href: "/settings", label: "Settings", icon: Settings }] : []),
  ];

  const width = collapsed ? 76 : 260;

  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 flex-col border-r lg:flex"
      style={{
        width,
        background: "var(--c-surface)",
        borderColor: "var(--c-border)",
        transition: "width 260ms cubic-bezier(.32,.72,0,1)",
      }}
    >
      <div className="flex h-[72px] items-center justify-between px-5">
        <Link href="/" className="overflow-hidden">
          {collapsed ? <PrismixMark size={30} /> : <LeaveBaseLogo size={32} />}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--c-ink-100)]"
            style={{ color: "var(--c-ink-400)" }}
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--c-ink-100)]"
          style={{ color: "var(--c-ink-400)" }}
        >
          <ChevronLeft size={15} className="rotate-180" />
        </button>
      )}

      <nav className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-none">
        <NavGroup items={primary} pathname={pathname} collapsed={collapsed} />
        {manage.length > 0 && (
          <NavGroup items={manage} pathname={pathname} collapsed={collapsed} title="Manage" />
        )}
        <NavGroup items={system} pathname={pathname} collapsed={collapsed} title="Reference" />
      </nav>

      <div className="border-t px-3 py-3" style={{ borderColor: "var(--c-border)" }}>
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--c-ink-50)]"
        >
          <Avatar name={user.name} hue={user.avatarHue} size={34} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                {user.name}
              </p>
              <p className="truncate text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                {ROLE_LABEL[user.role as Role] ?? user.role}
              </p>
            </div>
          )}
        </Link>
        <form action="/api/logout" method="post">
          <button
            type="submit"
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors hover:bg-[var(--c-ink-50)] ${
              collapsed ? "justify-center" : ""
            }`}
            style={{ color: "var(--c-ink-500)" }}
          >
            <LogOut size={16} />
            {!collapsed && "Sign out"}
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavGroup({
  items, pathname, collapsed, title,
}: {
  items: Item[];
  pathname: string;
  collapsed: boolean;
  title?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      {title && !collapsed && <p className="eyebrow mb-2 px-3">{title}</p>}
      {title && collapsed && (
        <div className="mx-3 mb-2 border-t" style={{ borderColor: "var(--c-border)" }} />
      )}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all duration-150 ${
                  collapsed ? "justify-center" : ""
                }`}
                style={
                  active
                    ? { background: "var(--lt-pl-tint)", color: "var(--lt-pl)" }
                    : { color: "var(--c-ink-500)" }
                }
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                    style={{ background: "var(--prism-arc)" }}
                  />
                )}
                <Icon size={17} strokeWidth={active ? 2.4 : 2} />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {!collapsed && !!item.badge && item.badge > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold"
                    style={{ background: "var(--c-warning)", color: "#fff" }}
                  >
                    {item.badge}
                  </span>
                )}
                {collapsed && !!item.badge && item.badge > 0 && (
                  <span
                    className="absolute right-2 top-2 h-2 w-2 rounded-full"
                    style={{ background: "var(--c-warning)" }}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Below `lg` the sidebar becomes a bottom tab bar. */
export function MobileNav({
  canApprove, pendingCount = 0,
}: {
  canApprove: boolean;
  pendingCount?: number;
}) {
  const pathname = usePathname();
  const items: Item[] = [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/apply", label: "Apply", icon: FileText },
    { href: "/requests", label: "Requests", icon: ScrollText },
    ...(canApprove
      ? [{ href: "/approvals", label: "Approvals", icon: ShieldCheck, badge: pendingCount }]
      : [{ href: "/calendar", label: "Calendar", icon: CalendarDays }]),
    { href: "/profile", label: "Profile", icon: Users },
  ];

  return (
    <nav
      className="glass fixed bottom-0 left-0 right-0 z-40 flex border-t lg:hidden"
      style={{ borderColor: "var(--c-border)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex flex-1 flex-col items-center gap-1 py-2.5"
            style={{ color: active ? "var(--lt-pl)" : "var(--c-ink-400)" }}
          >
            <Icon size={19} strokeWidth={active ? 2.4 : 2} />
            <span className="text-[10px] font-bold">{item.label}</span>
            {!!item.badge && item.badge > 0 && (
              <span
                className="absolute right-[26%] top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--c-warning)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
