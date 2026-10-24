import { Router } from "express";
import { prisma } from "../db/client.js";
import { checkoutEnabled, effectivePlan, paddleFetch, PLANS, paidPlanIds, priceId, publicPlans, userBilling, verifyPaddleSignature } from "../services/billingService.js";
import { sendEmail } from "../services/emailService.js";

export const billingRouter = Router();
billingRouter.get("/plans", (_req, res) => res.json({ plans: publicPlans(), billingReady: checkoutEnabled(), currency: "USD", provisionalPricing: true }));
billingRouter.get("/me", async (req, res, next) => {
  try { if (!req.user?.id) return res.status(401).json({ error:"Sign in first." }); res.json(await userBilling(req.user.id)); } catch (error) { next(error); }
});
billingRouter.post("/checkout", async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({error:"Sign in to continue."});
    if (!req.user.emailVerifiedAt) return res.status(403).json({error:"Verify your email before subscribing."});
    const plan=String(req.body?.plan||"");
    if (!paidPlanIds.includes(plan)) return res.status(400).json({error:"Unknown paid plan."});
    if(!checkoutEnabled()) return res.status(503).json({error:"Paddle checkout is not configured yet."});
    const current=await userBilling(req.user.id);
    if(current.subscription && ["active","trialing"].includes(current.subscription.status)) return res.status(409).json({error:"Manage or change your existing subscription in the billing portal."});
    const data=await paddleFetch("/transactions",{
      method:"POST",
      body:JSON.stringify({ items:[{price_id:priceId(plan),quantity:1}],collection_mode:"automatic",custom_data:{voxora_user_id:req.user.id,voxora_plan:plan} }),
    });
    if(!data?.id || !String(data.id).startsWith("txn_")) throw new Error("Paddle did not return a transaction.");
    await prisma.billingCheckout.create({data:{userId:req.user.id,plan,transactionId:data.id}});
    res.status(201).json({transactionId:data.id,clientToken:process.env.PADDLE_CLIENT_TOKEN,environment:process.env.PADDLE_ENV==="live"?"production":"sandbox"});
  } catch(error) { next(error); }
});
billingRouter.get("/portal", async (req, res, next) => {
  try {
    if(!req.user?.id) return res.status(401).json({error:"Sign in first."});
    const sub=await prisma.billingSubscription.findUnique({where:{userId:req.user.id}});
    if(!sub) return res.status(404).json({error:"No subscription to manage."});
    const data=await paddleFetch(`/subscriptions/${encodeURIComponent(sub.paddleSubscriptionId)}`);
    const url=data?.management_urls?.update_payment_method||data?.management_urls?.cancel;
    if(!url || !/^https:\/\//.test(url)) return res.status(503).json({error:"Paddle management link is unavailable."});
    res.json({url});
  } catch(error) { next(error); }
});

const SUBSCRIPTION_EVENTS=new Set(["subscription.created","subscription.updated","subscription.activated","subscription.trialing","subscription.canceled","subscription.paused","subscription.resumed","subscription.past_due"]);
function subscriptionPlan(data) {
  const values=(data.items||[]).map(item=>item.price?.id||item.price_id);
  const found=paidPlanIds.find(p=>values.includes(priceId(p)));
  return found||null;
}
function emailForEvent(eventType, user, plan) {
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
  void sendEmail({to:user.email,subject:m[0],title:m[0],lead:m[1],detail:"For your security, sign in to Voxora to review account details."}).catch(error=>console.error("[billing] notification email failed:",error.message));
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
      let userId=linked?.userId||checkout?.userId;
      // Reject untrusted custom_data for provisioning: the server-created transaction record is the source of truth.
      if(userId) {
        const plan=subscriptionPlan(data)||checkout?.plan||linked?.plan;
        if(plan) {
          const payload={
            paddleSubscriptionId:data.id,paddleCustomerId:data.customer_id||linked?.paddleCustomerId||null,
            plan,status:String(data.status||"inactive"),
            periodEnd:data.current_billing_period?.ends_at?new Date(data.current_billing_period.ends_at):null,
            cancelAtPeriodEnd:Boolean(data.scheduled_change?.action==="cancel"),
            lastEventAt:date,
          };
          if(linked) {
            if(date>=linked.lastEventAt) await tx.billingSubscription.update({where:{id:linked.id},data:payload});
          } else {
            await tx.billingSubscription.upsert({where:{userId},create:{userId,...payload},update:payload});
          }
          if(["subscription.created","subscription.activated","subscription.canceled","subscription.past_due"].includes(event.event_type)) notification={type:event.event_type,userId,plan};
        }
      } else console.warn("[billing] Ignoring unlinked subscription event:",event.event_type,data.id);
    } else if(["transaction.completed","transaction.payment_failed"].includes(event.event_type)) {
      const checkout=data.id?await tx.billingCheckout.findUnique({where:{transactionId:data.id}}):null;
      const subscription=data.subscription_id?await tx.billingSubscription.findUnique({where:{paddleSubscriptionId:data.subscription_id}}):null;
      const userId=checkout?.userId||subscription?.userId;
      if(userId) notification={type:event.event_type,userId,plan:checkout?.plan||subscription?.plan};
    }
    await tx.billingWebhookEvent.create({data:{eventId:event.event_id,eventType:event.event_type,occurredAt:date}});
  });
  res.json({ok:true});
  if(notification) {
    const user=await prisma.user.findUnique({where:{id:notification.userId}}).catch(()=>null);
    if(user) emailForEvent(notification.type,user,notification.plan);
  }
}
