import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "./TopBar";

/**
 * Server wrapper that hydrates the top bar with the viewer's notifications, so pages only have to
 * declare their own title.
 */
export async function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const user = await requireUser();

  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <TopBar
      title={title}
      subtitle={subtitle}
      unread={unread}
      actions={actions}
      notifications={rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}

/** Standard page body wrapper — the 1440px column and gutters from the design system. */
export function PageBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={`mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-7 sm:py-8 ${className}`}>
      {children}
    </main>
  );
}
