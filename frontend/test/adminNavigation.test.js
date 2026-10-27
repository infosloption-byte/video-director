import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync("src/App.jsx", "utf8");
const workspace = readFileSync("src/components/PlatformShell.jsx", "utf8");
const admin = readFileSync("src/components/AdminShell.jsx", "utf8");

test("admin has a dedicated /admin shell, with an old URL redirect", () => {
  assert.match(app, /path="\/admin" element=\{<PlatformAdminRoute>/);
  assert.match(app, /path="\/platform-admin" element=\{<Navigate to="\/admin"/);
  assert.match(app, /<AdminShell>\{children\}<\/AdminShell>/);
  assert.match(app, /path="\/admin\/plans"/);
  assert.match(app, /path="\/admin\/master-data"/);
  assert.match(app, /path="\/admin\/settings"/);
});
test("workspace remains available and admin entry is in account menu", () => {
  assert.match(workspace, /to="\/admin" className="platform-account-menu__item"/);
  assert.doesNotMatch(workspace, /path: "\/platform-admin"/);
  assert.match(admin, /Return to Workspace/);
  assert.match(admin, /to="\/signals"/);
});
