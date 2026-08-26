import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WhyCallout({
  label = "Why this",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg bg-elevated px-3.5 py-3 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-muted" />
      <p className="text-sm leading-snug text-muted">
        <span className="mr-2 font-mono text-xs uppercase tracking-wide text-fg">
          {label}
        </span>
        {children}
      </p>
    </div>
  );
}
