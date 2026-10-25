let paddleLoad;
let completedHandler = null;

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

/** Opens the Paddle overlay for a server-created transaction. `onCompleted` fires once payment is submitted. */
export async function openPaddleCheckout({ transactionId, clientToken, environment, onCompleted }) {
  const Paddle = await loadPaddle();
  if (!Paddle) throw new Error("Paddle checkout could not load.");
  completedHandler = onCompleted || null;
  if (environment === "sandbox") Paddle.Environment.set("sandbox");
  if (!Paddle.Initialized) {
    Paddle.Initialize({
      token: clientToken,
      eventCallback: (event) => {
        if (event.name === "checkout.completed" && completedHandler) completedHandler(event);
      },
    });
  }
  Paddle.Checkout.open({ transactionId });
  return Paddle;
}
