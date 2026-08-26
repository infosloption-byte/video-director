import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `hx_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatClock(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function hashText(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function spokenWordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateSeconds(text: string, rate = 1.1) {
  const words = spokenWordCount(text);
  const wpm = 150 * rate;
  return Math.max(2.2, (words / wpm) * 60);
}
