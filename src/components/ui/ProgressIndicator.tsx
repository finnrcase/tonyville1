import { cn } from "@/components/ui/cn";

export function ProgressIndicator({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 rounded-full transition-all",
            index < current ? "w-6 bg-brand" : "w-2 bg-hairline",
          )}
        />
      ))}
    </div>
  );
}
