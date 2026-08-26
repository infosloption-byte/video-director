import type { WordTiming } from "./types";
import { estimateSeconds } from "./utils";

export function wordsFromCharTimestamps(
  chars: string[],
  times: [number, number][],
): WordTiming[] {
  const words: WordTiming[] = [];
  let current = "";
  let start = 0;
  const n = Math.min(chars.length, times.length);

  for (let i = 0; i < n; i++) {
    const ch = chars[i] ?? "";
    const pair = times[i];
    if (!pair) continue;
    if (/\s/.test(ch)) {
      if (current) {
        const prev = times[i - 1] ?? pair;
        words.push({ word: current, start, end: prev[1] });
        current = "";
      }
    } else {
      if (!current) start = pair[0];
      current += ch;
    }
  }
  if (current) {
    const last = times[n - 1] ?? [start, start];
    words.push({ word: current, start, end: last[1] });
  }
  return words;
}

export function estimateWordTimings(text: string, rate = 1.1): WordTiming[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const total = estimateSeconds(text, rate);
  const unit = total / Math.max(tokens.length, 1);
  return tokens.map((word, i) => ({
    word,
    start: i * unit,
    end: (i + 1) * unit,
  }));
}

export function activeWordIndex(words: WordTiming[], time: number) {
  if (words.length === 0) return -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start && time < words[i].end) return i;
  }
  if (time >= words[words.length - 1].end) return words.length - 1;
  return 0;
}
