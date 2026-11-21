// Deterministic motion primitives. Every function here is a pure function of
// time: seek(600) gives the same pixels whether or not frames 0..599 were drawn.

export type SpringConfig = {
  /** Seconds for one undamped oscillation (lower = snappier). */
  response: number;
  /** 1 = critically damped (no overshoot), <1 = bouncy, >1 = sluggish. */
  damping: number;
};

export const SPRINGS = {
  snappy: {response: 0.32, damping: 0.86},
  smooth: {response: 0.5, damping: 1},
  gentle: {response: 0.75, damping: 1},
  bouncy: {response: 0.45, damping: 0.68},
  leading: {response: 0.28, damping: 0.9},
  trailing: {response: 0.46, damping: 0.95},
} satisfies Record<string, SpringConfig>;

/**
 * Closed-form step response of a damped harmonic oscillator, starting at rest
 * at 0 and settling at 1. No simulation, no dependency on previous frames.
 */
export function springStep(t: number, {response, damping}: SpringConfig): number {
  if (t <= 0) return 0;
  const w = (2 * Math.PI) / response;
  const z = damping;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }
  if (z === 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(z * z - 1);
  return 1 - Math.exp(-z * w * t) * (Math.cosh(wd * t) + ((z * w) / wd) * Math.sinh(wd * t));
}

export type Target = {at: number; to: number; spring?: SpringConfig};

/**
 * value(t) = initial + Σ (targetChange × springResponse(t − changeTime))
 * A property that changes target several times, evaluated at any timestamp.
 */
export function springTo(t: number, initial: number, targets: Target[], fallback: SpringConfig = SPRINGS.smooth): number {
  let v = initial;
  let prev = initial;
  for (const k of targets) {
    v += (k.to - prev) * springStep(t - k.at, k.spring ?? fallback);
    prev = k.to;
  }
  return v;
}

/**
 * Animate a bar's two edges separately: the edge in the direction of travel
 * leads, the other trails. The indicator stretches, then settles.
 */
export function edgeSplit(t: number, initial: {left: number; right: number}, moves: {at: number; left: number; right: number}[]) {
  const lefts: Target[] = [];
  const rights: Target[] = [];
  let prev = initial;
  for (const m of moves) {
    const movingRight = m.left > prev.left;
    lefts.push({at: m.at, to: m.left, spring: movingRight ? SPRINGS.trailing : SPRINGS.leading});
    rights.push({at: m.at, to: m.right, spring: movingRight ? SPRINGS.leading : SPRINGS.trailing});
    prev = m;
  }
  return {left: springTo(t, initial.left, lefts), right: springTo(t, initial.right, rights)};
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** 0 before `a`, 1 after `b`, smooth in between. */
export const window01 = (t: number, a: number, b: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOutCubic = (x: number) => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

/** Enter with a spring at `inAt`, leave with an ease at `outAt`. Returns 0..1 presence. */
export function presence(t: number, inAt: number, outAt: number, spring: SpringConfig = SPRINGS.smooth, outDur = 0.28) {
  const enter = springStep(t - inAt, spring);
  const exit = window01(t, outAt, outAt + outDur);
  return enter * (1 - exit);
}

/** Deterministic pseudo-random in [0,1) from an integer seed (no Math.random during render). */
export function hash01(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
