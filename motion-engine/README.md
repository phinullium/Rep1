# motion-engine

The system from the first post, *How to Build an Automated Motion Design System that Generates $$$*, built and run.

```
campaign.json ─▶ validate ─▶ preview (storyboard + transition frames) ─▶ approve ─▶ render matrix ─▶ QC ─▶ deliver
 brief compiler   rejects bad    render.mjs --preview                       human      3 hooks × 3 formats × 2 CTAs   qc.mjs
                  input                                                                = 18 MP4s + posters + manifest
```

| Article part | Implementation |
|---|---|
| 04 Brief → structured data, validate before rendering | `campaigns/<project>/campaign.json` + `scripts/validate.mjs`. Checks: schema, missing assets, font files, text length per component, **numeric claims must be in `approvedClaims`**, timeline gaps, variant matrix, WCAG contrast |
| 05 `seek(t)` engine (Canvas + Playwright + FFmpeg) | `seek-demo/index.html` + `seek-demo/render-seek.mjs` (PNG frames streamed into FFmpeg; `--check` shows frame N is byte-identical however it was reached) |
| 06A Closed-form springs: `value(t) = initial + Σ(change × response(t − tᵢ))` | `src/lib/motion.ts` (`springStep`, `springTo`) |
| 06B Leading and trailing edges animated separately | `edgeSplit()`: tab indicator in `src/components/AppWindow.tsx` |
| 06C Container moves before text | "New report" button → card: the old label leaves, the container springs, new text appears once there is room |
| 06D Sound is part of the timeline | `src/lib/timeline.ts` (one event list drives visuals **and** SFX, snapped to beats); `scripts/make-audio.mjs` (original, license-free music + SFX); `scripts/analyze-beats.mjs` (tempo/beat/peak detection for a client track) |
| 07 Quality-control loop | `render.mjs --preview` (storyboard + before/at/after-transition frames with safe-area guides) → `qc.mjs` (contact sheet, transition sheet, phone-size sheet, duration/fps/pixel format/colour range, loudness, black and frozen frame detection, in-render overflow/safe-zone warnings) → `qc/review-report.md` with a human sign-off |
| 08 One timeline, many campaigns; layouts per format, not crops | `src/Root.tsx` (9:16, 1:1, 16:9) + `src/lib/layout.ts`; `manifest.json` records campaign/asset hashes, template version, git commit and render settings |
| 09 Claude skill | `/.claude/skills/motion-campaign/SKILL.md`, plus the official Remotion skills in `/.agents/skills` |
| 11 The prompt | Followed as written: inspect tools → architecture and schema → smallest working demo → storyboard and preview → batch render → inspect the actual output |

## Run
```bash
npm install
node scripts/validate.mjs campaigns/nova-launch            # ✓ 3 hooks × 3 formats × 2 CTAs = 18 exports
node scripts/make-audio.mjs campaigns/nova-launch          # original soundtrack + SFX + beats.json
node scripts/render.mjs campaigns/nova-launch --preview    # out/nova-launch/preview/storyboard-*.png
node scripts/render.mjs campaigns/nova-launch              # out/nova-launch/exports/*.mp4 + posters + manifest.json
node scripts/qc.mjs campaigns/nova-launch                  # out/nova-launch/qc/… + review-report.md
npx remotion studio                                        # live preview / tweak in the browser
node seek-demo/render-seek.mjs --check                     # article's minimal deterministic renderer
```
Filter a render: `--formats 9:16 --hooks A,B --ctas A`. The validator rejection demo is
`node scripts/validate.mjs campaigns/_fixtures/bad-claims.json`. It catches the article's own example, a made-up "240%" claim, among 12 problems.

## New client
1. Copy `campaigns/nova-launch` to `campaigns/<client>`. Replace `assets/logo.svg`, the fonts and the colours.
2. Write the hooks (problem / result / surprising feature), features and CTAs. Put every sentence that contains a number into `approvedClaims` once the client signs it off.
3. Set `product.ui.dataSource` to `client-approved` only when the numbers on the UI are real and approved.
4. Validate → preview → **get approval** → render → QC → deliver `exports/`, `manifest.json` and `review-report.md`.

## Results in this build (Nova demo, fictional product)
Measured on the final render (4 vCPU, no GPU, 897 s for all 18):
- **18 MP4 exports + 6 posters** (86.7 MB). All 18 pass `qc.mjs`: video and audio both 25.000 s, 30 fps,
  1080×1920 / 1080×1080 / 1920×1080, yuv420p, bt709 TV range, −14.1 LUFS, −1.4 dBTP true peak, no black or frozen
  frames, zero overflow or safe-zone warnings across every rendered frame.
- Transition sheets were also inspected by eye (the article's rule): no text overlaps text at any scene change, and no
  frame is empty.

The QC loop earned its place. Each of these was found in rendered output and fixed before the final render:
| Found by | Defect | Fix |
|---|---|---|
| storyboard review | Blank frames at every scene change | Scenes overlap by 0.25 s |
| storyboard review | Top-heavy 9:16 layout; accent phrase split across lines | Stack centred in the safe area; accent run kept on one line |
| `freezedetect` | 1.5 s static holds | Scene push-in, toggle and "Scheduled ✓" confirmation, live-bar update |
| `ffprobe` | Full-range `yuvj420p` / bt470bg colour | `colorSpace: 'bt709'` |
| `ebur128` | Master at −23 LUFS (weak in the feed) | Two-pass loudnorm to −14 LUFS |
| `ffprobe` | Audio 0.1 s longer than video after loudnorm | Trim to the exact video length |
| in-render safe-zone check | Text sliding past the safe edge | Narrower text box, shorter slide, ~10 px push-in budget |
| visual inspection | Outgoing and incoming headlines overlapping mid-crossfade | Text never crossfades with text; cards carry the cut |
| visual inspection | Hook B repeated the tagline word for word | New result-angle hook: "Stop guessing. Start knowing." |

Licensing: Remotion is free for individuals and companies with ≤3 employees; above that you need a Company License.
Check your rights to client logos, fonts and music.
