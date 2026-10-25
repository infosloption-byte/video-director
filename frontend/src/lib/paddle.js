let paddleLoad;
let eventHandler = null;
let activeTransaction = null;
let initializedToken = null;
let initializedEnvironment = null;

export async function loadPaddle() {
  if (window.Paddle) return window.Paddle;
  if (!paddleLoad) {
    paddleLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.onload = () => resolve(window.Paddle);
      script.onerror = () => { paddleLoad = null; reject(new Error("Unable to load Paddle checkout.")); };
      document.head.appendChild(script);
    });
  }
  return paddleLoad;
}

// Paddle.Checkout emits a client-side event, not server-side payment proof.
// Always wait for the signed Paddle webhook before activating entitlements.
export async function openPaddleCheckout({ transactionId, clientToken, environment, onCompleted, onClosed, onError, customerEmail, successUrl }) {
  if (!/^txn_[a-z0-9]{20,100}$/.test(transactionId || "")) throw new Error("Invalid Paddle transaction.");
  const Paddle = await loadPaddle();
  if (!Paddle) throw new Error("Paddle checkout could not load.");
  if (initializedToken && (initializedToken !== clientToken || initializedEnvironment !== environment)) {
    throw new Error("Paddle environment changed. Reload the page to continue securely.");
  }
  activeTransaction = transactionId;
  eventHandler = { onCompleted, onClosed, onError };
  if (environment === "sandbox") Paddle.Environment.set("sandbox");
  if (!Paddle.Initialized) {
    Paddle.Initialize({
      token: clientToken,
      eventCallback: (event) => {
        const relatedTransaction = event?.data?.transaction_id || event?.data?.transactionId;
        if (relatedTransaction && relatedTransaction !== activeTransaction) return;
        if (event?.name === "checkout.completed") eventHandler?.onCompleted?.(event);
        if (event?.name === "checkout.closed") eventHandler?.onClosed?.(event);
        if (event?.name === "checkout.error" || event?.name === "checkout.payment.failed") eventHandler?.onError?.(event);
      },
    });
  }
  initializedToken = clientToken;
  initializedEnvironment = environment;
  Paddle.Checkout.open({
    transactionId,
    ...(customerEmail ? { customer: { email: customerEmail } } : {}),
    settings: { displayMode: "overlay", ...(successUrl ? { successUrl } : {}) },
  });
  return Paddle;
}
