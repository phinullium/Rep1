import React from 'react';
import {Img, staticFile} from 'remotion';
import type {Campaign} from '../types';

export const Logo: React.FC<{c: Campaign; size: number; style?: React.CSSProperties}> = ({c, size, style}) => (
  <Img src={staticFile(c.assets.logo)} style={{width: size, height: size, display: 'block', ...style}} />
);

/** Mouse cursor, drawn in SVG so it stays crisp at every scale. */
export const Cursor: React.FC<{x: number; y: number; press: number; opacity: number; size?: number}> = ({x, y, press, opacity, size = 44}) => (
  <div style={{position: 'absolute', left: x, top: y, opacity, scale: String(1 - 0.14 * press), transformOrigin: '6px 4px', pointerEvents: 'none'}}>
    <svg width={size} height={size * 1.25} viewBox="0 0 32 40">
      <path d="M3 2 L3 31 L10.5 24.5 L15.5 36 L21 33.5 L16 22.5 L26 22.5 Z" fill="#0B1220" stroke="#FFFFFF" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  </div>
);

/** "12,480" / "$84.2k" / "1.9%" -> animated count-up that lands exactly on the source string. */
export function countUp(value: string, p: number): string {
  const m = value.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
  if (!m) return value;
  const [, pre, num, post] = m;
  if (p >= 0.999) return value;
  const n = Number(num.replace(/,/g, ''));
  const decimals = num.includes('.') ? num.split('.')[1].length : 0;
  const cur = (n * Math.max(0, p)).toFixed(decimals);
  const withCommas = num.includes(',') ? Number(cur).toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}) : cur;
  return `${pre}${withCommas}${post}`;
}

/** Split "Still building reports *by hand?*" into words with accent flags. */
export function parseAccent(text: string): {word: string; accent: boolean}[] {
  const out: {word: string; accent: boolean}[] = [];
  let accent = false;
  for (const raw of text.split(/\s+/)) {
    let w = raw;
    let startsAccent = false;
    let endsAccent = false;
    if (w.startsWith('*')) (startsAccent = true), (w = w.slice(1));
    if (w.endsWith('*')) (endsAccent = true), (w = w.slice(0, -1));
    if (startsAccent) accent = true;
    if (w) out.push({word: w, accent});
    if (endsAccent) accent = false;
  }
  return out;
}
