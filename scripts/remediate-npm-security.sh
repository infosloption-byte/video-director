#!/usr/bin/env bash
set -euo pipefail

# Run only on a disposable feature branch, with a clean worktree.
# Never uses npm audit fix --force and never updates production containers.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "A clean git worktree is required. Commit or stash local changes first." >&2
  exit 1
fi
if [[ "$(git branch --show-current)" == "main" ]]; then
  echo "Run remediation on a dedicated branch, not main." >&2
  exit 1
fi

for app in frontend server; do
  echo "=== Baseline npm audit: $app ==="
  (
    cd "$ROOT/$app"
    npm ci --ignore-scripts --no-fund --no-audit
    npm audit --json > "$ROOT/${app}-audit-before.json" || true
  )
done

# Vite 8.2.2 has published advisories; explicitly target fixed 8.3.5.
# Let npm regenerate the integrity-checked lockfile and dependency tree.
(
  cd "$ROOT/frontend"
  npm install --save-dev --save-exact vite@8.3.5 --ignore-scripts --no-fund --no-audit
  npm audit fix --ignore-scripts --no-fund --no-audit
)
(
  cd "$ROOT/server"
  npm audit fix --ignore-scripts --no-fund --no-audit
)

# Preserve machine-readable residual advisories for manual triage.
for app in frontend server; do
  (
    cd "$ROOT/$app"
    npm audit --json > "$ROOT/${app}-audit-after.json" || true
  )
done

echo "=== Verification ==="
(
  cd "$ROOT/frontend"
  npm ci --no-fund --no-audit
  npm run lint
  npm run test:unit
  npm run build
)
(
  cd "$ROOT/server"
  npm ci --no-fund --no-audit
  npx prisma generate
  npm test
)
echo "=== Remaining production and development audit severity ==="
for app in frontend server; do
  (cd "$ROOT/$app" && npm audit --audit-level=high) || true
done

echo "Run frontend Playwright tests separately before merging."
echo "Review tracked package manifests and lockfiles with git diff."
