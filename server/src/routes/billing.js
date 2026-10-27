import { Router } from "express";
import { prisma } from "../db/client.js";
import { checkoutEnabled, paddleFetch, PLANS, paidPlanIds, priceId, configuredPublicPlans, userBilling, verifyPaddleSignature } from "../services/billingService.js";
import { sendEmail } from "../services/emailService.js";
import { isPaidSubscriptionActive, planFromSubscriptionItems, planChangeRequest, successfulCheckout, voxoraCheckoutUrl } from "../services/paddlePlanFlow.js";
import { CHECKOUT_ACTIVE, CHANGE_ACTIVE, checkoutEventStatus, publicCheckoutStatus, publicPlanChange, belongsToVoxora, isUncertainPaddleError } from "../services/paymentState.js";

export const billingRouter = Router();
billingRouter.get("/plans", async (_req, res, next) => { try { res.set("Cache-Control", "no-store"); res.json({ plans: await configuredPublicPlans(), billingReady: checkoutEnabled(), currency: "USD", provisionalPricing: true }); } catch (error) { next(error); } });
 // Client-side tokens are publishable; API keys and notification secrets are not.
billingRouter.get("/checkout-config", (_req, res) => {
  if (!checkoutEnabled()) return res.status(503).json({ error: "Paddle checkout is not configured yet." });
  res.set("Cache-Control", "no-store");
  res.json({
    clientToken: process.env.PADDLE_CLIENT_TOKEN,
    environment: String(process.env.PADDLE_ENV || "sandbox").toLowerCase() === "live" ? "production" : "sandbox",
  });
});
billingRouter.get("/me", async (req, res, next) => {
  try { if (!req.user?.id) return res.status(401).json({ error:"Sign in first." }); res.json(await userBilling(req.user.id)); } catch (error) { next(error); }
});
// Free-plan onboarding is explicit. Paid onboarding completes only from a signed Paddle webhook.
billingRouter.post("/plan-selected", async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Sign in first." });
    if (!req.user.emailVerifiedAt) return res.status(403).json({ error: "Verify your email first." });
    if (req.body?.plan !== "free") return res.status(400).json({ error: "Paid plans must be confirmed through Paddle." });
    const billing = await userBilling(req.user.id);
    if (isPaidSubscriptionActive(billing.subscription)) return res.status(409).json({ error: "Your paid subscription is already active." });
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { planSelectedAt: req.user.planSelectedAt || new Date(), intendedPlan: null } });
    res.json({ ok: true, planSelectedAt: user.planSelectedAt });
  } catch (error) { next(error); }
});
// Reserve the per-user checkout BEFORE calling Paddle. Reuse an existing
// transaction rather than charging via a second checkout after a browser close.
billingRouter.post("/checkout", async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Sign in to continue." });
    if (!req.user.emailVerifiedAt) return res.status(403).json({ error: "Verify your email before subscribing." });
    const plan = String(req.body?.plan || "");
    if (!paidPlanIds.includes(plan)) return res.status(400).json({ error: "Unknown paid plan." });
    if (!checkoutEnabled()) return res.status(503).json({ error: "Paddle checkout is not configured yet." });
    const current = await userBilling(req.user.id);
    if (isPaidSubscriptionActive(current.subscription)) return res.status(409).json({ error: "You already have a paid plan. Choose a subscription change instead." });
    if (current.subscription && current.subscription.status !== "canceled")
      return res.status(409).json({ error: "Resolve the existing subscription in Billing before starting another payment." });

    let lock = await prisma.billingCheckoutLock.findUnique({ where: { userId: req.user.id } });
    if (!lock) {
      // Old checkouts predate transaction state tracking. Reconcile with
      // Paddle first: a previously PAID checkout is not an unpaid session.
      const legacy = await prisma.billingCheckout.findMany({
        where: { userId: req.user.id, status: { in: ["awaiting_payment", "processing", "failed"] } },
        orderBy: { createdAt: "desc" }, take: 2,
      });
      if (legacy.length > 1) return res.status(409).json({
        code: "CHECKOUT_REVIEW_REQUIRED",
        error: "Several earlier payments need reconciliation. Please contact billing support before paying again.",
      });
      const previous = legacy[0];
      if (previous) {
        let remote;
        try { remote = await paddleFetch(`/transactions/${encodeURIComponent(previous.transactionId)}`); }
        catch { return res.status(503).json({
          code: "CHECKOUT_REVIEW_REQUIRED",
          error: "An earlier checkout cannot be verified with Paddle. Do not start another payment.",
        }); }
        if (remote?.id !== previous.transactionId) return res.status(409).json({ error: "Previous checkout cannot be verified." });
        if (["completed", "paid"].includes(remote.status)) {
          const knownOldSubscription = previous.paddleSubscriptionId
            && previous.paddleSubscriptionId === current.subscription?.paddleSubscriptionId;
          if (!knownOldSubscription || current.subscription?.status !== "canceled")
            return res.status(409).json({
              code: "CHECKOUT_REVIEW_REQUIRED",
              error: "A previous payment was collected but its subscription needs review. Do not submit another payment.",
            });
          await prisma.billingCheckout.update({
            where: { transactionId: previous.transactionId }, data: { status: "activated" },
          });
        } else if (remote.status === "canceled") {
          await prisma.billingCheckout.update({
            where: { transactionId: previous.transactionId }, data: { status: "canceled" },
          });
        } else if (["draft","ready","past_due"].includes(remote.status)) {
          try {
            lock = await prisma.billingCheckoutLock.create({
              data: { userId: req.user.id, plan: previous.plan, status: "ready", transactionId: previous.transactionId },
            });
          } catch (error) {
            if (error.code === "P2002") return res.status(409).json({ error: "A checkout is already being recovered. Refresh this page." });
            throw error;
          }
        } else {
          return res.status(409).json({ error: "Earlier Paddle transaction outcome is unknown. Contact billing support." });
        }
      }
    }
    if (lock && lock.status !== "finished") {
      if (lock.status === "ready" && lock.transactionId) {
        const existing = await prisma.billingCheckout.findUnique({ where: { transactionId: lock.transactionId } });
        if (!existing) return res.status(409).json({ code: "CHECKOUT_REVIEW_REQUIRED", error: "Payment recovery needs support. Please do not submit another payment." });
        if (lock.plan !== plan && CHECKOUT_ACTIVE.includes(existing.status))
          return res.status(409).json({ code: "CHECKOUT_ALREADY_PENDING", error: "Resume your existing checkout before choosing another plan.", plan: existing.plan });
        if (CHECKOUT_ACTIVE.includes(existing.status)) {
          return res.json({
            transactionId: existing.transactionId, plan: existing.plan, resumed: true,
            status: existing.status, clientToken: process.env.PADDLE_CLIENT_TOKEN,
            environment: process.env.PADDLE_ENV === "live" ? "production" : "sandbox",
          });
        }
        if (existing.status !== "canceled") return res.status(409).json({ code: "CHECKOUT_REVIEW_REQUIRED", error: "Your payment outcome is being reviewed. Please do not pay again." });
      } else {
        return res.status(409).json({
          code: "CHECKOUT_REVIEW_REQUIRED",
          error: "An earlier checkout request is still being processed. Please wait or contact billing support; do not start a second payment.",
        });
      }
    }
    // A unique userId lock means concurrent requests cannot create two Paddle
    // transactions. A canceled checkout is explicitly finished first.
    try {
      if (lock) {
        const updated = await prisma.billingCheckoutLock.updateMany({
          where: { userId: req.user.id, status: { in: ["finished", "ready"] } },
          data: { plan, status: "creating", transactionId: null },
        });
        if (updated.count !== 1) return res.status(409).json({ error: "Checkout already in progress." });
      } else {
        await prisma.billingCheckoutLock.create({ data: { userId: req.user.id, plan } });
      }
    } catch (error) {
      if (error.code === "P2002") return res.status(409).json({ error: "Checkout already in progress. Reload the plan page." });
      throw error;
    }

    let data;
    try {
      data = await paddleFetch("/transactions", {
        method: "POST",
        body: JSON.stringify({
          items: [{ price_id: priceId(plan), quantity: 1 }],
          collection_mode: "automatic",
          checkout: { url: voxoraCheckoutUrl(process.env.AUTH_PUBLIC_URL, process.env.PADDLE_CHECKOUT_URL, process.env.PADDLE_ENV || "sandbox") },
          custom_data: { voxora_user_id: req.user.id, voxora_plan: plan },
        }),
      });
      if (!/^txn_[a-z0-9]{20,100}$/.test(data?.id || "")) throw new Error("Unexpected Paddle transaction response.");
      await prisma.$transaction(async tx => {
        await tx.billingCheckout.create({ data: { userId: req.user.id, plan, transactionId: data.id } });
        await tx.billingCheckoutLock.update({ where: { userId: req.user.id }, data: { status: "ready", transactionId: data.id } });
      });
    } catch (error) {
      // Even a timeout may have created a transaction at Paddle. Never
      // silently unlock the user and allow another potentially billable one.
      const uncertain = Boolean(data?.id) || isUncertainPaddleError(error);
      await prisma.billingCheckoutLock.updateMany({
        where: { userId: req.user.id, status: "creating" },
        data: { status: uncertain ? "uncertain" : "finished" },
      }).catch(() => {});
      console.error("[billing] Paddle checkout creation failed:", error.message);
      return res.status(503).json(uncertain ? {
        code: "CHECKOUT_REVIEW_REQUIRED",
        error: "We could not confirm checkout creation. Do not retry payment yet; contact billing support.",
      } : {
        code: "CHECKOUT_UNAVAILABLE",
        error: "Paddle rejected the checkout request. Please try again later or contact billing support.",
      });
    }
    res.status(201).json({
      transactionId: data.id, plan, resumed: false, status: "awaiting_payment",
      clientToken: process.env.PADDLE_CLIENT_TOKEN,
      environment: process.env.PADDLE_ENV === "live" ? "production" : "sandbox",
    });
  } catch (error) { next(error); }
});

// Browser close is NOT payment cancellation. This route cancels a known
// uncharged transaction with Paddle first, before unlocking plan selection.
billingRouter.post("/checkout/cancel", async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Sign in first." });
    const transactionId = String(req.body?.transactionId || "");
    if (!/^txn_[a-z0-9]{20,100}$/.test(transactionId))
      return res.status(400).json({ error: "Invalid checkout." });
    const [checkout, lock] = await Promise.all([
      prisma.billingCheckout.findUnique({ where: { transactionId } }),
      prisma.billingCheckoutLock.findUnique({ where: { userId: req.user.id } }),
    ]);
    if (!checkout || checkout.userId !== req.user.id || lock?.transactionId !== transactionId)
      return res.status(404).json({ error: "Checkout not found." });
    if (!["awaiting_payment","failed"].includes(checkout.status))
      return res.status(409).json({ error: "This checkout is already processing and cannot safely be cancelled." });

    let remote;
    try { remote = await paddleFetch(`/transactions/${encodeURIComponent(transactionId)}`); }
    catch {
      return res.status(503).json({ error: "Cannot verify the Paddle transaction. Do not start another payment." });
    }
    if (remote?.id !== transactionId || remote?.collection_mode !== "automatic" || remote?.origin !== "api")
      return res.status(409).json({ error: "Paddle checkout requires support to cancel safely." });
    if (!["draft","ready","canceled"].includes(remote.status))
      return res.status(409).json({ error: "Paddle has begun processing this payment. Wait for confirmation before taking another action." });

    if (remote.status !== "canceled") {
      let canceled;
      try {
        canceled = await paddleFetch(`/transactions/${encodeURIComponent(transactionId)}`, {
          method: "PATCH", body: JSON.stringify({ status: "canceled" }), timeoutMs: 25000,
        });
      } catch {
        return res.status(503).json({ error: "Cancellation is not confirmed. Do not submit another payment yet." });
      }
      if (canceled?.id !== transactionId || canceled.status !== "canceled")
        return res.status(503).json({ error: "Paddle has not confirmed cancellation." });
    }
    await prisma.$transaction(async tx => {
      await tx.billingCheckout.update({ where: { transactionId }, data: { status: "canceled" } });
      await tx.billingCheckoutLock.updateMany({
        where: { userId: req.user.id, transactionId, status: "ready" },
        data: { status: "finished" },
      });
    });
    res.json({ canceled: true, status: "canceled" });
  } catch (error) { next(error); }
});

billingRouter.get("/payment-state", async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Sign in first." });
    const [lock, change, subscription] = await Promise.all([
      prisma.billingCheckoutLock.findUnique({ where: { userId: req.user.id } }),
      prisma.billingPlanChange.findUnique({ where: { userId: req.user.id } }),
      prisma.billingSubscription.findUnique({ where: { userId: req.user.id } }),
    ]);
    const previousCheckout = lock?.transactionId
      ? await prisma.billingCheckout.findUnique({ where: { transactionId: lock.transactionId } })
      : null;
    // An old paid transaction is not a new unpaid checkout merely because
    // its associated subscription has since been canceled or become past due.
    const checkout = previousCheckout?.status === "activated" && !isPaidSubscriptionActive(subscription)
      ? null : previousCheckout;
    res.set("Cache-Control", "no-store");
    res.json({
      checkout: publicCheckoutStatus(checkout, subscription),
      change: publicPlanChange(change, subscription),
      creating: Boolean(lock && ["creating", "uncertain"].includes(lock.status)),
    });
  } catch (error) { next(error); }
});

// The browser may report checkout completion before Paddle has provisioned the
// subscription. Always verify against server-owned checkout and signed events.
billingRouter.get("/checkout-status", async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Sign in first." });
    const transactionId = String(req.query.transactionId || "");
    if (!/^txn_[a-z0-9]{20,100}$/.test(transactionId)) return res.status(400).json({ error: "Invalid checkout." });
    const checkout = await prisma.billingCheckout.findUnique({ where: { transactionId } });
    if (!checkout || checkout.userId !== req.user.id) return res.status(404).json({ error: "Checkout not found." });
    const subscription = await prisma.billingSubscription.findUnique({ where: { userId: req.user.id } });
    const active = successfulCheckout(checkout, subscription);
    const state = publicCheckoutStatus(checkout, subscription);
    res.set("Cache-Control", "no-store");
    res.json({
      confirmed: active,
      plan: active ? subscription.plan : null,
      status: state.status,
      resumable: state.resumable,
      transactionId: checkout.transactionId,
    });
  } catch (error) { next(error); }
});

async function validatedPlanChange(userId, nextPlan) {
  if (!paidPlanIds.includes(nextPlan) || !checkoutEnabled()) {
    const error = new Error("This paid plan is unavailable.");
    error.status = 400; throw error;
  }
  const local = await prisma.billingSubscription.findUnique({ where: { userId } });
  if (!local || local.status !== "active" || local.cancelAtPeriodEnd) {
    const error = new Error("Only active, renewing subscriptions can change plans. Manage any scheduled cancellation or payment issue first.");
    error.status = 409; throw error;
  }
  const paddle = await paddleFetch(`/subscriptions/${encodeURIComponent(local.paddleSubscriptionId)}`);
  const livePlan = planFromSubscriptionItems(paddle?.items, Object.fromEntries(paidPlanIds.map(id => [id, priceId(id)])));
  if (paddle?.id !== local.paddleSubscriptionId || paddle?.status !== "active" || paddle?.scheduled_change || livePlan !== local.plan) {
    const error = new Error("Paddle subscription state has changed. Refresh Billing and try again.");
    error.status = 409; throw error;
  }
  // Paddle replaces the entire item list on PATCH. Never silently remove
  // unknown add-ons or extra subscription lines when changing the main plan.
  if (!Array.isArray(paddle?.items) || paddle.items.length !== 1) {
    const error = new Error("This subscription has additional items and must be updated through billing support.");
    error.status = 409; throw error;
  }
  const change = planChangeRequest(local.plan, nextPlan, priceId(nextPlan));
  if (!change) {
    const error = new Error("Select a different paid plan.");
    error.status = 400; throw error;
  }
  return { local, change };
}

billingRouter.post("/change-preview", async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Sign in first." });
    if (!req.user.emailVerifiedAt) return res.status(403).json({ error: "Verify your email first." });
    const plan = String(req.body?.plan || "");
    const { local, change } = await validatedPlanChange(req.user.id, plan);
    const preview = await paddleFetch(`/subscriptions/${encodeURIComponent(local.paddleSubscriptionId)}/preview`, {
      method: "PATCH", body: JSON.stringify(change),
    });
    res.set("Cache-Control", "no-store");
    res.json({
      fromPlan: local.plan, toPlan: plan,
      mode: change.proration_billing_mode,
      immediate: preview?.immediate_transaction?.details?.totals || null,
      next: preview?.next_transaction?.details?.totals || null,
      recurring: preview?.recurring_transaction_details?.totals || null,
      currency: preview?.currency_code || preview?.immediate_transaction?.currency_code || "USD",
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

billingRouter.post("/change-plan", async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Sign in first." });
    if (!req.user.emailVerifiedAt) return res.status(403).json({ error: "Verify your email first." });
    const plan = String(req.body?.plan || "");
    const prior = await prisma.billingPlanChange.findUnique({ where: { userId: req.user.id } });
    if (prior && CHANGE_ACTIVE.includes(prior.status))
      return res.status(409).json({
        code: "PLAN_CHANGE_PENDING",
        error: "An earlier plan change is being verified. Refresh its status before requesting another charge.",
      });
    const { local, change } = await validatedPlanChange(req.user.id, plan);
    // Reserve a durable user-scoped operation before calling Paddle. Two
    // clicks/tabs cannot send two prorated subscription updates.
    try {
      if (prior) {
        const claimed = await prisma.billingPlanChange.updateMany({
          where: { userId: req.user.id, status: { in: ["activated", "failed", "canceled"] } },
          data: {
            paddleSubscriptionId: local.paddleSubscriptionId, fromPlan: local.plan,
            toPlan: plan, status: "processing", lastError: null, requestedAt: new Date(),
          },
        });
        if (claimed.count !== 1) return res.status(409).json({ code: "PLAN_CHANGE_PENDING", error: "Your plan change is already in progress." });
      } else {
        await prisma.billingPlanChange.create({
          data: { userId: req.user.id, paddleSubscriptionId: local.paddleSubscriptionId, fromPlan: local.plan, toPlan: plan },
        });
      }
    } catch (error) {
      if (error.code === "P2002") return res.status(409).json({ code: "PLAN_CHANGE_PENDING", error: "Your plan change is already in progress." });
      throw error;
    }
    let updated;
    try {
      updated = await paddleFetch(`/subscriptions/${encodeURIComponent(local.paddleSubscriptionId)}`, {
        method: "PATCH", body: JSON.stringify(change), timeoutMs: 45000,
      });
    } catch (error) {
      if (isUncertainPaddleError(error)) {
        await prisma.billingPlanChange.updateMany({
          where: { userId: req.user.id, status: "processing" },
          data: { status: "uncertain" },
        });
        return res.status(202).json({
          pending: true, plan, confirmationDelayed: true,
          message: "Paddle has not confirmed the outcome. Do not request another charge while we verify it.",
        });
      }
      // A definitive 4xx rejection is not a successful change. Existing
      // subscriptions retain their plan (on_payment_failure: prevent_change).
      await prisma.billingPlanChange.updateMany({
        where: { userId: req.user.id, status: "processing" },
        data: { status: "failed", lastError: "Paddle could not apply the plan change." },
      });
      return res.status(409).json({
        code: "PLAN_CHANGE_FAILED",
        error: "Paddle could not apply the plan change. Your previous plan is unchanged. You can review a fresh quote before retrying.",
      });
    }
    if (updated?.id !== local.paddleSubscriptionId) {
      await prisma.billingPlanChange.updateMany({
        where: { userId: req.user.id, status: "processing" },
        data: { status: "uncertain" },
      });
      return res.status(202).json({ pending: true, plan, confirmationDelayed: true });
    }
    // A valid Paddle response is not yet a local entitlement. Only the
    // signed subscription.updated webhook can activate the new plan.
    res.status(202).json({ pending: true, plan, mode: change.proration_billing_mode });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

billingRouter.get("/portal", async (req, res, next) => {
  try {
    if(!req.user?.id) return res.status(401).json({error:"Sign in first."});
    const sub=await prisma.billingSubscription.findUnique({where:{userId:req.user.id}});
    if(!sub) return res.status(404).json({error:"No subscription to manage."});
    const data=await paddleFetch(`/subscriptions/${encodeURIComponent(sub.paddleSubscriptionId)}`);
    const action=String(req.query.action||"payment");
    if(!["payment","cancel"].includes(action)) return res.status(400).json({error:"Unsupported management action."});
    const url=action==="cancel"?data?.management_urls?.cancel:data?.management_urls?.update_payment_method;
    if(!url || !/^https:\/\//.test(url)) return res.status(503).json({error:"Paddle management link is unavailable."});
    res.json({url});
  } catch(error) { next(error); }
});

const SUBSCRIPTION_EVENTS=new Set(["subscription.created","subscription.updated","subscription.activated","subscription.trialing","subscription.canceled","subscription.paused","subscription.resumed","subscription.past_due"]);
function subscriptionPlan(data) {
  // Voxora sells exactly one base monthly plan per subscription. Mixed catalog
  // items or custom quantities must be reconciled manually, not provisioned.
  if (!Array.isArray(data.items) || data.items.length !== 1 || data.items[0]?.quantity !== 1) return null;
  return planFromSubscriptionItems(data.items, Object.fromEntries(paidPlanIds.map(id => [id, priceId(id)])));
}
function emailForEvent(eventType, user, plan, info = {}) {
  const messages={
    "subscription.created":["Subscription created","Your Voxora subscription is now being prepared."],
    "subscription.activated":["Subscription active",`Your ${PLANS[plan]?.name||"paid"} plan is active. You can review your usage on the Billing page.`],
    "subscription.canceled":["Subscription canceled","Your Voxora subscription was canceled. Your account will continue on the Free plan."],
    "subscription.past_due":["Subscription payment issue","Your subscription payment requires attention. Open Billing to review your payment details."],
    "transaction.completed":["Payment confirmed","Your payment was completed successfully. Check your billing dashboard for your subscription and usage."],
    "transaction.payment_failed":["Payment failed","Your recent payment could not be completed. Open Billing to update your payment method."],
  };
  const m=messages[eventType];
  if(!m) return;
  const details=[`Plan: ${PLANS[plan]?.name || "Voxora"}`];
  if(info.amountMinor != null && info.currency) details.push(`Amount: ${(Number(info.amountMinor)/100).toFixed(2)} ${info.currency}`);
  if(info.transactionId) details.push(`Transaction: ${info.transactionId}`);
  if(info.invoiceNumber) details.push(`Invoice: ${info.invoiceNumber}`);
  if(info.periodEnd) details.push(`Period end: ${String(info.periodEnd).slice(0,10)}`);
  details.push("Sign in to Voxora to review your account and billing details.");
  void sendEmail({to:user.email,subject:m[0],title:m[0],lead:m[1],detail:details.join("\n")}).catch(error=>console.error("[billing] notification email failed:",error.message));
}
export function paddleWebhook(req, res) {
  return processWebhook(req,res).catch(error=>{
    console.error("[billing] webhook processing failed:",error);
    res.status(500).json({error:"Webhook processing failed."});
  });
}
async function processWebhook(req,res) {
  if(!verifyPaddleSignature(req.get("Paddle-Signature"),req.body,process.env.PADDLE_WEBHOOK_SECRET)) return res.status(401).json({error:"Invalid Paddle signature."});
  let event;
  try { event=JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({error:"Invalid JSON."}); }
  if(!event?.event_id||!event?.event_type||!event?.occurred_at) return res.status(400).json({error:"Invalid event."});
  const date=new Date(event.occurred_at);
  if(Number.isNaN(date.getTime())) return res.status(400).json({error:"Invalid event timestamp."});
  const data=event.data||{};
  let notification=null;
  await prisma.$transaction(async tx=>{
    const exists=await tx.billingWebhookEvent.findUnique({where:{eventId:event.event_id}});
    if(exists) return;
    if(SUBSCRIPTION_EVENTS.has(event.event_type) && data.id) {
      let checkout=data.transaction_id ? await tx.billingCheckout.findUnique({where:{transactionId:data.transaction_id}}) : null;
      let linked=await tx.billingSubscription.findUnique({where:{paddleSubscriptionId:data.id}});
      const userId=linked?.userId||checkout?.userId;
      if (linked && checkout && checkout.userId !== linked.userId) throw new Error("Paddle subscription and checkout owner mismatch.");
      // Reject untrusted custom_data for provisioning: the server-created transaction record is the source of truth.
      const plan=subscriptionPlan(data);
      // Shared Paddle merchant account: reject BuildHire subscriptions and
      // modified prices even when the event signature is valid.
      if (userId && belongsToVoxora({ linkedSubscription: linked, linkedCheckout: checkout, paddlePlan: plan, checkoutPlan: checkout?.plan })) {
          const payload={
            paddleSubscriptionId:data.id,paddleCustomerId:data.customer_id||linked?.paddleCustomerId||null,
            plan,status:String(data.status||"inactive"),
            periodEnd:data.current_billing_period?.ends_at?new Date(data.current_billing_period.ends_at):null,
            cancelAtPeriodEnd:Boolean(data.scheduled_change?.action==="cancel"),
            lastEventAt:date,
          };
          const previousForUser = linked ? null : await tx.billingSubscription.findUnique({ where: { userId } });
          const replacingOther = previousForUser && previousForUser.paddleSubscriptionId !== data.id;
          if (replacingOther && (isPaidSubscriptionActive(previousForUser) || !checkout)) {
            console.warn("[billing] Ignored foreign or outdated subscription event", event.event_type);
          } else if (linked && date < linked.lastEventAt) {
            // Out-of-order event: never roll back a newer confirmed price/status.
          } else {
            if (linked) {
              await tx.billingSubscription.update({ where: { id: linked.id }, data: payload });
            } else {
              await tx.billingSubscription.upsert({ where: { userId }, create: { userId, ...payload }, update: payload });
            }
            if (checkout?.userId === userId && checkout.plan === plan) {
              await tx.billingCheckout.update({
                where: { id: checkout.id },
                data: {
                  paddleSubscriptionId: data.id,
                  ...(isPaidSubscriptionActive(payload) ? { status: "activated", lastEventAt: date } : {}),
                },
              });
              if (isPaidSubscriptionActive(payload)) {
                await tx.billingCheckoutLock.updateMany({
                  where: { userId, transactionId: checkout.transactionId },
                  data: { status: "finished" },
                });
              }
            }
            if (isPaidSubscriptionActive(payload)) {
              await tx.user.updateMany({
                where: { id: userId, planSelectedAt: null },
                data: { planSelectedAt: new Date(), intendedPlan: null },
              });
              await tx.billingPlanChange.updateMany({
                where: {
                  userId, paddleSubscriptionId: data.id, toPlan: plan,
                  status: { in: ["processing", "uncertain"] },
                  requestedAt: { lte: date },
                },
                data: { status: "activated", lastError: null },
              });
            }
            if (["subscription.created","subscription.activated","subscription.canceled","subscription.past_due"].includes(event.event_type))
              notification = { type:event.event_type, userId, plan, info:{ periodEnd: payload.periodEnd?.toISOString() } };
          }
      } else {
        console.warn("[billing] Ignoring unowned or non-Voxora subscription event", event.event_type);
      }
    } else if (["transaction.completed","transaction.payment_failed","transaction.canceled","transaction.past_due"].includes(event.event_type)) {
      const checkout = data.id ? await tx.billingCheckout.findUnique({ where: { transactionId: data.id } }) : null;
      const subscription = data.subscription_id
        ? await tx.billingSubscription.findUnique({ where: { paddleSubscriptionId: data.subscription_id } }) : null;
      // No checkout or previously-owned subscription => another product on
      // SL Options' shared Paddle account. Do not notify or mutate anything.
      const userId = checkout?.userId || subscription?.userId;
      if (checkout && (!checkout.lastEventAt || date >= checkout.lastEventAt)) {
        const nextStatus = checkoutEventStatus(event.event_type, checkout.status);
        await tx.billingCheckout.update({
          where: { id: checkout.id },
          data: { status: nextStatus, lastEventAt: date },
        });
        if (nextStatus === "canceled") {
          await tx.billingCheckoutLock.updateMany({
            where: { userId: checkout.userId, transactionId: checkout.transactionId },
            data: { status: "finished" },
          });
        }
      }
      if (subscription && event.event_type === "transaction.payment_failed"
          && data.origin === "subscription_update") {
        await tx.billingPlanChange.updateMany({
          where: {
            userId: subscription.userId, paddleSubscriptionId: subscription.paddleSubscriptionId,
            status: { in: ["processing", "uncertain"] }, requestedAt: { lte: date },
          },
          data: { status: "failed", lastError: "Paddle declined the prorated payment. Your original plan remains active." },
        });
      }
      if (userId && ["transaction.completed","transaction.payment_failed"].includes(event.event_type))
        notification = {type:event.event_type,userId,plan:checkout?.plan||subscription?.plan,
          info:{amountMinor:data.details?.totals?.total,currency:data.currency_code,transactionId:data.id,invoiceNumber:data.invoice_number}};
    }
    await tx.billingWebhookEvent.create({data:{eventId:event.event_id,eventType:event.event_type,occurredAt:date}});
  });
  res.json({ok:true});
  if(notification) {
    void prisma.user.findUnique({where:{id:notification.userId}})
      .then(user=>{ if(user) emailForEvent(notification.type,user,notification.plan,notification.info); })
      .catch(error=>console.error("[billing] Notification lookup failed:",error.message));
  }
}
