import crypto from "node:crypto";
import { prisma } from "../db/client.js";

export const PLANS = Object.freeze({
  free: { id:"free", name:"Free", monthlyUsd:0, rendersPerMonth:3, maxSeconds:60 },
  creator: { id:"creator", name:"Creator", monthlyUsd:19, rendersPerMonth:30, maxSeconds:60 },
  studio: { id:"studio", name:"Studio", monthlyUsd:49, rendersPerMonth:150, maxSeconds:60 },
});
export const paidPlanIds = ["creator","studio"];
export function priceId(plan) { return String(process.env[`PADDLE_PRICE_${String(plan).toUpperCase()}`] || "").trim(); }
export function checkoutEnabled() { return Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_CLIENT_TOKEN && process.env.PADDLE_WEBHOOK_SECRET && paidPlanIds.every(x => /^pri_/.test(priceId(x)))); }
export function publicPlans() { return Object.values(PLANS).map(({ ...plan }) => ({ ...plan, checkoutAvailable: plan.id !== "free" && checkoutEnabled() })); }
export function currentMonth(date = new Date()) { return date.toISOString().slice(0, 7); }
export function effectivePlan(subscription) {
  return subscription && ["active","trialing"].includes(subscription.status) && PLANS[subscription.plan] ? PLANS[subscription.plan] : PLANS.free;
}
export async function userBilling(userId) {
  const subscription = await prisma.billingSubscription.findUnique({ where: { userId } });
  const plan = effectivePlan(subscription);
  const month = currentMonth();
  const usage = await prisma.monthlyRenderUsage.findUnique({ where: { userId_month: { userId, month } } });
  return { plan, month, resetAt: new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 1)).toISOString(), used: usage?.used || 0, remaining: Math.max(0, plan.rendersPerMonth - (usage?.used || 0)),
    subscription: subscription ? { status:subscription.status, paddleSubscriptionId:subscription.paddleSubscriptionId, cancelAtPeriodEnd:subscription.cancelAtPeriodEnd, periodEnd:subscription.periodEnd } : null };
}
export class PlanLimitError extends Error { constructor(message) { super(message); this.code = "PLAN_LIMIT_REACHED"; this.status=402; } }
export function assertVerified(user) { if (!user?.emailVerifiedAt) throw new PlanLimitError("Verify your email address before generating videos. Open Account to resend your verification link."); }
export async function reserveRender(user, renderKey, durationSeconds) {
  assertVerified(user);
  const billing = await userBilling(user.id);
  const { plan, month } = billing;
  if (Number.isFinite(durationSeconds) && durationSeconds > plan.maxSeconds + 0.01) throw new PlanLimitError(`Your plan supports videos up to ${plan.maxSeconds} seconds.`);
  if (typeof renderKey !== "string" || !renderKey || renderKey.length > 255) throw new Error("Invalid render credit key.");
  let fresh=false;
  try {
    fresh=await prisma.$transaction(async (tx)=>{
      const key={ userId:user.id, renderKey, month };
      const exists=await tx.renderCredit.findUnique({where:{userId_renderKey_month:key}});
      if(exists) return false;
      await tx.monthlyRenderUsage.upsert({where:{userId_month:{userId:user.id,month}},create:{userId:user.id,month,used:0},update:{}});
      const updated=await tx.monthlyRenderUsage.updateMany({where:{userId:user.id,month,used:{lt:plan.rendersPerMonth}},data:{used:{increment:1}}});
      if(updated.count!==1) throw new PlanLimitError(`Monthly render limit reached for ${plan.name}. Upgrade to render more videos.`);
      await tx.renderCredit.create({data:{...key}});
      return true;
    });
  } catch(error) {
    if(error.code==="P2002") {
      const exists=await prisma.renderCredit.findUnique({where:{userId_renderKey_month:{userId:user.id,renderKey,month}}});
      if(exists) return {fresh:false,month};
    }
    throw error;
  }
  return {fresh,month};
}
export async function releaseRender(userId, renderKey, month) {
  await prisma.$transaction(async tx=>{
    const deleted=await tx.renderCredit.deleteMany({where:{userId,renderKey,month}});
    if(deleted.count) await tx.monthlyRenderUsage.updateMany({where:{userId,month,used:{gt:0}},data:{used:{decrement:1}}});
  });
}
export function verifyPaddleSignature(signature, rawBody, secret, now = Date.now()) {
  if(!secret || !Buffer.isBuffer(rawBody)) return false;
  const values=Object.fromEntries(String(signature||"").split(";").map(v=>v.trim().split("=")).filter(p=>p.length===2));
  if(!/^\d+$/.test(values.ts||"") || !/^[a-f0-9]{64}$/i.test(values.h1||"")) return false;
  if(Math.abs(now-Number(values.ts)*1000)>5*60*1000) return false;
  const expected=crypto.createHmac("sha256",secret).update(`${values.ts}:`).update(rawBody).digest();
  const actual=Buffer.from(values.h1,"hex");
  return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
}
export async function paddleFetch(path, options={}) {
  const api=String(process.env.PADDLE_ENV||"sandbox").toLowerCase()==="live"?"https://api.paddle.com":"https://sandbox-api.paddle.com";
  const { timeoutMs = 12000, ...requestOptions } = options;
  const response=await fetch(`${api}${path}`,{
    ...requestOptions, headers:{Authorization:`Bearer ${process.env.PADDLE_API_KEY}`,"Content-Type":"application/json",...(requestOptions.headers||{})},
    signal:AbortSignal.timeout(timeoutMs)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`Paddle request failed (HTTP ${response.status}).`);
  return result.data;
}
