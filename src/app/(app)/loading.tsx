/** Skeleton in the shape of the page that's coming, rather than a spinner. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-7 sm:py-8">
      <div className="skeleton mb-6 h-8 w-56" />
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="skeleton" style={{ height: 232, borderRadius: 28 }} />
        <div className="skeleton" style={{ height: 232, borderRadius: 20 }} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />
        <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />
      </div>
    </div>
  );
}
