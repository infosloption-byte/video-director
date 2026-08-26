import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE", msg.text());
});
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Play the sample cut" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/workspace/screenshots/studio-sample.png", fullPage: true });
console.log("studio title", await page.locator("h1").innerText());

await page.getByRole("button", { name: "Play" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "/workspace/screenshots/studio-playing.png" });

await page.getByRole("button", { name: "Preview & publish pack" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/studio-preview.png", fullPage: true });

await page.getByRole("button", { name: "Signals" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Direct this Reel" }).nth(1).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/workspace/screenshots/studio-directing.png" });
console.log("directing text", (await page.locator("body").innerText()).slice(0, 500));

await page.waitForTimeout(12000);
await page.screenshot({ path: "/workspace/screenshots/studio-directed.png", fullPage: true });
console.log("after wait h1", await page.locator("h1").innerText());
console.log("after wait prefix", (await page.locator("body").innerText()).slice(0, 500));

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto("http://127.0.0.1:8080/studio/sample-quantum-sensors", { waitUntil: "networkidle" });
await mobile.waitForTimeout(800);
await mobile.screenshot({ path: "/workspace/screenshots/studio-mobile.png", fullPage: true });

await browser.close();
console.log("done");
