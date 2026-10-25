import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { loadPaddle } from "../lib/paddle";
import "./PaddlePaymentLinkPage.css";

// Paddle's account-wide default payment link resolves to /checkout?_ptxn=... .
// It must be public: expired sessions should not prevent users from updating
// payment details through an official Paddle subscription management email.
export default function PaddlePaymentLinkPage() {
  const location = useLocation();
  const transactionId = new URLSearchParams(location.search).get("_ptxn");
  const validTransaction = /^txn_[a-z0-9]{20,100}$/.test(transactionId || "");
  const [paddle, setPaddle] = useState(null);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("Loading Paddle's secure payment screen…");

  useEffect(() => {
    if (!validTransaction) return undefined;
    let live = true;
    (async () => {
      try {
        const response = await fetch("/api/billing/checkout-config", { cache: "no-store" });
        const settings = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(settings.error || "Secure payment service is unavailable.");
        const sdk = await loadPaddle();
        if (!live) return;
        if (settings.environment === "sandbox") sdk.Environment.set("sandbox");
        if (!sdk.Initialized) sdk.Initialize({
          token: settings.clientToken,
          eventCallback: (event) => {
            if (!live) return;
            if (event.name === "checkout.completed") {
              setState("complete");
              setMessage("Payment details were submitted. Your subscription status will be updated after Paddle confirms the transaction.");
            } else if (event.name === "checkout.closed") {
              setState("ready");
              setMessage("Checkout was closed. You can reopen the secure payment screen.");
            }
          },
        });
        setPaddle(sdk);
        setState("ready");
        setMessage("If Paddle does not open automatically, select Open secure checkout.");
        // Paddle.js recognizes the _ptxn query parameter in this URL and
        // launches its linked checkout after initialization.
      } catch (error) {
        if (!live) return;
        setState("error");
        setMessage(error.message || "Could not load Paddle payment.");
      }
    })();
    return () => { live = false; };
  }, [validTransaction, transactionId]);

  function reopen() {
    if (!paddle || !validTransaction) return;
    try { paddle.Checkout.open({ transactionId }); }
    catch { setMessage("Unable to reopen checkout. Please reload this page or contact support."); }
  }

  return <div className="paddle-link-page">
    <header className="paddle-link-page__header"><Link to="/"><span>V</span> Voxora</Link><a href="https://sloptions.xyz" target="_blank" rel="noopener noreferrer">A product of SL Options</a></header>
    <main className="paddle-link-page__main">
      <p className="eyebrow">SECURE SUBSCRIPTION PAYMENT</p>
      <h1>Complete your payment with Paddle.</h1>
      <p>Voxora uses Paddle to securely process subscription purchases and payment-method updates. Your payment-card details are not collected by the Voxora website.</p>
      {!validTransaction
        ? <div className="paddle-link-page__notice" role="alert">This page requires a valid Paddle payment link. To choose a plan, open Voxora's <Link to="/choose-plan">plan selector</Link>.</div>
        : <div className="paddle-link-page__notice" role="status">{message}</div>}
      {validTransaction && state !== "complete" && <button type="button" className="btn btn-cream" disabled={!paddle || state === "loading"} onClick={reopen}>{state === "loading" ? "Loading secure checkout…" : "Open secure checkout →"}</button>}
      <div className="paddle-link-page__links"><Link to="/billing">Subscription & billing</Link><Link to="/signin">Sign in</Link><Link to="/">Voxora home</Link></div>
    </main>
  </div>;
}
