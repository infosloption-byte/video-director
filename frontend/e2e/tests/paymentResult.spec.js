import { test, expect } from "@playwright/test";

// Browser flow fixtures simulate server records updated by signed Paddle webhooks.
// No sandbox cards, remote Paddle requests or user accounts are used.
const transactionId = "txn_01j12345678901234567890123";
const plans = [
  { id:"free", name:"Free", monthlyUsd:0, rendersPerMonth:3, maxSeconds:60 },
  { id:"creator", name:"Creator", monthlyUsd:19, rendersPerMonth:30, maxSeconds:60 },
  { id:"studio", name:"Studio", monthlyUsd:49, rendersPerMonth:150, maxSeconds:60 },
];

async function mockResultApi(page, state) {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const data = payload => route.fulfill({
      status:200, contentType:"application/json", body:JSON.stringify(payload),
    });
    if (path === "/api/auth/me") return data({
      authenticated:true,
      user:{
        id:"payment-test-user", email:"qa@example.test", emailVerifiedAt:"2026-10-26T00:00:00.000Z",
        planSelectedAt:state.activePlan !== "free" ? "2026-10-26T00:00:00.000Z" : null,
      },
    });
    if (path === "/api/billing/payment-state") return data({
      checkout:state.checkout, change:state.change, creating:false,
    });
    if (path === "/api/billing/me") return data({
      plan:plans.find(p => p.id === state.activePlan),
      subscription:state.activePlan === "free" ? null : {
        status:"active", paddleSubscriptionId:"sub_01abc",
        periodEnd:"2026-11-26T00:00:00.000Z", cancelAtPeriodEnd:false,
      },
      used:0, remaining:plans.find(p=>p.id===state.activePlan).rendersPerMonth, month:"2026-10",
    });
    if (path === "/api/billing/plans") return data({ plans, billingReady:true });
    return data({});
  });
}

test("a client completion hint remains processing until verified, then shows readable Creator receipt", async ({ page }) => {
  const state = {
    activePlan:"free",change:null,
    checkout:{ transactionId,plan:"creator",status:"processing" },
  };
  await mockResultApi(page, state);
  await page.goto(`/payment-result?type=checkout&transactionId=${transactionId}&onboarding=1`);
  await expect(page.getByRole("heading", { name:"Checking your payment…" })).toBeVisible();
  await expect(page.getByText("Payment successful!")).toHaveCount(0);
  state.checkout = {...state.checkout,status:"activated"};
  state.activePlan = "creator";
  await expect(page.getByRole("heading", { name:"Payment successful!" })).toBeVisible({timeout:12000});
  const summary = page.getByRole("region", { name:"Confirmed subscription summary" });
  // The summary is labelled as a non-region section; read it directly.
  await expect(page.getByLabel("Confirmed subscription summary")).toContainText("Creator");
  await expect(page.getByLabel("Confirmed subscription summary")).toContainText("$19.00 / month");
  await expect(page.getByLabel("Confirmed subscription summary")).toContainText("30");
  await expect(page.getByLabel("Confirmed subscription summary")).toContainText("November 26, 2026");
  await expect(page.getByText("Redirecting to your workspace in 15 seconds")).toBeVisible();
  await page.getByRole("button", { name:"Go to workspace" }).click();
  await expect(page).toHaveURL(/\/signals$/);
});

test("countdown automatically continues to the workspace after enough reading time", async ({ page }) => {
  await page.clock.install();
  const state = {
    activePlan:"studio",change:null,
    checkout:{transactionId,plan:"studio",status:"activated"},
  };
  await mockResultApi(page,state);
  await page.goto(`/payment-result?type=checkout&transactionId=${transactionId}`);
  await expect(page.getByRole("heading",{name:"Payment successful!"})).toBeVisible();
  await page.clock.runFor(5000);
  await expect(page.getByText("Redirecting to your workspace in 10 seconds")).toBeVisible();
  await page.clock.runFor(10000);
  await expect(page).toHaveURL(/\/signals$/);
});

test("a signed payment failure shows a recoverable explanation and plan link", async ({ page }) => {
  const state = {
    activePlan:"free",change:null,
    checkout:{transactionId,plan:"creator",status:"failed",resumable:true},
  };
  await mockResultApi(page,state);
  await page.goto(`/payment-result?type=checkout&transactionId=${transactionId}&onboarding=1`);
  await expect(page.getByRole("heading",{name:"Your payment wasn't successful."})).toBeVisible();
  await expect(page.getByText("Payment successful!")).toHaveCount(0);
  await expect(page.getByText("Redirecting to plan selection in 15 seconds")).toBeVisible();
  await page.getByRole("button",{name:"Back to plans and retry"}).click();
  await expect(page).toHaveURL(/\/choose-plan/);
  await expect(page.getByRole("button",{name:"Resume checkout"})).toBeVisible();
});

test("checkout SDK error without signed failure never claims a charge was declined", async ({ page }) => {
  const state = {
    activePlan:"free",change:null,
    checkout:{transactionId,plan:"creator",status:"awaiting_payment",resumable:true},
  };
  await mockResultApi(page,state);
  await page.goto(`/payment-result?type=checkout&transactionId=${transactionId}&issue=1`);
  await expect(page.getByRole("heading",{name:"Checkout could not finish."})).toBeVisible();
  await expect(page.getByText("Payment successful!")).toHaveCount(0);
  await page.getByRole("button",{name:"Back to plans and retry"}).click();
  await expect(page).toHaveURL(/\/choose-plan/);
});

test("confirmed Creator-to-Studio upgrade shows the subscription summary and Billing link", async ({ page }) => {
  const state = {
    activePlan:"studio",checkout:null,
    change:{plan:"studio",fromPlan:"creator",status:"activated"},
  };
  await mockResultApi(page,state);
  await page.goto("/payment-result?type=change&plan=studio");
  await expect(page.getByRole("heading",{name:"Your plan is updated."})).toBeVisible();
  await expect(page.getByLabel("Confirmed subscription summary")).toContainText("Studio");
  await expect(page.getByLabel("Confirmed subscription summary")).toContainText("$49.00 / month");
  await page.getByRole("link",{name:"View subscription & billing"}).click();
  await expect(page).toHaveURL(/\/billing$/);
});

test("invalid or foreign transaction cannot display a payment success result", async ({ page }) => {
  const state = {
    activePlan:"studio",change:null,
    checkout:{transactionId,plan:"studio",status:"activated"},
  };
  await mockResultApi(page,state);
  await page.goto("/payment-result?type=checkout&transactionId=txn_invalidforeign012345678901");
  await expect(page.getByRole("heading",{name:"Checking your payment…"})).toBeVisible();
  await expect(page.getByText("Payment successful!")).toHaveCount(0);
  await page.getByRole("link",{name:"View plan options"}).toBeVisible();
});
