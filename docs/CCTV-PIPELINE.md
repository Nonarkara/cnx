# CNX CCTV Pipeline — how cameras get on the wall

> The municipality's cameras are a sunk cost until someone watches them.
> This document is the whole pipeline: what works today with zero help
> from anyone, and the exact steps that put a municipal camera on the
> dashboard. Written so a municipal technician with no streaming
> experience can follow it end to end.

## Camera sources (availability changes)

| Source | Cameras | How | Refresh |
|---|---|---|---|
| **Windy.com public webcams** | 9 registered (basin + Lamphun corridors); not a live-camera count | Keyless snapshot JPEG + day-player iframe. Registry: `src/lib/cnx/cctv-windy.ts` | The board probes every 2.5 min; capture updates can be much slower |
| **Longdo national index** (`camera.longdo.com/feed`) | Only cameras returned inside the operating area; no guaranteed count | Keyless JSON, HLS + snapshot per camera | 1 min poll |

At the 2026-10-18 14:57 UTC check, the public CCTV API reported one
reachable Windy camera out of nine. The other eight carried capture
stamps from September 26 or October 2. The haze API's one camera was
monochrome (`no-colour`, score null), so there were **zero usable scored
camera observations at that check**, despite a working relay. Its 208
historical ground pairs covered only 1–11 µg/m³; they do not validate haze
detection. These are dated observations, not promised coverage.

Coverage inside the old city itself is still zero — that gap is exactly
what the municipal onboarding below closes.

## Onboarding a municipal camera (technician runbook)

**You need:** the camera's RTSP URL (from its NVR/DVR web page — usually
`rtsp://user:pass@camera-ip:554/...`; check the recorder's manual), and
any small always-on computer on the municipal LAN (an old office PC
running Linux is fine).

**Steps (about 30 minutes, copy-paste):**

1. On that computer, download MediaMTX (one static binary, no install):
   `https://github.com/bluenviron/mediamtx/releases` — pick the
   `linux_amd64` build, unpack, run `./mediamtx`. It starts an RTSP
   server on port 8554 and an HLS server on port 8888 with zero config.
2. Push each camera into it with ffmpeg (also a static binary):
   `ffmpeg -rtsp_transport tcp -i "rtsp://user:pass@camera-ip:554/..." -c copy -f rtsp rtsp://127.0.0.1:8554/tha-phae`
   (one ffmpeg per camera; run each under `nohup ... &` or a systemd unit).
3. Expose port 8888 through the municipal firewall / reverse proxy with
   HTTPS (the dashboard requires HTTPS stream URLs). The playlist is then
   `https://<public-host>/tha-phae/index.m3u8` and the snapshot
   `https://<public-host>/tha-phae/snap.jpg` — open both in a browser to
   confirm they play outside the municipal LAN.
4. Send those two URLs (plus the camera's Thai name + GPS pin) to the
   dashboard operator, who adds one entry to
   `src/lib/cnx/municipal-cameras.ts` and redeploys. The camera appears
   on the wall and the map with zero code changes.

**Why this shape:** the dashboard never touches the municipal LAN — it
only reads plain HTTPS (HLS + JPEG), the two most firewall-friendly
formats in existence. No VPN, no open RTSP ports, no vendor lock-in.
MediaMTX + ffmpeg are both free, static binaries, no accounts, no keys.

## Honesty rules (load-bearing)

- A camera with no reachable stream is never shown green. It is either
  absent (municipal, not yet onboarded) or greyed with its real status.
- Snapshot tiles always show the image age ("ภาพ 2 นาทีที่แล้ว"), never
  a LIVE badge on a still.
- Every tile links its upstream (Windy / Longdo / municipality) so the
  operator always knows whose footage they are looking at.

— Owner: CNX dashboard team. Last verified: 2026-09-19.

## Camera haze vision

The off-Cloudflare relay runs `scripts/haze-vision.mjs` every ten minutes.
Downloads stop at 12 MiB, including streamed responses with an incorrect
Content-Length. Image decoding accepts at most 24 million input pixels.
It decodes snapshots as sRGB and scores the lower three quarters of the
frame with dark-channel and luminance-contrast statistics. These features
are normalized by mean luminance to cancel uniform, unclipped exposure
changes. The dark-channel difference is projected back to the baseline’s
median exposure to preserve the existing intensity threshold.

The baseline needs 12 usable daylight colour frames with verified scene
detail. Only historical summaries carrying a qualifying robust luminance
range can calibrate; legacy summaries without that feature must
recalibrate, because contrast alone cannot prove scene detail. History is
retained for 30 days, but dark, colourless, low-information and unqualified
legacy summaries are excluded from calibration and agreement. Low-information
frames have insufficient exposure-normalized contrast or robust
luminance range (p95 minus p05). The robust range prevents a small
changing timestamp on an otherwise uniform coloured placeholder from
supplying calibration samples. These are conservative engineering quality
gates, not trained haze thresholds. Opaque fog, a blocked lens and a
placeholder can all fail them: the verdict is `unusable`, score null,
never an assertion that the air is clear. SHA-256 of the resized pixels
prevents an identical image from adding samples even if the CDN updates
`Last-Modified`. A repeated image retains its first known observation time.
Capture time comes from the snapshot’s `Last-Modified`, falling back to the
roster’s `capturedAt`; download time is never presented as capture time.
Unknown timestamps, frames over six hours old, and timestamps over five
minutes in the future are rejected.

Ground comparisons use a non-suspect DustBoy reading within 15 km and
90 minutes of the image. An hourly sensor observation counts once across
all paired frames and cameras; their visual scores are averaged for the
comparison. Old-method scores are excluded from agreement; only qualified
raw metrics remain eligible for calibration. Legacy fingerprint/time
records still prevent old frozen images from receiving a new first-capture
time, even when their metrics cannot calibrate. Displayed baseline sample
counts include only qualified frames. Agreement rebuilds
from new observations after a scoring-version change. Offline cameras’
history is also pruned to the 30-day window.

Version 3 starts a new agreement window after the scene-detail eligibility
change. A varied high-reading window additionally needs at least three
independent station IDs at or above 50 µg/m³ within three hours. Three
hours from the same sensor or three sensors on separate days are not a
regional episode. The payload reports the maximum qualifying station
count as `eventStations`; even corroborated high readings establish no
detection-accuracy result. The 20 µg/m³ spread floor is an engineering
diversity requirement, not a health guideline.

The authenticated haze ingest POST rejects redirects, so its custom relay
secret header cannot be forwarded to a redirected destination. The camera
roster and snapshot hosts remain upstream trust boundaries: the relay reads
public source URLs, and Last-Modified is a source-reported time rather than
an independently authenticated camera clock. Exact pixel hashes cannot
prove liveness when scene overlays or pixels change. The board does not
run validated flood-depth, accident, traffic-queue or person detectors.

A low visual-haze score does not mean measured clean air. This is a
relative image heuristic, not a trained detector, a PM2.5 measurement, or
an established accuracy figure. Rain, fog, lens dirt, camera movement,
clipped highlights, and changing shadows can still affect it. Correlation
with ground readings is an association, not labeled-image validation.

Reference: [He, Sun and Tang, CVPR 2009](https://people.csail.mit.edu/kaiming/publications/cvpr09.pdf).
The exposure normalization and temporal sampling are local engineering
changes; they are not claims of reproducing the paper’s dehazing model.

Verify changes with `npm test`, `npm run type-check`, `npm run lint`, and
`npm run test:relay`. Restarting the live launchd relay is a separate
operational step: an existing process keeps its imported scoring code.
