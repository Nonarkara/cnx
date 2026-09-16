#!/bin/bash
# Generate Chiang Mai Old City Minecraft world onto the Data drive.
# Sister of chula-control-tower/scripts/run-arnis-pathumwan.sh.
#
# Invoke manually or via launchd label org.nonarkara.arnis-chiangmai.
#
# Bbox is the Old City moat (the 1.5 km × 1.5 km walled square that
# defines historical Chiang Mai) + a touch of the Ping river bank so
# the moat connects to water. The scale matches the BKKx-Pathumwan
# run, so the .world file can be loaded side-by-side with the
# Pathumwan world without re-scaling.
set -euo pipefail

ARNIS="${ARNIS_BIN:-/Users/axiom/.local/bin/arnis}"
OUT="${ARNIS_OUT:-/Volumes/Data/Projects/BKKx-worlds/chiangmai-old-city-java}"
LOGDIR=/Volumes/Data/_scratch/arnis-logs

if [ ! -x "$ARNIS" ]; then
  echo "arnis binary missing: $ARNIS" >&2
  exit 127
fi
if [ ! -d /Volumes/Data ]; then
  echo "/Volumes/Data not mounted — plug in the Data drive" >&2
  exit 75
fi

mkdir -p "$OUT" "$LOGDIR"
# Mirror launchd stdio onto Data as well
exec > >(tee -a "$LOGDIR/chiangmai-old-city.out.log") 2> >(tee -a "$LOGDIR/chiangmai-old-city.err.log" >&2)

echo "$(date -Iseconds) starting arnis → $OUT"
# nice 15: world generation is a batch job — it must yield to the live
# dashboard services. At nice 0 it drove load past 50 and stretched the
# API boot beyond the watchdog's patience, causing a SIGTERM-mid-boot loop.
exec /usr/bin/caffeinate -is /usr/bin/nice -n 15 "$ARNIS" \
  --bbox "18.7820,98.9750,18.8000,99.0010" \
  --output-dir "$OUT" \
  --spawn-lat 18.7903 --spawn-lng 98.9870 \
  --terrain --fillground --overture true \
  --map-preview