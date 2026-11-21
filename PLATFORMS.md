# Platform playbook: specs, money rules, what goes viral

Researched 2026-11-21. Rows marked **verify** come from third-party round-ups (sources at the bottom), not
official help pages. Re-check them in each app before you plan income around them; these rules change often.

## 1. Export specs (what `clipstudio` produces)

| Platform | Frame | Upload limit | Clip length we target | Safe area (top / bottom / right) | Loudness |
|---|---|---|---|---|---|
| TikTok | 1080×1920, ≤60 fps | 10 min in-app for most accounts, longer via web (**verify**) | **61–90 s**, so it qualifies for Creator Rewards | 10% / 24% / 15% | −14 LUFS |
| Instagram Reels | 1080×1920 | Reels ≤3 min are recommended to non-followers (Jan 2025 change; **verify**) | 15–60 s | 10% / 22% / 13% | −14 LUFS |
| YouTube Shorts | 1080×1920 | **3 min** (uploads since 15 Oct 2024) | 20–58 s | 10% / 22% / 14% | −14 LUFS |
| X | 1080×1920 | 2:20 for non-Premium (**verify**) | 15–45 s | 6% / 12% / 5% | −14 LUFS |
| YouTube (long) | 1920×1080 | n/a | compilations, 30–90 s moments | 6% / 12% / 5% | −14 LUFS |

Safe areas are design margins that keep text clear of the app's buttons and captions, not official specs.
−14 LUFS is the common reference platforms normalise toward; quieter clips sound weak in the feed.

## 2. How each platform pays, and what that means for the cut

| Platform | Programme (2026) | Thresholds | Consequence built into this repo |
|---|---|---|---|
| **TikTok** | Creator Rewards Program | 10k followers, 100k views in 30 days, 18+, eligible country; **only original videos longer than 1 minute earn** (consistent across sources; **verify** in-app) | TikTok exports are auto-extended to **≥61 s** (cold open + clip). A viral 30 s TikTok earns nothing from this programme. |
| **YouTube Shorts** | YouTube Partner Program (Shorts ad-revenue share) | 1,000 subscribers + **10M Shorts views in 90 days** (or 4,000 watch hours in 12 months). One Sept 2026 source reports higher entry thresholds from **1 Feb 2027** (8,000 hours / 20M Shorts views): unconfirmed, **verify** | Shorts stay tight (20–58 s) and end on a line that loops back. Views count, so loops matter. |
| **Facebook** | Content Monetization (Reels and video) | Sources disagree: open eligibility vs. 10k followers / 100k views vs. invite-only (**verify** in Professional Dashboard) | Post the Reels export to Facebook as well; it's free extra distribution. |
| **Instagram** | No universal Reels ad-share; bonuses and offers vary by region and invitation (**verify**) | n/a | Use Reels for reach and followers; monetise through brand deals and the motion-design service. |
| **X** | Creator payouts reportedly changed from "Creator Revenue Sharing" (unconfirmed, **verify**) | Premium subscription required | Burned-in captions (X autoplays muted). |

**Where the money actually comes from.** Platform payouts per view are small. The bigger levers, in order:
1. **Sell finished work.** The article's offer is a launch motion package: one product, 3 hooks × 3 formats × 2 CTAs = 18 exports, built with `motion-engine`. Its "$750" is the article's own illustrative number, not a market rate.
2. **Clipping deals.** Streamers and brands pay clippers per 1,000 views, or a retainer. `clipstudio` produces such clips at volume. Use footage you have permission for.
3. **Platform programmes** (table above): stack them by posting each clip to every platform in its native format.

The second post's "$18K+" is the author's claim; nothing in the post documents it.

## 3. Viral mechanics this repo implements, and why

| Mechanic | Where | Why |
|---|---|---|
| **Cold open:** the 3 s peak plays first, then the setup | `clipstudio render --cold-open auto` (default when the peak is >4 s in) | Viewers decide in the first 1–2 s. Showing the payoff first buys time for the setup. |
| **Start on speech, end on the resolution** | `clipstudio analyze` | No dead air before the hook; a tight ending loops back cleanly. |
| **Punch-in zoom** on the reaction | `--punch-in 0.12` | A visual beat that marks the moment, like a manual editor's zoom cut. |
| **1–3 word captions, spoken word highlighted** | `captions.py` (pysubs2 + libass) | Most feed viewing starts muted. Word-by-word captions read at a glance. |
| **Hook title bar** for the whole clip | `--title auto` (Claude rewrites it via the skill) | States the curiosity gap while the setup plays. |
| **No static frames** | `motion-engine` 2.5% push-in plus micro-interactions; QC `freezedetect` | A still frame reads as "nothing happening" and invites a swipe. |
| **No empty frames at transitions** | `motion-engine` scenes overlap by 0.25 s; QC transition sheets | Blank flashes between scenes are swipe triggers. |
| **Platform-native framing** (no letterbox crops) | 9:16 / 1:1 / 16:9 layouts computed per format | Re-cropped landscape video looks like a repost and performs worse. |
| **Safe-area discipline** | Safe areas in both tools; QC warnings | Text under the like button or caption block can't be read. |
| **Loudness −14 LUFS** | `loudnorm` in the final encode; QC check | Quiet clips sound weak next to everything else in the feed. |

Posting habits (not code): post each clip natively to every platform, without another app's watermark. Reply to early
comments. Test the 3 motion-engine hooks against each other and keep the winner's angle.

## 4. Rights: GTA VI and other game footage (read before monetising)

- GTA VI released **19 Nov 2026** (Take-Two filings). As of this research, Rockstar has **no GTA VI-specific creator policy**; its general Video Policy (Jan 2025 version) applies. Reports say spoiler and story-cutscene uploads can be removed, pre-release or leaked footage is restricted, and the policy limits commercial use. I could not open the policy page from this environment, so **read it yourself** at `rockstargames.com/videopolicy` before monetising GTA clips.
- **Clip your own gameplay** (OBS) or footage you have written permission to use (streamer clipping deals). Re-uploading other people's VODs or Rockstar trailers risks Content ID claims, strikes and demonetisation.
- In-game radio and licensed music is the most common Content ID trigger: render with `--music remove` (Demucs).
- Avoid story spoilers in titles and thumbnails during launch weeks.

## Sources
- Specs: [reap.video](https://reap.video/blog/best-video-length-youtube-shorts-reels-tiktok), [viberoll](https://viberoll.questera.ai/learn/short-form-video-specs/), [pod2reels](https://www.pod2reels.com/blog/reel-tiktok-shorts-length-limits), [hookspring](https://hookspring.com/blog/short-form-video-specs), [gettakes](https://gettakes.app/short-video-specs)
- Monetisation: [elev8or](https://www.elev8or.io/blog/creator-monetization-requirements), [veonib (Sept 2026)](https://veonib.com/articles/2026-09-06/creator-economy-shifts-in-2026-youtube-tiktok-x-and-funding-.html), [influenceflow](https://influenceflow.io/resources/tiktok-creator-monetization-requirements-guide-complete-2026-roadmap/), [tallyterms](https://tallyterms.com/blog/creator-monetization-requirements-by-platform), [views4you](https://views4you.com/blog/monetization-across-platforms/)
- Rockstar / GTA VI: [bo3.gg](https://bo3.gg/games/articles/gta-6-content-creator-rules-spoilers-streaming-and-youtube-monetization), [TheGamer](https://www.thegamer.com/grand-theft-auto-6-spoilers-will-be-taken-down-rockstar-confirms/), [ixbt.games](https://ixbt.games/en/news/2026/11/04/spoilerit-siuzet-gta-vi-zapreshheno-daze-posle-reliza-igroki-zametili-pravila-rockstar-pozvoliaiushhie-udaliat-zapisi.html), [Take-Two 10-Q (SEC)](https://www.sec.gov/Archives/edgar/data/0000946581/000162828026072254/ttwo-20260930.htm)
