import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import LegalFooter from "../components/LegalFooter";
import { useAuth } from "../context/AuthContext";
import "./BillingPage.css";

let paddleLoad;
async function loadPaddle() {
  if (window.Paddle) return window.Paddle;
  if (!paddleLoad) paddleLoad = new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async=true;
    script.onload=()=>resolve(window.Paddle);
    script.onerror=()=>reject(new Error("Unable to load Paddle checkout."));
    document.head.appendChild(script);
  });
  return paddleLoad;
}
export default function BillingPage() {
  const {user}=useAuth();
  const [data,setData]=useState(null);
  const [catalog,setCatalog]=useState(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let active=true;
    Promise.all([
      fetch("/api/billing/me",{credentials:"include"}).then(r=>r.ok?r.json():Promise.reject(new Error("Cannot load subscription."))),
      fetch("/api/billing/plans").then(r=>r.json())
    ]).then(([account,plans])=>{if(active){setData(account);setCatalog(plans);}}).catch(e=>{if(active)setError(e.message)});
    return ()=>{active=false};
  },[]);
  async function checkout(plan) {
    setBusy(plan);setError("");setMessage("");
    try {
      const response=await fetch("/api/billing/checkout",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Unable to create checkout.");
      const Paddle=await loadPaddle();
      if(!Paddle) throw new Error("Paddle checkout could not load.");
      if(result.environment==="sandbox") Paddle.Environment.set("sandbox");
      if(!Paddle.Initialized) Paddle.Initialize({token:result.clientToken,eventCallback:(event)=>{if(event.name==="checkout.completed")setMessage("Payment submitted. Subscription access will activate after Paddle confirms the payment.");}});
      Paddle.Checkout.open({transactionId:result.transactionId});
    } catch(e){setError(e.message||"Checkout failed");} finally {setBusy("");}
  }
  async function portal(action = "payment") {
    setBusy(action);setError("");
    try {
      const r=await fetch(`/api/billing/portal?action=${action}`,{credentials:"include"});
      const result=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(result.error||"Unable to open Paddle billing.");
      window.location.assign(result.url);
    }catch(e){setError(e.message)}finally{setBusy("")}
  }
  return <div className="hx-page billing-page"><Header right={<Link className="btn btn-ghost" to="/my-research">Workspace</Link>}/><main className="container billing-page__main">
    <p className="eyebrow">Subscription & usage</p><h1>Build at your pace.</h1><p>Manage your subscription and keep track of your monthly video render allowance. Quotas are enforced when you submit a render.</p>
    {error&&<div role="alert" className="billing-alert">{error}</div>}{message&&<div role="status" className="billing-message">{message}</div>}
    {!user?.emailVerifiedAt&&<div className="billing-alert">Verify your email before upgrading or generating videos. <Link to="/account">Account settings →</Link></div>}
    {data&&<section className="billing-summary"><div><span>Current plan</span><strong>{data.plan.name}</strong><small>{data.subscription?.status||"Free plan"}</small></div><div><span>Renders this month</span><strong>{data.used} / {data.plan.rendersPerMonth}</strong><small>{data.month} (UTC)</small></div><div><span>Remaining</span><strong>{data.remaining}</strong><small>Up to {data.plan.maxSeconds} sec each</small></div></section>}
    <h2>Choose a plan</h2><div className="billing-cards">{(catalog?.plans||[]).map(plan=><article className={plan.id===data?.plan?.id?"billing-card billing-card--active":"billing-card"} key={plan.id}>
      <div><span className="eyebrow">{plan.id===data?.plan?.id?"CURRENT PLAN":"MONTHLY"}</span><h3>{plan.name}</h3><p>{plan.rendersPerMonth} videos per month · up to {plan.maxSeconds} seconds each</p></div><div className="billing-card__price">${plan.monthlyUsd}<small>/ month</small></div>
      {plan.id===data?.plan?.id?<span className="billing-current">Active plan</span>:plan.id==="free"?<span className="billing-current">Included by default</span>:<button className="btn btn-cream" disabled={!catalog.billingReady||!!busy||!user?.emailVerifiedAt||Boolean(data?.subscription&&["active","trialing"].includes(data.subscription.status))} onClick={()=>checkout(plan.id)}>{busy===plan.id?"Opening…":catalog.billingReady?"Subscribe with Paddle":"Coming soon"}</button>}
    </article>)}</div>
    {data?.subscription&&<section className="billing-manage"><div><strong>Existing subscription</strong><p>Update payment method and manage your subscription in Paddle's secure customer portal.</p></div><button className="btn btn-ghost" disabled={!!busy} onClick={()=>portal("payment")}>Update payment method ↗</button>{!data.subscription.cancelAtPeriodEnd&&<button className="btn btn-ghost" disabled={!!busy} onClick={()=>portal("cancel")}>Cancel subscription ↗</button>}</section>}
    <p className="billing-footnote">Proposed launch pricing shown for planning; paid checkout only activates after Paddle sandbox and production configuration. Payment confirmation comes from signed webhooks—not from the browser checkout result. Monthly render counts currently reset on the first day of the month (UTC).</p>
  </main>
    <LegalFooter /></div>;
}
