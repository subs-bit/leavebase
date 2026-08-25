import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { evaluateDraft } from "@/lib/services/leave";
import { LEAVE_TYPES } from "@/lib/policy/types";

const schema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  halfDay: z.enum(["NONE", "FIRST_HALF", "SECOND_HALF"]).default("NONE"),
  hasMedicalDoc: z.boolean().optional(),
  expectedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  maternityPattern: z.enum(["SPLIT_8_18", "POST_26"]).nullable().optional(),
  forUserId: z.string().optional(),
});

/**
 * Live policy evaluation for the application form. The same function runs at submission, so the
 * preview can never disagree with the decision.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const d = parsed.data;
  try {
    const evaluation = await evaluateDraft(user.id, {
      leaveType: d.leaveType,
      start: d.start,
      end: d.end,
      halfDay: d.halfDay,
      reason: "",
      hasMedicalDoc: d.hasMedicalDoc,
      expectedDelivery: d.expectedDelivery ?? null,
      maternityPattern: d.maternityPattern ?? null,
    });
    return NextResponse.json(evaluation);
  } catch {
    return NextResponse.json({ error: "Could not evaluate those dates." }, { status: 500 });
  }
}
