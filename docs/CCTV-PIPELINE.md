# CNX CCTV Pipeline — how cameras get on the wall

> The municipality's cameras are a sunk cost until someone watches them.
> This document is the whole pipeline: what works today with zero help
> from anyone, and the exact steps that put a municipal camera on the
> dashboard. Written so a municipal technician with no streaming
> experience can follow it end to end.

## What is live today (no municipal help needed)

| Source | Cameras | How | Refresh |
|---|---|---|---|
| **Windy.com public webcams** | 9 (basin + Lamphun corridors) | Keyless snapshot JPEG + day-player iframe. Registry: `src/lib/cnx/cctv-windy.ts` | Snapshots ~2.5 min |
| **Longdo national index** (`camera.longdo.com/feed`) | 1 DOH highway cam in range (+4 more DOH cams shown greyed as out-of-area) | Keyless JSON, HLS + snapshot per camera | 1 min poll |

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

The baseline needs 12 usable daylight colour frames. It retains the raw
image statistics from the preceding 30 days, including existing history,
and excludes dark and colourless frames. SHA-256 of the resized pixels
prevents an identical image from adding samples even if the CDN updates
`Last-Modified`. A repeated image retains its first known observation time.
Capture time comes from the snapshot’s `Last-Modified`, falling back to the
roster’s `capturedAt`; download time is never presented as capture time.
Unknown timestamps, frames over six hours old, and timestamps over five
minutes in the future are rejected.

Ground comparisons use a non-suspect DustBoy reading within 15 km and
90 minutes of the image. An hourly sensor observation counts once across
all paired frames and cameras; their visual scores are averaged for the
comparison. Old-method scores are excluded from agreement while their
usable raw metrics remain available for calibration. Agreement rebuilds
from new observations after a scoring-version change. Offline cameras’
history is also pruned to the 30-day window.

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
