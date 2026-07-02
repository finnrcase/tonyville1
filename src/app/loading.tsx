export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink">
      <div className="text-center">
        <div className="text-sm font-semibold uppercase tracking-[0.34em] text-brand">
          CABN
        </div>
        <div className="mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-hairline">
          <div className="soft-pulse h-full w-1/2 rounded-full bg-brand" />
        </div>
      </div>
    </main>
  );
}
