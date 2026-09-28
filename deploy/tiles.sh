#!/bin/sh
# Create the Netherlands PMTiles extract once (skipped if it already exists).
# Env: OUT (dir), MAXZOOM (default 14), BBOX, PMTILES_VERSION.
set -eu
OUT="${OUT:-/out/tiles}"
MAXZOOM="${MAXZOOM:-14}"
BBOX="${BBOX:-3.2,50.7,7.25,53.6}"
V="${PMTILES_VERSION:-1.30.1}"
FILE="$OUT/netherlands.pmtiles"
mkdir -p "$OUT"
if [ -s "$FILE" ] && [ "${FORCE:-0}" != "1" ]; then echo "tiles present: $FILE"; exit 0; fi
apk add --no-cache curl jq >/dev/null
ARCH=$(uname -m); [ "$ARCH" = "aarch64" ] && ARCH=arm64
curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v$V/go-pmtiles_${V}_Linux_${ARCH}.tar.gz" | tar xz -C /tmp pmtiles
BUILD=$(curl -fsSL https://build-metadata.protomaps.dev/builds.json | jq -r '.[-1].key')
echo "extracting $BBOX z0-$MAXZOOM from $BUILD"
/tmp/pmtiles extract "https://build.protomaps.com/$BUILD" "$FILE.part" --bbox="$BBOX" --maxzoom="$MAXZOOM" --download-threads=8
mv "$FILE.part" "$FILE"
/tmp/pmtiles show "$FILE" | head -5
