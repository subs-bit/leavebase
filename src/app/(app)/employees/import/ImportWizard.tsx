"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, FileUp, Loader2, RotateCcw, TriangleAlert, UserPlus, UserCog,
} from "lucide-react";
import { commitImportAction, previewImportAction, type ImportState } from "./actions";
import { PolicyNote, SectionHeader } from "@/components/ui/primitives";

function Submit({ label, icon }: { label: string; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? <Loader2 size={14} className="animate-spin" /> : icon}
      {pending ? "Working…" : label}
    </button>
  );
}

export function ImportWizard() {
  const [previewState, previewAction] = useActionState<ImportState, FormData>(previewImportAction, {});
  const [commitState, commitAction] = useActionState<ImportState, FormData>(commitImportAction, {});
  const [fileName, setFileName] = useState("");

  // ── step 3: done ──────────────────────────────────────────────────────────
  if (commitState.result) {
    const r = commitState.result;
    return (
      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={22} style={{ color: "var(--c-success)", marginTop: 2 }} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px]">Import complete</h2>
            <p className="mt-1 text-[13px]" style={{ color: "var(--c-ink-500)" }}>
              Everyone created has a temporary password. Issue it from their record — open the
              employee, choose Edit, then Reset password.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Tally label="Created" value={r.created} tone="var(--c-success-ink)" tint="var(--c-success-tint)" />
              <Tally label="Updated" value={r.updated} tone="var(--lt-pl)" tint="var(--lt-pl-tint)" />
              <Tally label="Skipped" value={r.skipped} tone="var(--c-warning-ink)" tint="var(--c-warning-tint)" />
              <Tally label="Departments" value={r.departments} tone="var(--c-ink-700)" tint="var(--c-ink-100)" />
            </div>

            {r.errors.length > 0 && (
              <div className="mt-4">
                <PolicyNote level="WARN" title={`${r.errors.length} row${r.errors.length === 1 ? "" : "s"} couldn't be applied`}>
                  <ul className="mt-1 space-y-1">
                    {r.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                    {r.errors.length > 8 && <li>…and {r.errors.length - 8} more.</li>}
                  </ul>
                </PolicyNote>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link href="/employees" className="btn btn-primary">See the directory</Link>
              <a href="/employees/import" className="btn btn-ghost">
                <RotateCcw size={14} />
                Import another file
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── step 2: preview ───────────────────────────────────────────────────────
  if (previewState.plan) {
    const p = previewState.plan;
    const problems = p.rows.filter((r) => r.action === "ERROR");
    const warned = p.rows.filter((r) => r.action !== "ERROR" && r.warnings.length > 0);

    return (
      <section className="card p-5 sm:p-6">
        <SectionHeader
          eyebrow="Step 2 of 2 — nothing written yet"
          title={`${p.rows.length} rows read`}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Tally label="Will be created" value={p.counts.create} tone="var(--c-success-ink)" tint="var(--c-success-tint)" />
          <Tally label="Will be updated" value={p.counts.update} tone="var(--lt-pl)" tint="var(--lt-pl-tint)" />
          <Tally label="Will be skipped" value={p.counts.error} tone="var(--c-danger-ink)" tint="var(--c-danger-tint)" />
        </div>

        {p.newDepartments.length > 0 && (
          <div className="mt-4">
            <PolicyNote level="INFO" title={`${p.newDepartments.length} new department${p.newDepartments.length === 1 ? "" : "s"} will be created`}>
              {p.newDepartments.join(", ")}
            </PolicyNote>
          </div>
        )}

        {problems.length > 0 && (
          <div className="mt-4">
            <PolicyNote
              level="BLOCK"
              title={`${problems.length} row${problems.length === 1 ? "" : "s"} can't be imported`}
            >
              These are skipped — the rest still import. Fix them in your spreadsheet and run the
              file again; rows that already imported will be updated rather than duplicated.
            </PolicyNote>
          </div>
        )}

        {/* row table */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr>
                <th className="eyebrow pb-2 pr-3">Line</th>
                <th className="eyebrow pb-2 pr-3">Person</th>
                <th className="eyebrow pb-2 pr-3">Action</th>
                <th className="eyebrow pb-2">What happens</th>
              </tr>
            </thead>
            <tbody className="divide-line">
              {p.rows.map((r) => (
                <tr key={r.line} style={{ background: r.action === "ERROR" ? "var(--c-danger-tint)" : undefined }}>
                  <td className="py-2.5 pr-3 align-top text-[12px] tnum" style={{ color: "var(--c-ink-400)" }}>
                    {r.line}
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    <p className="text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>{r.name}</p>
                    <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>{r.email}</p>
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    <span
                      className="chip"
                      style={{
                        background:
                          r.action === "CREATE" ? "var(--c-success-tint)"
                          : r.action === "UPDATE" ? "var(--lt-pl-tint)" : "var(--c-danger-tint)",
                        color:
                          r.action === "CREATE" ? "var(--c-success-ink)"
                          : r.action === "UPDATE" ? "var(--lt-pl)" : "var(--c-danger-ink)",
                        fontSize: 10.5, padding: "3px 8px",
                      }}
                    >
                      {r.action === "CREATE" ? <UserPlus size={10} /> : r.action === "UPDATE" ? <UserCog size={10} /> : <TriangleAlert size={10} />}
                      {r.action === "CREATE" ? "Create" : r.action === "UPDATE" ? "Update" : "Skip"}
                    </span>
                  </td>
                  <td className="py-2.5 align-top">
                    <p className="text-[12px]" style={{ color: "var(--c-ink-700)" }}>{r.summary}</p>
                    {r.errors.map((e, i) => (
                      <p key={i} className="mt-0.5 text-[11.5px] font-semibold" style={{ color: "var(--c-danger-ink)" }}>
                        {e}
                      </p>
                    ))}
                    {r.warnings.map((w, i) => (
                      <p key={i} className="mt-0.5 flex items-start gap-1 text-[11px]" style={{ color: "var(--c-warning-ink)" }}>
                        <AlertTriangle size={10} style={{ marginTop: 2, flexShrink: 0 }} />
                        {w}
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <form action={commitAction}>
            <input type="hidden" name="csv" value={previewState.csv ?? ""} />
            <Submit
              label={
                p.counts.create + p.counts.update === 0
                  ? "Nothing to import"
                  : `Import ${p.counts.create + p.counts.update} ${p.counts.create + p.counts.update === 1 ? "person" : "people"}`
              }
              icon={<FileUp size={14} />}
            />
          </form>
          <a href="/employees/import" className="btn btn-ghost">
            <RotateCcw size={14} />
            Start over
          </a>
          {warned.length > 0 && (
            <span className="text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
              {warned.length} row{warned.length === 1 ? " has a warning" : "s have warnings"} — they&rsquo;ll still import.
            </span>
          )}
        </div>
      </section>
    );
  }

  // ── step 1: upload ────────────────────────────────────────────────────────
  return (
    <form action={previewAction}>
      <section className="card p-5 sm:p-6">
        <SectionHeader eyebrow="Step 1 of 2" title="Upload your list" />

        <label
          className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors"
          style={{ borderColor: "var(--c-border-strong)", background: "var(--c-surface-2)" }}
        >
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
          <FileUp size={24} style={{ color: "var(--c-ink-400)" }} />
          <p className="mt-3 text-[14px] font-bold" style={{ color: "var(--c-ink-900)" }}>
            {fileName || "Choose a CSV file"}
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--c-ink-500)" }}>
            Export your employee list from Excel or Google Sheets as CSV. Up to 2 MB.
          </p>
        </label>

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1" style={{ background: "var(--c-border)" }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--c-ink-400)" }}>
            or paste
          </span>
          <span className="h-px flex-1" style={{ background: "var(--c-border)" }} />
        </div>

        <textarea
          name="csv"
          rows={5}
          className="field resize-y font-mono"
          style={{ fontSize: 12 }}
          placeholder={"name,email,designation,department,manageremail,joindate,status,confirmdate,openingcl,openingsl,openingpl\nPriya Raman,priya@…,Senior Editor,Post-Production,dev@…,2023-01-09,confirmed,2023-07-09,3,6.5,11"}
        />

        {previewState.error && (
          <div className="mt-4">
            <PolicyNote level="BLOCK" title={previewState.error} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Submit label="Check the file" icon={<FileUp size={14} />} />
          <a href="/api/export/template.csv" className="btn btn-ghost">
            Download template
          </a>
          <span className="text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
            You&rsquo;ll see exactly what will change before anything is written.
          </span>
        </div>
      </section>
    </form>
  );
}

function Tally({
  label, value, tone, tint,
}: {
  label: string;
  value: number;
  tone: string;
  tint: string;
}) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: tint }}>
      <p className="eyebrow" style={{ color: tone }}>{label}</p>
      <p className="stat mt-1.5" style={{ fontSize: 26 }}>{value}</p>
    </div>
  );
}
