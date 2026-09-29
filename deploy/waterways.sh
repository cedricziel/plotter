#!/bin/sh
# One-shot job: build the waterway routing graph and place index from OpenStreetMap.
# Downloads the Netherlands extract (~1.6 GB), keeps only the objects the
# router needs, builds waterways-<date>.json + places-<date>.json and publishes
# them by writing current.json last. The API server hot-swaps to the new data.
# Skipped while current.json is younger than MAX_AGE_DAYS, unless FORCE=1.
# Env: OUT (default /out/data), OSM_PBF_URL, MAX_AGE_DAYS (30), FORCE, WORK (scratch dir), OWNER (568:568).
set -eu
OUT="${OUT:-/out/data}"
URL="${OSM_PBF_URL:-https://download.openstreetmap.fr/extracts/europe/netherlands-latest.osm.pbf}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-30}"
OWNER="${OWNER:-568:568}"
WORK="${WORK:-$OUT/.work}"
mkdir -p "$OUT"

if [ "${FORCE:-0}" != "1" ] && [ -s "$OUT/current.json" ] && [ -z "$(find "$OUT/current.json" -mtime +"$MAX_AGE_DAYS" 2>/dev/null)" ]; then
  echo "waterway data is younger than $MAX_AGE_DAYS days: $(cat "$OUT/current.json")"
  exit 0
fi

rm -rf "$WORK"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "downloading $URL"
curl -fL --retry 3 --retry-delay 10 -o "$WORK/nl.osm.pbf" "$URL"

echo "filtering"
osmium tags-filter "$WORK/nl.osm.pbf" \
  w/waterway=river,canal,fairway w/bridge w/seamark:type=bridge n/seamark:type=bridge \
  n/waterway=lock_gate w/lock=yes nw/leisure=marina nw/harbour nw/seamark:type=harbour \
  nw/mooring n/place=city,town,village \
  -o "$WORK/filtered.osm.pbf" --overwrite
rm -f "$WORK/nl.osm.pbf"

echo "building"
osmium add-locations-to-ways --ignore-missing-nodes -f opl -o "$WORK/filtered.opl" --overwrite "$WORK/filtered.osm.pbf"
rm -f "$WORK/filtered.osm.pbf"
node --max-old-space-size="${NODE_HEAP_MB:-3072}" /app/waterways.mjs --out "$OUT" --source "$URL" --chown "$OWNER" --input "$WORK/filtered.opl"
echo "published $(cat "$OUT/current.json")"
