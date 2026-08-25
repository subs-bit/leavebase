"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "var(--c-danger-tint)", color: "var(--c-danger-ink)" }}
      >
        <TriangleAlert size={22} />
      </div>
      <h1 className="mt-5 text-[19px]">Something went wrong here</h1>
      <p className="mt-2 max-w-md text-[13.5px]" style={{ color: "var(--c-ink-500)" }}>
        No leave data was changed. Try again — if it keeps happening, the reference below will help
        whoever looks into it.
      </p>
      {error.digest && (
        <code
          className="mt-3 rounded-lg px-2.5 py-1 text-[11.5px]"
          style={{ background: "var(--c-ink-100)", color: "var(--c-ink-500)" }}
        >
          {error.digest}
        </code>
      )}
      <div className="mt-6 flex gap-2.5">
        <button type="button" onClick={reset} className="btn btn-primary">
          <RotateCcw size={15} />
          Try again
        </button>
        <Link href="/" className="btn btn-ghost">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
