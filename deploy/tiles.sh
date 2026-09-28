#!/bin/sh
# One-shot job: extract the Netherlands PMTiles chart from the Protomaps build.
# Each extract gets its own file name (netherlands-<build>.pmtiles) and
# tiles/current.json points the app at it, so clients never mix cached ranges
# of two builds. Skipped when a chart is already published, unless FORCE=1.
# Env: OUT (dir, default /out/tiles), MAXZOOM (14), BBOX, PMTILES_VERSION, FORCE.
set -eu
OUT="${OUT:-/out/tiles}"
MAXZOOM="${MAXZOOM:-14}"
BBOX="${BBOX:-3.2,50.7,7.25,53.6}"
V="${PMTILES_VERSION:-1.30.1}"
mkdir -p "$OUT"

cur=""
[ -s "$OUT/current.json" ] && cur=$(jq -r '.url // empty' "$OUT/current.json" | sed 's|.*/||')
if [ "${FORCE:-0}" != "1" ]; then
  if [ -n "$cur" ] && [ -s "$OUT/$cur" ]; then echo "chart present: $OUT/$cur"; exit 0; fi
  if [ -s "$OUT/netherlands.pmtiles" ]; then echo "legacy chart present: $OUT/netherlands.pmtiles (FORCE=1 to replace)"; exit 0; fi
fi

ARCH=$(uname -m); [ "$ARCH" = "aarch64" ] && ARCH=arm64
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v$V/go-pmtiles_${V}_Linux_${ARCH}.tar.gz" | tar xz -C "$TMP" pmtiles
KEY=$(curl -fsSL https://build-metadata.protomaps.dev/builds.json | jq -r '.[-1].key')
BUILD=${KEY%.pmtiles}
NAME="netherlands-$BUILD.pmtiles"
echo "extracting $BBOX z0-$MAXZOOM from $KEY"
"$TMP/pmtiles" extract "https://build.protomaps.com/$KEY" "$OUT/$NAME.part" --bbox="$BBOX" --maxzoom="$MAXZOOM" --download-threads=8
mv "$OUT/$NAME.part" "$OUT/$NAME"
"$TMP/pmtiles" show "$OUT/$NAME" | head -5

# Publish: the manifest switches atomically once the new file is complete.
printf '{"url":"./tiles/%s"}\n' "$NAME" > "$OUT/current.json.new"
chmod 644 "$OUT/$NAME" "$OUT/current.json.new"
chown 568:568 "$OUT/$NAME" "$OUT/current.json.new" 2>/dev/null || true
mv "$OUT/current.json.new" "$OUT/current.json"
for f in "$OUT"/netherlands*.pmtiles; do
  [ "$f" = "$OUT/$NAME" ] || rm -f "$f"
done
echo "published $NAME"
