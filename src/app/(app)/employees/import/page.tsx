import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireHr } from "@/lib/auth";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/ui/primitives";
import { IMPORT_COLUMNS } from "@/lib/services/import";
import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "Import employees" };

export default async function ImportPage() {
  await requireHr();

  return (
    <>
      <PageHeader
        title="Import employees"
        subtitle="Bring your whole team in from a spreadsheet. Nothing is written until you've seen exactly what will happen."
        actions={
          <>
            <a href="/api/export/template.csv" className="btn btn-ghost hidden sm:inline-flex">
              <Download size={15} />
              Template
            </a>
            <Link href="/employees" className="btn btn-ghost hidden sm:inline-flex">
              <ArrowLeft size={15} />
              Back
            </Link>
          </>
        }
      />

      <PageBody>
        <div className="mx-auto max-w-[980px] space-y-5">
          <ImportWizard />

          <section className="card p-5 sm:p-6">
            <SectionHeader eyebrow="Reference" title="Columns" />
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
              Header names are matched case-insensitively and ignore spaces, so <code>Join Date</code>,
              <code> joindate</code> and <code> JOINDATE</code> are all the same column. Extra columns are
              ignored. Dates can be <code>2026-04-01</code>, <code>01/04/2026</code> or <code>01-Apr-2026</code>.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="eyebrow pb-2 pr-4">Column</th>
                    <th className="eyebrow pb-2 pr-4">Required</th>
                    <th className="eyebrow pb-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-line">
                  {IMPORT_COLUMNS.map((c) => (
                    <tr key={c.key}>
                      <td className="py-2 pr-4">
                        <code
                          className="rounded px-1.5 py-0.5 text-[11.5px] font-bold"
                          style={{ background: "var(--c-ink-100)", color: "var(--c-ink-700)" }}
                        >
                          {c.key}
                        </code>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className="text-[11.5px] font-bold"
                          style={{ color: c.required ? "var(--c-danger-ink)" : "var(--c-ink-400)" }}
                        >
                          {c.required ? "Required" : "Optional"}
                        </span>
                      </td>
                      <td className="py-2 text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                        {c.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </PageBody>
    </>
  );
}
