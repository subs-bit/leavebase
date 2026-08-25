import Link from "next/link";
import { PrismixMark } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <PrismixMark size={44} id="nf" />
      <p className="stat mt-7" style={{ fontSize: 44 }}>404</p>
      <h1 className="mt-2 text-[19px]">This page isn&rsquo;t here</h1>
      <p className="mt-2 max-w-sm text-[13.5px]" style={{ color: "var(--c-ink-500)" }}>
        The link may be stale, or the record may belong to someone whose leave you can&rsquo;t see.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Back to dashboard
      </Link>
    </main>
  );
}
