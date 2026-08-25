"use server";

import { revalidatePath } from "next/cache";
import { requireHr } from "@/lib/auth";
import { commitImport, planImport, type ImportPlan } from "@/lib/services/import";

export type ImportState = {
  csv?: string;
  plan?: ImportPlan;
  result?: { created: number; updated: number; skipped: number; departments: number; errors: string[] };
  error?: string;
};

async function readCsv(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > 2_000_000) return null;
    return file.text();
  }
  const pasted = String(formData.get("csv") ?? "").trim();
  return pasted || null;
}

/** Step 1 — validate and report, writing nothing. */
export async function previewImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireHr();
  const csv = await readCsv(formData);
  if (!csv) return { error: "Choose a CSV file or paste the rows in. Files must be under 2 MB." };

  const plan = await planImport(csv);
  if (plan.fatal) return { csv, error: plan.fatal };
  return { csv, plan };
}

/** Step 2 — commit what passed validation. */
export async function commitImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const actor = await requireHr();
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "Nothing to import — start again." };

  const result = await commitImport(csv, actor);

  revalidatePath("/employees");
  revalidatePath("/reports");
  revalidatePath("/");
  return { result };
}
