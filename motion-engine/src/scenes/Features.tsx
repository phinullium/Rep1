import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {by, useLayout} from '../lib/layout';
import {SPRINGS, springStep, window01} from '../lib/motion';
import {Fit} from '../lib/qc';
import {BarsVisual, LineVisual, QueryVisual, VIS_H, VIS_W} from '../components/Visuals';
import type {Campaign} from '../types';
import type {Events} from '../lib/timeline';

export const Features: React.FC<{c: Campaign; ev: Events['ev']['features']; per: number; lead: number}> = ({c, ev, per, lead}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps - lead; // seconds from the scene's official start (negative during the lead-in)
  const l = useLayout();

  const titleSize = by(l, {portrait: 80, square: 64, landscape: 80}) * l.u;
  const bodySize = by(l, {portrait: 38, square: 32, landscape: 36}) * l.u;
  const textH = by(l, {portrait: 380, square: 290, landscape: l.box.h / l.u}) * l.u;
  const gap = by(l, {portrait: 50, square: 16, landscape: 0}) * l.u;
  const visArea = by(l, {
    portrait: {x: l.safe.left, w: l.box.w, h: l.box.h - textH - gap},
    square: {x: l.safe.left, w: l.box.w, h: l.box.h - textH - gap - 44 * l.u}, // leave room for the progress bar
    landscape: {x: l.safe.left + 700 * l.u, w: l.box.w - 700 * l.u, h: l.box.h},
  });
  const scale = Math.min(visArea.w / VIS_W, visArea.h / VIS_H);
  const stackH = textH + gap + VIS_H * scale + (l.kind === 'square' ? 44 * l.u : 0);
  const stackTop = l.kind === 'landscape' ? l.safe.top : l.safe.top + (l.box.h - stackH) / 2;
  // Text box is narrower than the safe area by the slide distance, so the entrance never crosses the safe edge.
  const text = {x: l.safe.left, y: stackTop, w: l.kind === 'landscape' ? 600 * l.u : l.box.w - 50 * l.u, h: l.kind === 'landscape' ? l.box.h : textH};
  const vx = visArea.x + (visArea.w - VIS_W * scale) / 2;
  const vy = l.kind === 'landscape' ? l.safe.top + (l.box.h - VIS_H * scale) / 2 : stackTop + textH + gap;

  return (
    <div style={{position: 'absolute', inset: 0}}>
      {c.features.map((f, i) => {
        const e = ev[i];
        const inP = springStep(t - e.textIn, SPRINGS.smooth);
        const outP = window01(t, e.out, e.out + 0.3);
        if (t < e.in - 0.05 || t > e.out + 0.35) return null;
        const dx = ((1 - inP) * 90 - outP * 90) * l.u;
        const visIn = springStep(t - (e.in + 0.08), SPRINGS.smooth);
        return (
          <React.Fragment key={i}>
            <Fit
              id={`feature-${i + 1}-text`}
              style={{
                position: 'absolute',
                left: text.x,
                top: text.y,
                width: text.w,
                height: text.h,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: l.kind === 'landscape' ? 'center' : 'flex-end',
                opacity: Math.min(1, inP * 1.3) * (1 - outP),
                translate: `${dx}px 0px`,
              }}
            >
              <div style={{fontSize: 28 * l.u, fontWeight: 700, color: c.brand.primary, letterSpacing: '0.08em'}}>
                {String(i + 1).padStart(2, '0')} / {String(c.features.length).padStart(2, '0')}
              </div>
              <div style={{fontSize: titleSize, fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.035em', color: c.brand.ink, marginTop: 18 * l.u}}>{f.title}</div>
              <div style={{fontSize: bodySize, fontWeight: 500, lineHeight: 1.32, color: c.brand.muted, marginTop: 20 * l.u, maxWidth: 30 * bodySize}}>{f.body}</div>
            </Fit>
            <div
              style={{
                position: 'absolute',
                left: vx,
                top: vy,
                width: VIS_W,
                height: VIS_H,
                scale: String(scale),
                transformOrigin: '0 0',
                opacity: Math.min(1, visIn * 1.3) * (1 - outP),
                translate: `${dx * 1.25}px ${(1 - visIn) * 40 * l.u}px`,
              }}
            >
              {f.visual === 'bars' ? <BarsVisual c={c} t={t} start={e.visual} hit={e.hit} /> : null}
              {f.visual === 'query' ? <QueryVisual c={c} t={t} start={e.visual} hit={e.hit} query={f.query ?? ''} /> : null}
              {f.visual === 'line' ? <LineVisual c={c} t={t} start={e.visual} hit={e.hit} alert={f.alert} /> : null}
            </div>
          </React.Fragment>
        );
      })}
      {/* Progress segments */}
      <div style={{position: 'absolute', left: l.safe.left, top: l.h - l.safe.bottom - 10 * l.u, display: 'flex', gap: 10 * l.u, opacity: 1 - window01(t, ev.at(-1)!.out, ev.at(-1)!.out + 0.3)}}>
        {c.features.map((_, i) => {
          const fill = window01(t, i * per, (i + 1) * per);
          return (
            <div key={i} style={{width: 80 * l.u, height: 6 * l.u, borderRadius: 99, background: c.brand.line, overflow: 'hidden'}}>
              <div style={{width: `${fill * 100}%`, height: '100%', background: c.brand.primary}} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
