import { deepResearchSignal } from "./deepResearchService.js";

export async function researchSignal(signal, { onProgress } = {}) {
  return deepResearchSignal(signal, { onProgress });
}
