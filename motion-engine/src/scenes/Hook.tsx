import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {by, useLayout} from '../lib/layout';
import {SPRINGS, springStep, window01} from '../lib/motion';
import {Fit} from '../lib/qc';
import {Logo, parseAccent} from '../components/Primitives';
import type {Campaign} from '../types';
import type {Events} from '../lib/timeline';

type Run = {accent: boolean; words: {word: string; index: number}[]};

export const Hook: React.FC<{c: Campaign; text: string; ev: Events['ev']['hook']}> = ({c, text, ev}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const l = useLayout();
  const size = by(l, {portrait: 118, square: 104, landscape: 128}) * l.u;

  // Group words into runs so an accented phrase never breaks across lines.
  const runs: Run[] = [];
  parseAccent(text).forEach((w, index) => {
    const last = runs.at(-1);
    if (w.accent && last?.accent) last.words.push({word: w.word, index});
    else runs.push({accent: w.accent, words: [{word: w.word, index}]});
  });
  const total = runs.reduce((n, r) => n + r.words.length, 0);
  const brand = springStep(t - 0.05, SPRINGS.smooth) * (1 - window01(t, ev.out, ev.out + 0.25));

  const Word: React.FC<{word: string; index: number; color: string}> = ({word, index, color}) => {
    const p = springStep(t - (ev.wordsIn + index * ev.stagger), SPRINGS.snappy);
    const out = window01(t, ev.out + index * 0.022, ev.out + index * 0.022 + 0.22);
    return (
      <span
        style={{
          display: 'inline-block',
          color,
          marginRight: index < total - 1 ? '0.24em' : 0,
          opacity: Math.min(1, p * 1.4) * (1 - out),
          translate: `0px ${((1 - p) * 0.55 - out * 0.35) * size}px`,
        }}
      >
        {word}
      </span>
    );
  };

  return (
    <div style={{position: 'absolute', inset: 0}}>
      {/* Small brand mark for recall in the first second */}
      <div
        style={{
          position: 'absolute',
          left: l.safe.left,
          top: l.safe.top,
          display: 'flex',
          alignItems: 'center',
          gap: 16 * l.u,
          opacity: brand,
          translate: `0px ${(1 - brand) * 16 * l.u}px`,
        }}
      >
        <Logo c={c} size={56 * l.u} style={{borderRadius: 14 * l.u}} />
        <span style={{fontSize: 38 * l.u, fontWeight: 700, color: c.brand.ink, letterSpacing: '-0.02em'}}>{c.brand.name}</span>
      </div>

      <Fit
        id="hook-title"
        style={{position: 'absolute', left: l.safe.left, top: l.safe.top, width: l.box.w, height: l.box.h, display: 'flex', alignItems: 'center'}}
      >
        <div style={{fontSize: size, fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.04em', color: c.brand.ink}}>
          {runs.map((r, ri) => {
            if (!r.accent) return r.words.map((w) => <Word key={w.index} word={w.word} index={w.index} color={c.brand.ink} />);
            const lastIdx = r.words.at(-1)!.index;
            const underAt = ev.wordsIn + (lastIdx + 1) * ev.stagger + 0.1;
            const out = window01(t, ev.out, ev.out + 0.22);
            return (
              <span key={`r${ri}`} style={{display: 'inline-block', whiteSpace: 'nowrap', position: 'relative', marginRight: lastIdx < total - 1 ? '0.24em' : 0}}>
                {r.words.map((w) => (
                  <Word key={w.index} word={w.word} index={w.index} color={c.brand.primary} />
                ))}
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: '-0.03em',
                    height: '0.085em',
                    borderRadius: 99,
                    background: c.brand.primary,
                    transformOrigin: 'left center',
                    scale: `${springStep(t - underAt, SPRINGS.smooth) * (1 - out)} 1`,
                  }}
                />
              </span>
            );
          })}
        </div>
      </Fit>
    </div>
  );
};
