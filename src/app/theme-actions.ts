"use server";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * Persist the viewer's light/dark choice on their user record, so it follows them to any browser
 * or machine rather than living only in one device's localStorage.
 *
 * Fails silently for a signed-out visitor: the toggle still works for the session via
 * localStorage, there is simply nobody to remember it against.
 */
export async function saveThemeAction(theme: string): Promise<void> {
  if (theme !== "LIGHT" && theme !== "DARK" && theme !== "SYSTEM") return;

  const user = await getSessionUser();
  if (!user) return;

  await db.user
    .update({ where: { id: user.id }, data: { themePreference: theme } })
    .catch(() => {
      // A failed preference write must never interrupt what the user was doing.
    });
}
