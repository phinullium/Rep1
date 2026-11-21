import {useVideoConfig} from 'remotion';

export type Kind = 'portrait' | 'square' | 'landscape';

export type Layout = {
  w: number;
  h: number;
  kind: Kind;
  /** 1 unit = 1px at 1080 short edge. Use for type sizes so all formats share a scale. */
  u: number;
  /** Platform UI safe area (px). Keep text and key UI inside it. */
  safe: {top: number; right: number; bottom: number; left: number};
  /** The usable content rectangle. */
  box: {x: number; y: number; w: number; h: number};
};

// Conservative safe zones. 9:16 accounts for the TikTok / Reels / Shorts overlays
// (top tabs, right-side action rail, bottom caption + nav). These are design
// margins, not official platform specs — re-check against current app UI.
const SAFE: Record<Kind, Layout['safe']> = {
  portrait: {top: 220, right: 150, bottom: 440, left: 90},
  square: {top: 80, right: 80, bottom: 80, left: 80},
  landscape: {top: 80, right: 120, bottom: 90, left: 120},
};

export function useLayout(): Layout {
  const {width: w, height: h} = useVideoConfig();
  const kind: Kind = h / w > 1.2 ? 'portrait' : w / h > 1.2 ? 'landscape' : 'square';
  const u = Math.min(w, h) / 1080;
  const safe = SAFE[kind];
  return {w, h, kind, u, safe, box: {x: safe.left, y: safe.top, w: w - safe.left - safe.right, h: h - safe.top - safe.bottom}};
}

/** Pick a value per format: by(layout, {portrait: 1, square: 2, landscape: 3}). */
export const by = <T,>(l: Layout, v: Record<Kind, T>): T => v[l.kind];
