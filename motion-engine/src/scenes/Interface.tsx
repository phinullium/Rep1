import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {by, useLayout} from '../lib/layout';
import {SPRINGS, springStep, window01} from '../lib/motion';
import {Fit} from '../lib/qc';
import {APP_H, APP_W, AppWindow} from '../components/AppWindow';
import type {Campaign} from '../types';
import type {Events} from '../lib/timeline';

export const Interface: React.FC<{c: Campaign; ev: Events['ev']['product']; lead: number}> = ({c, ev, lead}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps - lead; // seconds from the scene's official start (negative during the lead-in)
  const l = useLayout();
  const out = window01(t, ev.out, ev.out + 0.34);

  // Layout per format: stack in portrait/square, side by side in landscape.
  const titleSize = by(l, {portrait: 76, square: 64, landscape: 78}) * l.u;
  // Portrait/square: title stacked above the app, the whole stack centred in the safe area.
  // Landscape: title left, app right.
  const titleH = by(l, {portrait: titleSize * 2.25, square: titleSize * 1.2, landscape: l.box.h});
  const gap = by(l, {portrait: 70, square: 36, landscape: 0}) * l.u;
  const appArea = by(l, {
    portrait: {x: l.safe.left, w: l.box.w, h: l.box.h - titleH - gap},
    square: {x: l.safe.left, w: l.box.w, h: l.box.h - titleH - gap},
    landscape: {x: l.safe.left + 620 * l.u, w: l.box.w - 620 * l.u, h: l.box.h},
  });
  const scale = Math.min(appArea.w / APP_W, appArea.h / APP_H);
  const stackTop = l.kind === 'landscape' ? l.safe.top : l.safe.top + (l.box.h - (titleH + gap + APP_H * scale)) / 2;
  const titleBox = {x: l.safe.left, y: stackTop, w: l.kind === 'landscape' ? 560 * l.u : l.box.w, h: titleH};
  const appX = appArea.x + (appArea.w - APP_W * scale) / 2;
  const appY = l.kind === 'landscape' ? l.safe.top + (l.box.h - APP_H * scale) / 2 : stackTop + titleH + gap;

  const win = springStep(t - ev.windowIn, SPRINGS.smooth);
  const title = springStep(t - ev.taglineIn, SPRINGS.smooth);
  const [first, ...rest] = c.product.tagline.split(/(?<=\.)\s+/);

  return (
    <div style={{position: 'absolute', inset: 0}}>
      <Fit
        id="product-tagline"
        style={{
          position: 'absolute',
          left: titleBox.x,
          top: titleBox.y,
          width: titleBox.w,
          height: titleBox.h,
          display: 'flex',
          alignItems: l.kind === 'landscape' ? 'center' : 'flex-start',
          opacity: title * (1 - out),
          translate: `0px ${(1 - title) * 30 * l.u - out * 20 * l.u}px`,
        }}
      >
        <div style={{fontSize: titleSize, fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.035em', color: c.brand.ink}}>
          {first}
          {rest.length ? (
            <>
              {l.kind === 'square' ? ' ' : <br />}
              <span style={{color: c.brand.primary}}>{rest.join(' ')}</span>
            </>
          ) : null}
        </div>
      </Fit>
      <div
        style={{
          position: 'absolute',
          left: appX,
          top: appY,
          opacity: Math.min(1, win * 1.3) * (1 - out),
          translate: `0px ${(1 - win) * 120 * l.u - out * 40 * l.u}px`,
          scale: String(0.94 + 0.06 * win),
          transformOrigin: `${(APP_W * scale) / 2}px 0px`,
        }}
      >
        <AppWindow c={c} t={t} scale={scale} times={ev} />
      </div>
    </div>
  );
};
