import "server-only";

import { db } from "@/lib/db";

export async function audit(opts: {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  let actorName = "System";
  if (opts.actorId) {
    const u = await db.user.findUnique({ where: { id: opts.actorId }, select: { name: true } });
    actorName = u?.name ?? "Unknown";
  }
  await db.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      actorName,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId ?? "",
      summary: opts.summary,
      meta: JSON.stringify(opts.meta ?? {}),
    },
  });
}

export async function notify(opts: {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
}): Promise<void> {
  await db.notification.create({
    data: {
      userId: opts.userId,
      kind: opts.kind,
      title: opts.title,
      body: opts.body ?? "",
      link: opts.link ?? "",
    },
  });
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
