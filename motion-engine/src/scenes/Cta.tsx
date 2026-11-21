import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {by, useLayout} from '../lib/layout';
import {SPRINGS, springStep, springTo, window01} from '../lib/motion';
import {Fit} from '../lib/qc';
import {Cursor, Logo} from '../components/Primitives';
import type {Campaign} from '../types';
import type {Events} from '../lib/timeline';

export const Cta: React.FC<{c: Campaign; cta: Campaign['ctas'][number]; ev: Events['ev']['cta']; lead: number}> = ({c, cta, ev, lead}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps - lead; // seconds from the scene's official start (negative during the lead-in)
  const l = useLayout();

  const logoSize = by(l, {portrait: 150, square: 120, landscape: 130}) * l.u;
  const nameSize = by(l, {portrait: 120, square: 100, landscape: 116}) * l.u;
  const tagSize = by(l, {portrait: 46, square: 40, landscape: 42}) * l.u;
  const btnSize = by(l, {portrait: 56, square: 46, landscape: 46}) * l.u;

  const logo = springStep(t - ev.logoIn, SPRINGS.bouncy);
  const word = springStep(t - ev.wordIn, SPRINGS.smooth);
  const tag = springStep(t - ev.taglineIn, SPRINGS.smooth);
  const btn = springStep(t - ev.buttonIn, SPRINGS.bouncy);
  const sub = springStep(t - ev.subIn, SPRINGS.smooth);
  const press = window01(t, ev.click - 0.06, ev.click) * (1 - window01(t, ev.click + 0.05, ev.click + 0.2));
  const clicked = window01(t, ev.click, ev.click + 0.25);
  // Slow continuous drift so the end card is never a frozen frame.
  const drift = 1 + 0.025 * window01(t, ev.subIn, ev.len);

  // Cursor in CTA-local coordinates relative to the button centre.
  const cx = springTo(t, 520 * l.u, [{at: ev.cursorIn, to: 70 * l.u}, {at: ev.click - 0.6, to: 10 * l.u}, {at: ev.click + 0.6, to: 150 * l.u}]);
  const cy = springTo(t, 420 * l.u, [{at: ev.cursorIn, to: 90 * l.u}, {at: ev.click - 0.6, to: 6 * l.u}, {at: ev.click + 0.6, to: 140 * l.u}]);
  const cursorOpacity = window01(t, ev.cursorIn, ev.cursorIn + 0.2) * (1 - window01(t, ev.click + 0.9, ev.click + 1.2));

  return (
    <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          position: 'absolute',
          left: l.safe.left,
          top: l.safe.top,
          width: l.box.w,
          height: l.box.h,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          scale: String(drift),
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 34 * l.u}}>
          <div style={{opacity: Math.min(1, logo * 1.5), scale: String(0.6 + 0.4 * logo), rotate: `${(1 - logo) * -12}deg`}}>
            <Logo c={c} size={logoSize} style={{borderRadius: logoSize * 0.25}} />
          </div>
          <div style={{fontSize: nameSize, fontWeight: 800, letterSpacing: '-0.045em', color: c.brand.ink, opacity: word, translate: `${(1 - word) * -40 * l.u}px 0px`, lineHeight: 1}}>
            {c.brand.name}
          </div>
        </div>
        <Fit id="cta-tagline" style={{marginTop: 40 * l.u, maxWidth: l.box.w, opacity: tag, translate: `0px ${(1 - tag) * 24 * l.u}px`}}>
          <div style={{fontSize: tagSize, fontWeight: 500, color: c.brand.muted, textAlign: 'center', whiteSpace: 'nowrap'}}>{c.product.tagline}</div>
        </Fit>
        <div style={{position: 'relative', marginTop: 64 * l.u}}>
          <Fit
            id="cta-button"
            style={{
              padding: `${btnSize * 0.62}px ${btnSize * 1.3}px`,
              borderRadius: 999,
              background: c.brand.primary,
              color: '#FFFFFF',
              fontSize: btnSize,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              opacity: Math.min(1, btn * 1.5),
              scale: String((0.8 + 0.2 * btn) * (1 - 0.06 * press)),
              boxShadow: `0 ${18 * l.u}px ${40 * l.u}px -${18 * l.u}px ${c.brand.primary}AA`,
            }}
          >
            {cta.label}
            <span style={{display: 'inline-block', marginLeft: 0.4 * btnSize, translate: `${clicked * 8 * l.u}px 0px`}}>→</span>
          </Fit>
          <div style={{position: 'absolute', left: '50%', top: '50%'}}>
            <Cursor x={cx} y={cy} press={press} opacity={cursorOpacity} size={48 * l.u} />
          </div>
        </div>
        <Fit id="cta-sub" style={{marginTop: 36 * l.u, opacity: sub}}>
          <div style={{fontSize: tagSize * 0.82, fontWeight: 600, color: c.brand.ink, whiteSpace: 'nowrap'}}>{cta.sub}</div>
        </Fit>
      </div>
    </div>
  );
};
