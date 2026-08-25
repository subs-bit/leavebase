import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

/**
 * Serves the leave policy PDF to signed-in employees only.
 *
 * The document is marked "Proprietary & Confidential — unauthorized use or distribution is
 * prohibited", so it deliberately does not live in /public, which Next.js serves to anyone who
 * knows the URL. It sits in /private-assets and is read here behind a session check.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to read the leave policy." }, { status: 401 });
  }

  try {
    const file = path.join(process.cwd(), "private-assets", "prismix-leave-policy.pdf");
    const bytes = await readFile(file);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // inline so it opens in the browser's viewer rather than forcing a download
        "Content-Disposition": 'inline; filename="Prismix-Leave-Policy.pdf"',
        // private: never let a shared cache or CDN hold a copy
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The policy document isn't available on this deployment." },
      { status: 404 },
    );
  }
}
