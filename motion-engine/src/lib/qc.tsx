import React, {useLayoutEffect, useRef} from 'react';
import {useCurrentFrame} from 'remotion';
import {useLayout} from './layout';

/**
 * Wrap any text block that must not overflow or leave the safe area.
 * During rendering it logs `[qc-overflow]` / `[qc-safezone]` lines to the
 * browser console; scripts/render.mjs collects them into the QC report.
 */
export const Fit: React.FC<{id: string; style?: React.CSSProperties; children: React.ReactNode; checkSafe?: boolean}> = ({id, style, children, checkSafe = true}) => {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  const l = useLayout();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
      console.warn(`[qc-overflow] ${id} frame=${frame} content=${el.scrollWidth}x${el.scrollHeight} box=${el.clientWidth}x${el.clientHeight}`);
    }
    if (!checkSafe) return;
    // Measure the rendered content (text glyphs + children), not the container box.
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    // Effective opacity including ancestors; ignore invisible / mid-entrance elements.
    let opacity = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    if (opacity < 0.95 || r.width === 0) return;
    const scale = window.innerWidth / l.w || 1;
    // Premounted (not yet visible) sequences are parked far off-canvas: skip them.
    if (r.bottom < -l.h || r.top > l.h * 2 || r.right < -l.w || r.left > l.w * 2) return;
    const x = r.left / scale;
    const y = r.top / scale;
    const right = r.right / scale;
    const bottom = r.bottom / scale;
    const tol = 14; // allows the 2.5% scene push-in near the safe edges
    if (x < l.safe.left - tol || y < l.safe.top - tol || right > l.w - l.safe.right + tol || bottom > l.h - l.safe.bottom + tol) {
      console.warn(`[qc-safezone] ${id} frame=${frame} rect=${Math.round(x)},${Math.round(y)},${Math.round(right)},${Math.round(bottom)}`);
    }
  });
  return (
    <div ref={ref} style={{overflow: 'hidden', ...style}}>
      {children}
    </div>
  );
};

/** Safe-area guide overlay for preview frames (never rendered in exports). */
export const SafeGuides: React.FC = () => {
  const l = useLayout();
  return (
    <div
      style={{
        position: 'absolute',
        left: l.safe.left,
        top: l.safe.top,
        width: l.box.w,
        height: l.box.h,
        outline: '3px dashed rgba(255,0,80,0.75)',
        pointerEvents: 'none',
      }}
    />
  );
};
