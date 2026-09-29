#!/bin/sh
# One-shot job: fetch official Dutch fairway data (bridges, locks, berths) from Vaarweginformatie.nl
# (Rijkswaterstaat) and publish it as fis-<generation>.json by adding it to current.json.
# Needs the waterway data to be published first. Does nothing while the published generation is
# still the current one, unless FORCE=1. The API server hot-swaps to the new data.
# Env: OUT (default /out/data), FORCE, TIMEOUT_MIN (20), OWNER (568:568).
set -eu
OUT="${OUT:-/out/data}"
OWNER="${OWNER:-568:568}"
mkdir -p "$OUT"

set -- --out "$OUT" --chown "$OWNER" --timeout-min "${TIMEOUT_MIN:-20}"
if [ "${FORCE:-0}" = "1" ]; then
  set -- "$@" --force
fi
exec node /app/fis.mjs "$@"
