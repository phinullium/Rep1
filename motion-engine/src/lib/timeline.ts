import type {Campaign} from '../types';

// Every visual event and every sound effect reads its time from here, so sound
// is part of the timeline instead of being added after rendering.

/** Seconds each scene is mounted before its official start, for overlapping transitions. */
export const LEAD = 0.25;

export type Sfx = {at: number; sound: string; volume?: number};

/** Snap t to the nearest beat if one is within `tol` seconds. */
export function snap(t: number, beats: number[] | undefined, tol = 0.09): number {
  if (!beats || beats.length === 0) return t;
  let best = t;
  let d = tol;
  for (const b of beats) {
    const x = Math.abs(b - t);
    if (x < d) {
      d = x;
      best = b;
    }
  }
  return best;
}

export function computeEvents(c: Campaign, beats?: number[]) {
  const sc = Object.fromEntries(c.scenes.map((s) => [s.id, s])) as Record<Campaign['scenes'][number]['id'], Campaign['scenes'][number]>;
  const S = (id: keyof typeof sc, local: number) => snap(sc[id].start + local, beats) - sc[id].start; // local, beat-snapped

  const hookLen = sc.hook.end - sc.hook.start;
  const productLen = sc.product.end - sc.product.start;
  const featLen = sc.features.end - sc.features.start;
  const ctaLen = sc.cta.end - sc.cta.start;
  const per = featLen / c.features.length;

  const ev = {
    hook: {wordsIn: 0.1, stagger: 0.085, out: hookLen - 0.42}, // words gone (~2.9 s) before the next scene is visible
    product: {
      // Negative = starts during the previous scene's exit (scenes overlap by LEAD).
      windowIn: -0.2,
      // Text never crossfades with text: the tagline waits until the hook's words have left (~3.03 s).
      taglineIn: 0.08,
      kpisIn: 0.55,
      cursorIn: 1.1,
      click1: S('product', 2.0),
      click2: S('product', 3.5),
      out: productLen - 0.32,
    },
    features: c.features.map((_, i) => ({
      in: i === 0 ? -0.16 : i * per - 0.14, // visual card (crossfades, so no empty frame)
      textIn: i === 0 ? 0.04 : i * per + 0.02, // headline enters only after the previous text is gone
      visual: i * per + 0.35,
      hit: S('features', i * per + 1.8),
      out: (i + 1) * per - 0.3,
    })),
    cta: {
      logoIn: -0.08,
      wordIn: 0.22,
      taglineIn: 0.55,
      buttonIn: S('cta', 1.0),
      subIn: 1.3,
      cursorIn: 2.0,
      click: S('cta', 3.5),
      len: ctaLen,
    },
  };

  // Sound design: one list, absolute times.
  const sfx: Sfx[] = [];
  const has = (k: string) => Boolean(c.assets.sfx[k]);
  if (has('whoosh')) {
    sfx.push({at: sc.hook.start + 0.02, sound: 'whoosh', volume: 0.5});
    sfx.push({at: sc.product.start + ev.product.windowIn - 0.05, sound: 'whoosh', volume: 0.55});
    ev.features.forEach((f) => sfx.push({at: sc.features.start + f.in - 0.08, sound: 'whoosh', volume: 0.5}));
    sfx.push({at: sc.cta.start - 0.2, sound: 'whoosh', volume: 0.5});
  }
  if (has('click')) {
    sfx.push({at: sc.product.start + ev.product.click1, sound: 'click', volume: 0.9});
    sfx.push({at: sc.product.start + ev.product.click2, sound: 'click', volume: 0.9});
    sfx.push({at: sc.cta.start + ev.cta.click, sound: 'click', volume: 0.9});
  }
  if (has('pop')) {
    ev.features.forEach((f) => sfx.push({at: sc.features.start + f.hit, sound: 'pop', volume: 0.6}));
    sfx.push({at: sc.cta.start + ev.cta.logoIn, sound: 'pop', volume: 0.6});
    sfx.push({at: sc.cta.start + ev.cta.buttonIn, sound: 'pop', volume: 0.5});
  }
  sfx.sort((a, b) => a.at - b.at);
  return {scenes: sc, ev, sfx, per};
}

export type Events = ReturnType<typeof computeEvents>;
