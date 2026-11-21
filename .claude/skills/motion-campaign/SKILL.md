---
name: motion-campaign
description: Create reusable product motion campaigns (launch videos with hook × format × CTA variants) using the motion-engine in this repo. Use when asked to make a product launch video, motion graphics campaign, animated SaaS promo, or "18 exports from one brief".
---

# Motion Campaign

Production workflow for `motion-engine/` (Remotion templates + validator + renderer + QC).
Run every command from `motion-engine/`.

## Inputs (collect before building anything)
- Product URL and a one-paragraph description
- Approved screenshots and logo (SVG preferred), brand colours (hex), fonts (woff2/ttf files)
- Audience and offer
- Video duration (template default 25 s: hook 3 / product 6 / features 9 / CTA 7)
- Output formats (9:16, 1:1, 16:9)
- Approved claims (exact wording, signed off by the client) and CTAs
- Music: client-licensed track, or generate an original one with `npm run audio`

## Workflow
1. **Collect and validate assets.** Create `campaigns/<project>/` with `assets/` and `audio/`.
2. **Generate campaign.json** (copy `campaigns/nova-launch/campaign.json` as the schema reference).
   - Hooks: 3 angles — problem / result / surprising feature. Mark the accent phrase with `*…*`.
   - Put every sentence that contains a number into `approvedClaims` verbatim, or remove it.
   - `product.ui.dataSource` is `demo-data` until the client approves the numbers shown.
3. **Validate:** `node scripts/validate.mjs campaigns/<project>` — fix every FAIL. Never bypass it.
4. **Audio:** licensed track → `node scripts/analyze-beats.mjs track.mp3 > campaigns/<project>/audio/beats.json`;
   no track → `node scripts/make-audio.mjs campaigns/<project>` (original, license-free).
5. **Storyboard + timing preview:** `node scripts/render.mjs campaigns/<project> --preview`
   - Open `out/<project>/preview/storyboard-*.png` and LOOK at them (Read the PNGs).
   - Check: no empty frames at transitions, no overlapping text, text inside the dashed safe area,
     brand colours/logo correct, readable at phone size.
   - Show the storyboards to the user and **request approval before full renders**.
6. **Build or reuse components** only if the brief needs a scene the library lacks
   (`src/scenes/*`, `src/components/*`). Keep animation a pure function of time: use
   `src/lib/motion.ts` (`springStep`, `springTo`, `edgeSplit`, `window01`) — never CSS
   transitions, timers, or `Math.random` (use `hash01`).
7. **Render variants:** `node scripts/render.mjs campaigns/<project>` (or filter:
   `--formats 9:16 --hooks A,B --ctas A`). Output: `out/<project>/exports/*.mp4`, posters, `manifest.json`.
8. **QC:** `node scripts/qc.mjs campaigns/<project>` — inspect `out/<project>/qc/*/contact.png`,
   `transitions.png`, `phone.png`; fill in `qc/review-report.md` (issues found, fixes applied,
   remaining concerns).
9. **Package:** deliver `exports/`, posters, `manifest.json`, `review-report.md`, and the source `campaign.json`.

## Rules
- Never invent product claims. Numbers on screen must come from `approvedClaims` or client-approved UI data.
- Use approved visual assets only; no fake product screenshots presented as real.
- Prefer deterministic animation (frame-driven, seekable).
- Keep all outputs editable: change data and re-render, don't hand-edit videos.
- Never skip the final visual review, and never say a video "looks great" without having
  inspected rendered frames. A human approves before delivery.
- Don't let the model freely redesign established brand components per campaign: configure
  the reviewed templates; add new templates deliberately and review them once.
- Licensing: Remotion is free for individuals and companies with ≤3 employees; larger teams
  need a Company License (see `remotion-license` skill). Verify rights to logos, fonts, music.
