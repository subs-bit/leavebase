"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Check, Plus } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { PrismixMark } from "./ui/Logo";
import { timeAgo } from "@/lib/date";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
};

const KIND_COLOR: Record<string, string> = {
  APPROVED: "var(--c-success)",
  REJECTED: "var(--c-danger)",
  CANCELLED: "var(--c-neutral-ink)",
  REQUEST_SUBMITTED: "var(--brand-500)",
  COMP_EXPIRING: "var(--c-warning)",
  BALANCE_LAPSE: "var(--c-warning)",
  ABSENCE_FLAG: "var(--c-danger)",
};

export function TopBar({
  title,
  subtitle,
  notifications,
  unread,
  actions,
}: {
  title: string;
  subtitle?: string;
  notifications: NotificationItem[];
  unread: number;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(notifications);
  const [count, setCount] = useState(unread);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    setCount(0);
    await fetch("/api/notifications/read", { method: "POST" });
  }

  return (
    <header
      className="glass sticky top-0 z-30 border-b"
      style={{ borderColor: "var(--c-border)" }}
    >
      <div className="flex h-[72px] items-center gap-4 px-5 sm:px-7">
        <Link href="/" className="lg:hidden">
          <PrismixMark size={28} />
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] leading-tight sm:text-[24px]">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--c-ink-500)" }}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {actions}

          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
              className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full transition-colors"
              style={{ background: "var(--c-ink-100)", color: "var(--c-ink-500)" }}
            >
              <Bell size={16} />
              {count > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold"
                  style={{ background: "var(--c-danger)", color: "#fff", boxShadow: "0 0 0 2px var(--c-surface)" }}
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>

            {open && (
              <div
                className="card animate-pop absolute right-0 top-[46px] z-50 w-[340px] overflow-hidden sm:w-[380px]"
                style={{ boxShadow: "var(--sh-lift)" }}
              >
                <div
                  className="flex items-center justify-between border-b px-4 py-3"
                  style={{ borderColor: "var(--c-border)" }}
                >
                  <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                    Notifications
                  </p>
                  {count > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-[11.5px] font-bold"
                      style={{ color: "var(--brand-500)" }}
                    >
                      <Check size={12} /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-[380px] overflow-y-auto">
                  {items.length === 0 ? (
                    <p className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--c-ink-400)" }}>
                      Nothing new.
                    </p>
                  ) : (
                    <ul className="divide-line">
                      {items.map((n) => (
                        <li key={n.id}>
                          <Link
                            href={n.link || "#"}
                            onClick={() => setOpen(false)}
                            className="row-hover flex gap-3 px-4 py-3"
                            style={{ background: n.readAt ? undefined : "var(--c-ink-50)" }}
                          >
                            <span
                              className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                              style={{ background: KIND_COLOR[n.kind] ?? "var(--c-ink-400)" }}
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className="block text-[13px] font-bold leading-snug"
                                style={{ color: "var(--c-ink-900)" }}
                              >
                                {n.title}
                              </span>
                              {n.body && (
                                <span
                                  className="mt-0.5 block text-[12px] leading-snug"
                                  style={{ color: "var(--c-ink-500)" }}
                                >
                                  {n.body}
                                </span>
                              )}
                              <span className="mt-1 block text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                                {timeAgo(n.createdAt)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <ThemeToggle />

          <Link href="/apply" className="btn btn-primary hidden sm:inline-flex">
            <Plus size={15} strokeWidth={2.6} />
            Apply
          </Link>
        </div>
      </div>
    </header>
  );
}
