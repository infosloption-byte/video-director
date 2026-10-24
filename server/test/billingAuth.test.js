import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { templateEmail, publicUrl } from "../src/services/emailService.js";
import { PLANS, effectivePlan, currentMonth, verifyPaddleSignature, publicPlans } from "../src/services/billingService.js";

test("public prices and monthly quota match the provisional catalog",()=>{
  assert.deepEqual(publicPlans().map(p=>p.rendersPerMonth),[3,30,150]);
  assert.equal(PLANS.studio.maxSeconds,60);
  assert.equal(effectivePlan({status:"active",plan:"studio"}).id,"studio");
  assert.equal(effectivePlan({status:"past_due",plan:"studio"}).id,"free");
  assert.equal(effectivePlan({status:"canceled",plan:"creator"}).id,"free");
  assert.equal(currentMonth(new Date("2026-10-31T23:59:59Z")),"2026-10");
  assert.equal(currentMonth(new Date("2026-11-01T00:00:00Z")),"2026-11");
});
test("Paddle webhook signature accepts only authentic and fresh raw payloads",()=>{
  const body=Buffer.from('{"event_type":"subscription.created","data":{"id":"sub_test"}}');
  const secret="not-a-real-secret";
  const now=Date.UTC(2026,9,24,12,0,0);
  const ts=String(now/1000);
  const h1=crypto.createHmac("sha256",secret).update(ts+":").update(body).digest("hex");
  assert.equal(verifyPaddleSignature(`ts=${ts};h1=${h1}`,body,secret,now),true);
  assert.equal(verifyPaddleSignature(`ts=${ts};h1=${h1}`,Buffer.from("{}"),secret,now),false);
  assert.equal(verifyPaddleSignature(`ts=${ts};h1=${h1}`,body,"different-secret",now),false);
  assert.equal(verifyPaddleSignature(`ts=${ts};h1=${h1}`,body,secret,now+400000),false);
  assert.equal(verifyPaddleSignature("bad",body,secret,now),false);
});
test("email templates encode untrusted user text and URLs",()=>{
  const result=templateEmail({title:"Hi <script>",lead:"One & two",detail:"Plain",link:'https://voxora.example/?v="bad"',action:"Go"});
  assert.match(result.html,/&lt;script&gt;/);
  assert.match(result.html,/One &amp; two/);
  assert.ok(!result.html.includes("<script>"));
  assert.match(result.html,/&quot;bad&quot;/);
  assert.match(result.text,/Hi <script>/);
  assert.equal(typeof publicUrl("/verify-email"),"string");
});
