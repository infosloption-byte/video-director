import { cn } from "@/lib/utils";

export function HelixMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7", className)}
      fill="none"
      aria-hidden
    >
      <rect
        x="5.5"
        y="3.5"
        width="21"
        height="25"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12 8c5 3.2 5 11.6 0 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M20 8c-5 3.2-5 11.6 0 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HelixWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-fg", className)}>
      <HelixMark />
      <span className="font-display text-2xl leading-none tracking-tight">
        Helix
      </span>
    </span>
  );
}
