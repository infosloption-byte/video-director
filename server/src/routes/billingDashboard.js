import { Router } from "express";
import { prisma } from "../db/client.js";
import { expensiveOperationRateLimit } from "../middleware/rateLimit.js";
import { paddleFetch, userBilling } from "../services/billingService.js";
import {
  billingActivity, cleanTransaction, cursorFromMeta, invoiceBelongsToUser, MANAGEMENT_ACTIONS,
  paddleList, paddlePlanMismatch, paymentManagementUrl, subscriptionSnapshot,
  SUBSCRIPTION_ID, TRANSACTION_ID,
} from "../services/billingDashboardService.js";

export const billingDashboardRouter = Router();

function requireSignedIn(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: "Sign in to view Billing." });
  next();
}
billingDashboardRouter.use(requireSignedIn);
billingDashboardRouter.use((_req, res, next) => { res.set("Cache-Control", "no-store, private"); next(); });

async function ownedSubscription(userId) {
  return prisma.billingSubscription.findUnique({ where: { userId } });
}
// Retain paid history after a user cancels and later subscribes again.
// These IDs originate in Voxora's own signed checkout/subscription records,
// never from a browser parameter or a shared Paddle customer's other apps.
async function ownedSubscriptionIds(userId, local) {
  const checkouts = await prisma.billingCheckout.findMany({
    where: { userId, paddleSubscriptionId: { not: null } },
    select: { paddleSubscriptionId: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return [...new Set([local?.paddleSubscriptionId, ...checkouts.map(item => item.paddleSubscriptionId)]
    .filter(value => SUBSCRIPTION_ID.test(value || "")))];
}
async function liveSubscription(local) {
  if (!local || !SUBSCRIPTION_ID.test(local.paddleSubscriptionId)) return null;
  const remote = await paddleFetch(`/subscriptions/${encodeURIComponent(local.paddleSubscriptionId)}`);
  if (paddlePlanMismatch(remote, local)) {
    const error = new Error("Paddle subscription details do not match Voxora billing records. Contact billing support.");
    error.status = 409; throw error;
  }
  if (local.paddleCustomerId && remote.customer_id !== local.paddleCustomerId) {
    const error = new Error("Paddle customer details require billing support to reconcile.");
    error.status = 409; throw error;
  }
  return remote;
}
function unavailable(res, error, message = "Paddle billing records are temporarily unavailable. Please try again.") {
  if (error.status === 409) return res.status(409).json({ error: error.message });
  console.error("[billing-dashboard] Paddle lookup failed:", error.message);
  return res.status(503).json({ error: message });
}
function arrayData(payload) { return Array.isArray(payload?.data) ? payload.data : []; }
function transactionQuery(ownedIds, cursor, perPage = 20) {
  const params = new URLSearchParams({
    subscription_id: ownedIds.join(","),
    per_page: String(perPage),
  });
  if (cursor) params.set("after", cursor);
  return params;
}

billingDashboardRouter.get("/dashboard", async (req, res, next) => {
  try {
    const [account, local] = await Promise.all([
      userBilling(req.user.id),
      ownedSubscription(req.user.id),
    ]);
    if (!local) return res.json({ account, subscription: null, warnings: [] });
    try {
      const remote = await liveSubscription(local);
      return res.json({
        account, subscription: subscriptionSnapshot(local, remote), warnings: [],
      });
    } catch (error) {
      // The signed local record is safe to show with an explicit stale marker.
      return res.json({
        account, subscription: subscriptionSnapshot(local, null),
        warnings: [error.status === 409
          ? "Paddle and Voxora subscription details need reconciliation. Billing actions are disabled."
          : "Live Paddle billing dates are temporarily unavailable. Showing the last confirmed Voxora status."],
      });
    }
  } catch (error) { next(error); }
});

billingDashboardRouter.get("/dashboard/transactions", async (req, res, next) => {
  try {
    const cursor = String(req.query.cursor || "");
    if (cursor && !TRANSACTION_ID.test(cursor))
      return res.status(400).json({ error: "Invalid transaction history cursor." });
    const local = await ownedSubscription(req.user.id);
    const ownedIds = await ownedSubscriptionIds(req.user.id, local);
    if (!ownedIds.length) return res.json({ items: [], nextCursor: null });
    let result;
    try { result = await paddleList("/transactions", transactionQuery(ownedIds, cursor)); }
    catch (error) { return unavailable(res, error, "Transaction history is unavailable. Your subscription has not been changed."); }
    const allowed = new Set(ownedIds);
    const rows = arrayData(result).filter(row => allowed.has(row.subscription_id));
    const nextCursor = cursorFromMeta(result.meta);
    return res.json({
      items: rows.map(cleanTransaction),
      nextCursor,
    });
  } catch (error) { next(error); }
});

billingDashboardRouter.get("/dashboard/activity", async (req, res, next) => {
  try {
    const local = await ownedSubscription(req.user.id);
    const ownedIds = await ownedSubscriptionIds(req.user.id, local);
    if (!local || !ownedIds.length) return res.json({ items: [], warnings: [] });
    const warnings = [];
    const [historyResult, transactionsResult, change] = await Promise.all([
      paddleList(`/subscriptions/${encodeURIComponent(local.paddleSubscriptionId)}/history`, new URLSearchParams({ per_page: "30" }))
        .catch(error => { warnings.push(error.status === 403
          ? "Paddle subscription-history permission is not enabled; showing available payment activity."
          : "Subscription activity from Paddle is temporarily unavailable."); return null; }),
      paddleList("/transactions", transactionQuery(ownedIds, null, 30))
        .catch(() => { warnings.push("Recent Paddle payment activity is temporarily unavailable."); return null; }),
      prisma.billingPlanChange.findUnique({ where: { userId: req.user.id } }),
    ]);
    const history = arrayData(historyResult)
      .filter(row => row.subscription_id === local.paddleSubscriptionId);
    const allowed = new Set(ownedIds);
    const transactions = arrayData(transactionsResult)
      .filter(row => allowed.has(row.subscription_id))
      .map(cleanTransaction);
    const localChange = change?.paddleSubscriptionId === local.paddleSubscriptionId ? change : null;
    return res.json({ items: billingActivity({ history, transactions, localChange }), warnings });
  } catch (error) { next(error); }
});

billingDashboardRouter.get("/dashboard/invoice/:id", expensiveOperationRateLimit, async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    if (!TRANSACTION_ID.test(id)) return res.status(400).json({ error: "Invalid transaction ID." });
    const [local, ownedCheckout] = await Promise.all([
      ownedSubscription(req.user.id),
      prisma.billingCheckout.findUnique({ where: { transactionId: id } }),
    ]);
    // History may include renewals from previous Voxora subscriptions. Those
    // subscription IDs are resolved from this user's OWN server-held checkout
    // records, so invoice URLs remain inaccessible to BuildHire customers.
    const ownedIds = await ownedSubscriptionIds(req.user.id, local);
    if (!ownedIds.length && ownedCheckout?.userId !== req.user.id)
      return res.status(404).json({ error: "Invoice not found." });
    let transaction;
    try { transaction = await paddleFetch(`/transactions/${encodeURIComponent(id)}`); }
    catch (error) { return unavailable(res, error, "The invoice is temporarily unavailable."); }
    if (transaction?.id !== id || !invoiceBelongsToUser(transaction, local, ownedCheckout, req.user.id, ownedIds))
      return res.status(404).json({ error: "Invoice not found." });
    if (transaction.status !== "completed" || !(Number(transaction.details?.totals?.total) > 0))
      return res.status(409).json({ error: "Paddle has not generated a paid invoice for this transaction." });
    let invoice;
    try { invoice = await paddleFetch(`/transactions/${encodeURIComponent(id)}/invoice?disposition=inline`); }
    catch (error) { return unavailable(res, error, "Paddle could not generate this invoice PDF."); }
    if (typeof invoice?.url !== "string" || !invoice.url.startsWith("https://"))
      return res.status(503).json({ error: "Paddle did not return a secure invoice link." });
    // The presigned URL expires after about one hour, so never persist/cache it.
    return res.json({ url: invoice.url });
  } catch (error) { next(error); }
});

billingDashboardRouter.get("/dashboard/manage", expensiveOperationRateLimit, async (req, res, next) => {
  try {
    const action = String(req.query.action || "overview");
    if (!MANAGEMENT_ACTIONS.includes(action))
      return res.status(400).json({ error: "Unsupported billing management action." });
    const local = await ownedSubscription(req.user.id);
    if (!local) return res.status(404).json({ error: "No subscription is available to manage." });
    let remote;
    try { remote = await liveSubscription(local); }
    catch (error) { return unavailable(res, error, "Unable to open Paddle billing management right now."); }
    const isCanceled = remote.scheduled_change?.action === "cancel";
    if (action === "cancel" && (isCanceled || !["active","trialing"].includes(remote.status)))
      return res.status(409).json({ error: "This subscription cannot be scheduled for cancellation again." });
    if (action === "retry" && remote.status !== "past_due")
      return res.status(409).json({ error: "There is no overdue subscription payment to recover." });
    let url = null;
    // Prefer a fresh login-free portal session; fall back to Paddle-provided
    // management URLs if the session request fails. Paddle's portal session
    // write permission is needed for these authenticated management links.
    if (remote.customer_id) {
      try {
        const session = await paddleFetch(`/customers/${encodeURIComponent(remote.customer_id)}/portal-sessions`, {
          method: "POST",
          body: JSON.stringify({ subscription_ids: [remote.id] }),
        });
        const item = session?.urls?.subscriptions?.find(entry => entry.id === remote.id);
        url = action === "cancel" ? item?.cancel_subscription
          : action === "payment" || action === "retry" ? item?.update_subscription_payment_method
          : item?.view_subscription || session?.urls?.general?.overview;
      } catch {
        // Use Paddle-issued subscription management links below.
      }
    }
    if (!url) url = paymentManagementUrl(remote, action);
    if (typeof url !== "string") return res.status(503).json({ error: "Paddle billing portal is unavailable." });
    try {
      const target = new URL(url);
      if (target.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)*paddle\.com$/.test(target.hostname))
        return res.status(503).json({ error: "Paddle returned an invalid management link." });
    } catch { return res.status(503).json({ error: "Paddle returned an invalid management link." }); }
    return res.json({ url });
  } catch (error) { next(error); }
});
