import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/services/activity";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await markNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
}
