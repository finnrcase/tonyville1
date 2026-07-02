import type { ReactNode } from "react";

export function ConfigurationPanel({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="premium-scrollbar flex-1 overflow-y-auto px-6 py-7 sm:px-8">
        <div className="mx-auto flex max-w-md flex-col gap-7">{children}</div>
      </div>
      {footer ? (
        <div className="border-t border-hairline bg-surface/80 px-6 py-4 sm:px-8">
          {footer}
        </div>
      ) : null}
    </>
  );
}
