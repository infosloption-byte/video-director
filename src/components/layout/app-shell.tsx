import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HelixWordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="shrink-0" aria-label="Helix home">
            <HelixWordmark />
          </Link>
          <div className="flex min-w-0 items-center gap-2">{right}</div>
        </div>
      </header>
      <main className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10", className)}>
        {children}
      </main>
    </div>
  );
}
