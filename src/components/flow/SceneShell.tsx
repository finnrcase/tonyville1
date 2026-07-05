import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { FLOW_STEPS } from "@/lib/flowSteps";

/**
 * Shared chrome for every staged customer scene. The layout never moves:
 * decision column on the left (progress → question → options → back/continue),
 * one large visual on the right. Scenes supply only their content.
 */

type SceneShellProps = {
  /** 1-based position within FLOW_STEPS. */
  step: number;
  title: string;
  helper?: string;
  visual: ReactNode;
  children: ReactNode;
  backHref?: string;
  onBack?: () => void;
  continueLabel?: string;
  continueHref?: string;
  onContinue?: () => void;
  continueDisabled?: boolean;
  /** Small optional escape hatch below the primary actions. */
  secondary?: ReactNode;
};

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${FLOW_STEPS.length}`}>
      {FLOW_STEPS.map((flowStep, index) => (
        <span
          key={flowStep.id}
          className={
            index + 1 === step
              ? "h-1.5 w-5 rounded-full bg-brand transition-all"
              : index + 1 < step
                ? "h-1.5 w-1.5 rounded-full bg-brand/40"
                : "h-1.5 w-1.5 rounded-full bg-ink/10"
          }
        />
      ))}
    </div>
  );
}

export function SceneShell({
  step,
  title,
  helper,
  visual,
  children,
  backHref,
  onBack,
  continueLabel,
  continueHref,
  onContinue,
  continueDisabled,
  secondary,
}: SceneShellProps) {
  const showBack = Boolean(backHref || onBack);
  const showContinue = Boolean(continueLabel && (continueHref || onContinue));
  const backClass = buttonClass("ghost", "lg", "px-4");
  const continueClass = buttonClass("primary", "lg", "flex-1");

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink lg:grid lg:grid-cols-[480px_minmax(0,1fr)]">
      <section className="relative order-1 h-[36dvh] shrink-0 overflow-hidden lg:order-2 lg:h-auto">
        <div className="absolute inset-0 p-3 lg:p-5">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[28px] bg-sunken lg:rounded-[36px]">
            {visual}
          </div>
        </div>
      </section>

      <section className="order-2 flex min-h-0 flex-1 flex-col px-6 py-5 sm:px-8 lg:order-1 lg:py-7">
        <header className="flex shrink-0 items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold uppercase tracking-[0.34em] text-brand"
            aria-label="CABN home"
          >
            CABN
          </Link>
          <ProgressDots step={step} />
        </header>

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 py-4">
          <div className="shrink-0">
            <h1 className="text-4xl font-medium leading-[1.02] tracking-[-0.01em] sm:text-[44px]">
              {title}
            </h1>
            {helper ? (
              <p className="mt-3 text-base leading-6 text-ink-soft">{helper}</p>
            ) : null}
          </div>
          <div className="min-h-0 overflow-y-auto pr-1 premium-scrollbar">
            {children}
          </div>
        </div>

        <footer className="shrink-0 pt-2">
          <div className="flex items-center gap-3">
            {showBack ? (
              backHref ? (
                <Link href={backHref} className={backClass} aria-label="Back">
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  Back
                </Link>
              ) : (
                <button type="button" onClick={onBack} className={backClass} aria-label="Back">
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  Back
                </button>
              )
            ) : null}
            {showContinue ? (
              continueHref ? (
                <Link
                  href={continueHref}
                  className={continueClass}
                  aria-disabled={continueDisabled}
                >
                  {continueLabel}
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={continueDisabled}
                  className={continueClass}
                >
                  {continueLabel}
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              )
            ) : null}
          </div>
          {secondary ? (
            <div className="mt-3 text-center text-sm text-ink-soft">
              {secondary}
            </div>
          ) : null}
        </footer>
      </section>
    </main>
  );
}
