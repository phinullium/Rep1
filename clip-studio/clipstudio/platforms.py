"""Per-platform export presets.

Numbers marked "verify" change often; check each app's upload screen / help
centre before relying on them. Sources and dates are listed in PLATFORMS.md.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Platform:
    key: str
    label: str
    width: int
    height: int
    fps_max: int
    # Hard upload/eligibility limit in seconds (None = effectively unlimited for clips).
    max_seconds: int | None
    # Length range that the clip finder targets for this platform (a heuristic, not a rule).
    target_seconds: tuple[int, int]
    # Safe area as fractions of the frame (UI overlays: tabs, action rail, caption, nav).
    safe_top: float
    safe_bottom: float
    safe_left: float
    safe_right: float
    # Vertical centre of the caption block as a fraction of height.
    caption_y: float
    # Integrated loudness target (LUFS). Platforms normalise playback; -14 is the common reference.
    # Minimum length for monetisation eligibility (None = no minimum).
    min_seconds: int | None = None
    lufs: float = -14.0
    true_peak: float = -1.5
    notes: list[str] = field(default_factory=list)


PLATFORMS: dict[str, Platform] = {
    "tiktok": Platform(
        key="tiktok", label="TikTok", width=1080, height=1920, fps_max=60,
        max_seconds=600,  # verify: in-app 10 min for most accounts; web upload can allow longer
        target_seconds=(61, 90),
        # Creator Rewards Program only counts qualified views on original videos longer than 1 minute.
        min_seconds=61,
        safe_top=0.10, safe_bottom=0.24, safe_left=0.06, safe_right=0.15, caption_y=0.64,
        notes=["Creator Rewards pays only on originals > 1 min: exports are extended to >= 61 s (disable with --short-tiktok).",
               "Right-side action rail and bottom caption/nav cover ~25% of the frame.",
               "Hook must land in the first 1-2 s; native-feeling captions outperform none."],
    ),
    "reels": Platform(
        key="reels", label="Instagram Reels", width=1080, height=1920, fps_max=60,
        max_seconds=180,  # verify: reels up to 3 min are eligible for recommendation to non-followers (Jan 2025 change)
        target_seconds=(15, 60),
        safe_top=0.10, safe_bottom=0.22, safe_left=0.06, safe_right=0.13, caption_y=0.64,
        notes=["Feed preview crops to 4:5 around the centre: keep the subject and title in the middle 1080x1350.",
               "Original audio + no watermarks from other apps."],
    ),
    "shorts": Platform(
        key="shorts", label="YouTube Shorts", width=1080, height=1920, fps_max=60,
        max_seconds=180,  # Shorts can be up to 3 min (uploads from 15 Oct 2024)
        target_seconds=(20, 58),
        safe_top=0.10, safe_bottom=0.22, safe_left=0.06, safe_right=0.14, caption_y=0.64,
        notes=["Loops count: end on a line that flows back into the opening.",
               "Content ID applies: game music/trailers can block or demonetise."],
    ),
    "x": Platform(
        key="x", label="X (Twitter)", width=1080, height=1920, fps_max=60,
        max_seconds=140,  # verify: 2:20 for non-Premium accounts
        target_seconds=(15, 45),
        safe_top=0.06, safe_bottom=0.12, safe_left=0.05, safe_right=0.05, caption_y=0.70,
        notes=["Autoplays muted in timeline: burned-in captions matter most here."],
    ),
    "youtube": Platform(
        key="youtube", label="YouTube (16:9)", width=1920, height=1080, fps_max=60,
        max_seconds=None,
        target_seconds=(30, 90),
        safe_top=0.06, safe_bottom=0.12, safe_left=0.05, safe_right=0.05, caption_y=0.84,
        notes=["Use for compilations / long-form; 16:9 keeps full gameplay frame."],
    ),
}


def get(keys: str | list[str]) -> list[Platform]:
    if isinstance(keys, str):
        keys = [k.strip() for k in keys.split(",") if k.strip()]
    out = []
    for k in keys:
        if k not in PLATFORMS:
            raise SystemExit(f"unknown platform '{k}'. Choose from: {', '.join(PLATFORMS)}")
        out.append(PLATFORMS[k])
    return out
