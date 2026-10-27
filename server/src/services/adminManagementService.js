import { PLANS } from "./billingService.js";
export const MASTER_CATEGORIES = Object.freeze(["tone", "audience"]);

export function validatePlanLimits(planId, payload) {
  if (!Object.hasOwn(PLANS, planId)) return { error: "Unknown plan." };
  if (!payload || Object.keys(payload).sort().join(",") !== "maxSeconds,rendersPerMonth") return { error: "Only rendersPerMonth and maxSeconds can be changed here." };
  const { rendersPerMonth, maxSeconds } = payload;
  if (!Number.isInteger(rendersPerMonth) || rendersPerMonth < 1 || rendersPerMonth > 100000) return { error: "rendersPerMonth must be between 1 and 100000." };
  if (!Number.isInteger(maxSeconds) || maxSeconds < 15 || maxSeconds > 600 || maxSeconds % 15 !== 0) return { error: "maxSeconds must be a multiple of 15 between 15 and 600." };
  return { value: { rendersPerMonth, maxSeconds } };
}
export function validatePlatformSettings(payload) {
  if (!payload || Object.keys(payload).sort().join(",") !== "announcement,registrationOpen") return { error: "Only announcement and registrationOpen can be changed." };
  if (typeof payload.registrationOpen !== "boolean" || typeof payload.announcement !== "string" || payload.announcement.length > 240) return { error: "Invalid platform settings." };
  return { value: { registrationOpen: payload.registrationOpen, announcement: payload.announcement.trim() } };
}
export function validateMasterItem(payload, { update = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "Invalid master data." };
  const allowed = update ? ["label", "active", "sortOrder"] : ["category", "code", "label", "sortOrder"];
  if (Object.keys(payload).some(key => !allowed.includes(key))) return { error: "Unsupported master data field." };
  if (!update && (!MASTER_CATEGORIES.includes(payload.category) || !/^[a-z0-9-]{2,60}$/.test(payload.code || ""))) return { error: "Invalid category or code." };
  const label = String(payload.label || "").trim();
  if (label.length < 2 || label.length > 100) return { error: "Label must be 2–100 characters." };
  const sortOrder = payload.sortOrder === undefined ? 0 : payload.sortOrder;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) return { error: "Invalid display order." };
  if (update && typeof payload.active !== "boolean") return { error: "Active must be true or false." };
  return { value: update ? { label, sortOrder, active: payload.active } : { category: payload.category, code: payload.code, label, sortOrder, active: true } };
}
