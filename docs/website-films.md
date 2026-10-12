# Website films and app screens (Release E, 12 October 2026)

Final version 4 is approved by the owner without changes, with publication authorised where appropriate (ChatGPT
08:14; HQ decision D-81). Placement follows ChatGPT 02:52: the 1 min 50 s flagship on `/pocus-logbook/` directly
below the opening ("Watch how it works" in the opening starts it), then four app screens (log, request review,
sign-off, track and export); the 30 s free-logbook film as the homepage teaser in the free-logbook section, with
"See how the app works" linking to `/pocus-logbook/#watch`. The homepage opening is unchanged.

## Files (`src/media/`, copied to `dist/media/` by the build)

| File | Bytes | SHA-256 | Source |
|---|---|---|---|
| `wavelength-app-film-v4.mp4` | 15,124,074 | `fc28df02…4b22` | `final-v4\wavelength-flagship-film-v4-1080p.mp4` (`f408c4a6…d264`), the clean master |
| `wavelength-free-logbook-film-v4.mp4` | 3,642,518 | `be0e0f9e…40bf` | `final-v4\wavelength-free-logbook-short-v4-1080p.mp4` (`c10be1d8…a826`), the clean master |
| `wavelength-app-film-v4.en.vtt` | 2,457 | `0ecccf16…9c3d` | `final-v4\captions\wavelength-flagship-film-v4.en.vtt`, unchanged |
| `wavelength-free-logbook-film-v4.en.vtt` | 552 | `c897999d…12fe` | `final-v4\captions\wavelength-free-logbook-short-v4.en.vtt`, unchanged |
| `wavelength-app-film-v4-poster.jpg` | 89,055 | `96c5cc3a…4c66` | Remotion still, `V4Flagship` frame 1480, scale 0.75 (the verified-supervisor screen) |
| `wavelength-free-logbook-film-v4-poster.jpg` | 62,341 | `27b1f985…fc32` | `V4Short` frame 220, scale 0.75 (log a scan) |
| `wavelength-app-step-1-log.jpg` | 35,465 | `dd0fec35…cfa6` | `V4Flagship` frame 1200, scale 0.5 (960 × 540) |
| `wavelength-app-step-2-request.jpg` | 31,239 | `8ebe2a41…dcf0` | frame 1780 |
| `wavelength-app-step-3-signed-off.jpg` | 38,664 | `15a30c03…3a88` | frame 2350 |
| `wavelength-app-step-4-progress.jpg` | 48,493 | `edf0565c…dec5` | frame 2620 |

Full checksums: `sha256sum src/media/*` (recorded in the HQ release pack). Every person, hospital, email address and
image in these files is fictional (Dr Maya Okafor, Dr James Whitfield, `example.org`, images marked "ILLUSTRATION,
NOT A PATIENT").

Stills were rendered in the film worktree (`wavelength-film-audition/video`):
`npx remotion still src/index.jsx <Composition> out.jpg --frame=N --image-format=jpeg --jpeg-quality=82 --scale=S`.

## Web copies of the films

The masters are about 29 to 30 MB and stay unchanged. The web copies are separate encodes with Remotion's ffmpeg:

`-c:v libx264 -preset slow -crf 23 -profile:v high -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart`

Quality against the masters, every frame (PSNR computed in Node from rgb24 frames, since that ffmpeg has no psnr
filter): flagship minimum 45.29 dB, mean 49.1 dB; short minimum 46.09 dB, mean 49.46 dB. No visible change.
`+faststart` puts the index first, so `preload="metadata"` needs only the start of the file.

## Delivery: why `/media/*` goes through the Worker

- Cloudflare Workers static assets allow 25 MiB per file (both films fit) but **ignore Range**: a production request
  with `Range: bytes=0-1` on 12 October returned 200 with the whole file. Safari on iPhone will not play an MP4
  without 206 range responses.
- So `wrangler.jsonc` lists `/media/*` in `run_worker_first`, and `worker/media.js` serves it: only names matching
  `^/media/[a-z0-9-]+(.en)?.(mp4|vtt|jpg)$`, GET and HEAD only. The first request stores the whole file in
  Cloudflare's cache (`caches.default`); the cache then answers range requests itself with 206 (Workers Cache API
  behaviour for a stored 200 with Content-Length). Where there is no cache (local tests), the one range is sliced.
- No third-party player, embed or tracking. Self-hosted, versioned by name (`-v4`), cached for a week.
- **Check after deployment:** `curl -s -o NUL -D - -H "Range: bytes=0-1" https://thewavelength.co.uk/media/wavelength-app-film-v4.mp4`
  answers `206` with `Content-Range: bytes 0-1/15124074` (the first request may be the one that fills the cache).

## The player

Native `<video>` with `controls playsinline preload="metadata"`, a poster from the film itself, width and height for
a stable layout, and a `<track kind="captions" srclang="en" default>` (captions on, switchable in the player). Never
autoplays; "Watch how it works" starts the flagship from the visitor's own click or key press (sound allowed),
scrolling smoothly or, with reduced motion, jumping. Under each player: a short note and "Read the film as text" (the
captions as paragraphs). If a film cannot load, its caption shows a download link.

## Tests

- `test/media.test.mjs`: ranges, the Worker route, the cache path, refused names and methods, the pages' markup,
  the text versions, and every linked file present and under 25 MiB.
- `tools/e2e-media.mjs` (Microsoft Edge, for H.264): phone 390, tablet 768 and desktop 1440 px; no overflow, metadata,
  no autoplay, captions showing, 16:9 player, poster, at most one film request before play, 206 for a range, the
  four screens; "Watch how it works" by mouse, keyboard and reduced motion; the text version by keyboard; the
  homepage teaser and its link; a film that fails shows the download link; no console errors.
