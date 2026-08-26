import { useEffect, useState } from "react";

const BEATS = [
  "Reading the source",
  "Scoring narrative fit",
  "Writing the hook",
  "Blocking scenes",
  "Casting B-roll",
];

export function DirectingState({
  headline,
  error,
  onRetry,
}: {
  headline: string;
  error?: string;
  onRetry?: () => void;
}) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setBeat((b) => (b + 1) % BEATS.length);
    }, 1200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-subtle">
        Auto-director
      </p>
      <h2 className="mt-3 max-w-lg font-display text-3xl tracking-tight text-fg sm:text-4xl">
        {headline}
      </h2>
      {error ? (
        <>
          <p className="mt-4 max-w-md text-sm text-muted">
            {error}. Helix can still cut from onboard templates.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-6 h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              Direct again
            </button>
          ) : null}
        </>
      ) : (
        <p className="shimmer-text mt-6 font-mono text-sm">{BEATS[beat]}</p>
      )}
    </div>
  );
}
