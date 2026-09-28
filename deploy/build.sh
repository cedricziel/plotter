#!/bin/sh
# Build Plotter inside a node container and publish dist/ to $OUT.
# Env: REPO (git URL), REF (branch/tag), OUT (target dir, served by nginx).
set -eu
REPO="${REPO:-https://github.com/cedricziel/plotter.git}"
REF="${REF:-main}"
OUT="${OUT:-/out/www}"
apk add --no-cache git >/dev/null
rm -rf /tmp/src
git clone --depth 1 --branch "$REF" "$REPO" /tmp/src
cd /tmp/src
npm ci --no-audit --no-fund
npm test
npm run build
mkdir -p "$OUT"
# swap in atomically-ish: copy to staging, then replace
rm -rf "$OUT.new" && cp -r dist "$OUT.new"
cp deploy/nginx.conf "$OUT.new/.nginx.conf"
rm -rf "$OUT.old" && { [ -d "$OUT" ] && mv "$OUT" "$OUT.old" || true; } && mv "$OUT.new" "$OUT" && rm -rf "$OUT.old"
echo "built $(git rev-parse --short HEAD) into $OUT"
