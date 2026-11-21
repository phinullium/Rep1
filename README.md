# Rep1: motion engine + clip studio

Two production systems, built from two posts by @e1genqq:

| | Source | What it is | Folder |
|---|---|---|---|
| 1 | [*How to Build an Automated Motion Design System that Generates $$$*](https://x.com/e1genqq/status/2110016031917855006) (X article, 13 Oct 2026) | **Sell motion design at scale.** One brief → validated data → deterministic Remotion templates → QC → 18 exports (3 hooks × 3 formats × 2 CTAs) | [`motion-engine/`](motion-engine/) |
| 2 | ["GTA 6 clips studio in 22 repos"](https://x.com/e1genqq/status/2123903235467387381) (20 Nov 2026) | **Clip long videos into vertical shorts.** VOD → find the reaction → cut → punch in → caption → ship, for TikTok / Reels / Shorts / X | [`clip-studio/`](clip-studio/) |

```
Rep1/
├── README.md             ← you are here
├── TOOLS.md              ← all 22 + 5 tools: stage, role, licence, wired / optional / manual
├── PLATFORMS.md          ← specs, how each platform pays, viral mechanics, game-footage rights (with sources)
├── motion-engine/        ← Post 1 (Remotion + seek(t) + validator + renderer + QC)
├── clip-studio/          ← Post 2 (Python pipeline + install tiers + browser cutter)
├── .claude/skills/
│   ├── motion-campaign/  ← the article's Claude skill (section 09), wired to the real scripts
│   ├── clip-studio/      ← Claude reviews candidates, writes titles, renders, QCs
│   └── remotion-*        ← official Remotion agent skills (npx remotion skills add)
└── .agents/skills/       ← where the Remotion skills live (symlinked into .claude/skills)
```

## Quick start
```bash
# Post 1: motion campaigns
cd motion-engine && npm install
node scripts/validate.mjs campaigns/nova-launch && node scripts/render.mjs campaigns/nova-launch --preview
node scripts/render.mjs campaigns/nova-launch && node scripts/qc.mjs campaigns/nova-launch

# Post 2: clips
cd clip-studio && ./install.sh core && ./install.sh whispercpp
.venv/bin/python -m clipstudio run "<VOD url or OBS file>" -w work/ep1 --top 3 --platforms tiktok,reels,shorts --mode split
```
In Claude Code, ask for it in plain words ("make a launch campaign for <product>", "clip this stream"). The skills handle the
workflow, including the review steps the article insists on.

## Read before you monetise
- **PLATFORMS.md §2:** TikTok's Creator Rewards only pays on originals **longer than 1 minute**, so TikTok exports are extended to ≥61 s automatically.
  YouTube Shorts needs 1k subs + 10M Shorts views in 90 days for ad share.
- **PLATFORMS.md §4:** GTA VI and game footage. Use your own gameplay or footage you have permission for, avoid story spoilers, and strip
  licensed music (`--music remove`). Read Rockstar's video policy yourself before monetising.
- The posts' income figures ("$$$", "$18K+") are the author's claims. The article itself calls its $750 package price illustrative.
