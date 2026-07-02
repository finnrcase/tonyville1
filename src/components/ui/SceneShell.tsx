import type { ReactNode } from "react";

// Split-screen scene frame: hero preview + configuration panel. Preserves the existing
// guided-scene layout; purely a presentational wrapper.
export function SceneShell({
  preview,
  panel,
}: {
  preview: ReactNode;
  panel: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_460px]">
      <section className="relative order-2 min-h-[48vh] lg:order-1 lg:min-h-screen">
        {preview}
      </section>
      <aside className="order-1 flex min-h-screen flex-col border-hairline lg:order-2 lg:border-l">
        {panel}
      </aside>
    </div>
  );
}
