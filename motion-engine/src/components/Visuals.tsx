import React from 'react';
import type {Campaign} from '../types';
import {SPRINGS, springStep, window01, clamp01} from '../lib/motion';

// Feature visuals, drawn at VIS_W x VIS_H and scaled by the scene.
export const VIS_W = 900;
export const VIS_H = 600;

type P = {c: Campaign; t: number; start: number; hit: number};

const Card: React.FC<{c: Campaign; children: React.ReactNode}> = ({c, children}) => (
  <div
    style={{
      width: VIS_W,
      height: VIS_H,
      position: 'relative',
      background: c.brand.surface,
      border: `1.5px solid ${c.brand.line}`,
      borderRadius: 26,
      boxShadow: '0 30px 60px -24px rgba(11,18,32,0.2), 0 2px 6px rgba(11,18,32,0.05)',
      overflow: 'hidden',
    }}
  >
    {children}
  </div>
);

const Grid: React.FC<{c: Campaign; top: number; bottom: number}> = ({c, top, bottom}) => (
  <>
    {[0, 1, 2, 3].map((g) => (
      <div key={g} style={{position: 'absolute', left: 40, right: 40, top: top + ((bottom - top) / 3) * g, height: 1, background: c.brand.line}} />
    ))}
  </>
);

export const BarsVisual: React.FC<P> = ({c, t, start, hit}) => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const vals = [0.42, 0.58, 0.5, 0.71, 0.64, 0.83, 0.92];
  const live = window01(t, hit - 0.1, hit + 0.1);
  return (
    <Card c={c}>
      <div style={{position: 'absolute', left: 40, top: 34, fontSize: 24, fontWeight: 700, color: c.brand.ink}}>Sessions this week</div>
      <div style={{position: 'absolute', right: 40, top: 34, display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 600, color: c.brand.primary, opacity: live}}>
        <div style={{width: 12, height: 12, borderRadius: 99, background: c.brand.primary, scale: String(1 + 0.25 * Math.sin((t - hit) * 6) * (1 - window01(t, hit, hit + 1.2)))}} />
        Live
      </div>
      <Grid c={c} top={120} bottom={500} />
      {vals.map((v, i) => {
        const grow = springStep(t - (start + i * 0.07), SPRINGS.bouncy);
        // The live bar receives a new data point after the "Live" pulse.
        const p = i === vals.length - 1 ? grow * (1 + 0.085 * springStep(t - (hit + 0.45), SPRINGS.bouncy)) : grow;
        const w = 74;
        const gap = (VIS_W - 80 - vals.length * w) / (vals.length - 1);
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: 'absolute',
                left: 40 + i * (w + gap),
                bottom: 100,
                width: w,
                height: Math.max(0, 380 * v * p),
                borderRadius: '12px 12px 4px 4px',
                background: i === vals.length - 1 ? c.brand.primary : `${c.brand.primary}38`,
              }}
            />
            <div style={{position: 'absolute', left: 40 + i * (w + gap), width: w, bottom: 56, textAlign: 'center', fontSize: 18, color: c.brand.muted, fontWeight: 500}}>{days[i]}</div>
          </React.Fragment>
        );
      })}
    </Card>
  );
};

export const QueryVisual: React.FC<P & {query: string}> = ({c, t, start, hit, query}) => {
  // Deterministic typing: characters shown is a pure function of time.
  const typeEnd = hit - 0.25;
  const chars = Math.floor(clamp01((t - start) / (typeEnd - start)) * query.length);
  const caretOn = t < hit && Math.floor(t * 2.4) % 2 === 0;
  const rows = [
    {k: 'North America', v: 0.86},
    {k: 'Europe', v: 0.71},
    {k: 'Asia Pacific', v: 0.55},
    {k: 'Latin America', v: 0.34},
  ];
  return (
    <Card c={c}>
      <div style={{position: 'absolute', left: 40, right: 40, top: 40, height: 76, borderRadius: 16, border: `2px solid ${t >= hit ? c.brand.line : c.brand.primary}`, background: c.brand.background}}>
        <div style={{position: 'absolute', left: 26, top: 22, fontSize: 26, fontWeight: 500, color: c.brand.ink, whiteSpace: 'nowrap'}}>
          {query.slice(0, chars)}
          <span style={{display: 'inline-block', width: 3, height: 30, marginLeft: 3, translate: '0px 5px', background: c.brand.primary, opacity: caretOn ? 1 : 0}} />
        </div>
      </div>
      {rows.map((r, i) => {
        const p = springStep(t - (hit + i * 0.08), SPRINGS.smooth);
        return (
          <div key={r.k} style={{position: 'absolute', left: 40, right: 40, top: 168 + i * 100, height: 80, opacity: Math.min(1, p * 1.5)}}>
            <div style={{fontSize: 20, fontWeight: 600, color: c.brand.ink}}>{r.k}</div>
            <div style={{position: 'absolute', left: 0, top: 38, height: 26, width: `${r.v * 100 * p}%`, borderRadius: 8, background: i === 0 ? c.brand.primary : `${c.brand.primary}40`}} />
          </div>
        );
      })}
    </Card>
  );
};

export const LineVisual: React.FC<P & {alert?: string}> = ({c, t, start, hit, alert}) => {
  const pts = [0.62, 0.58, 0.64, 0.6, 0.55, 0.5, 0.52, 0.44, 0.38, 0.4, 0.3, 0.22];
  const x0 = 40;
  const x1 = VIS_W - 40;
  const y0 = 110;
  const y1 = 520;
  const xy = pts.map((p, i) => [x0 + ((x1 - x0) * i) / (pts.length - 1), y0 + (y1 - y0) * p] as const);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  // Path length (polyline) for stroke-dash draw-on.
  let len = 0;
  for (let i = 1; i < xy.length; i++) len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
  const draw = window01(t, start, hit - 0.1);
  const last = xy[xy.length - 1];
  const pill = springStep(t - hit, SPRINGS.bouncy);
  const ring = clamp01((t - hit) / 0.9);
  const threshold = y0 + (y1 - y0) * 0.36;
  return (
    <Card c={c}>
      <div style={{position: 'absolute', left: 40, top: 34, fontSize: 24, fontWeight: 700, color: c.brand.ink}}>Signups</div>
      <Grid c={c} top={y0} bottom={y1} />
      <svg width={VIS_W} height={VIS_H} style={{position: 'absolute', left: 0, top: 0}}>
        <line x1={x0} x2={x1} y1={threshold} y2={threshold} stroke={c.brand.muted} strokeWidth={2} strokeDasharray="8 10" opacity={0.6 * draw} />
        <path d={d} fill="none" stroke={c.brand.primary} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
        {t >= hit ? <circle cx={last[0]} cy={last[1]} r={10 + 26 * ring} fill="none" stroke={c.brand.primary} strokeWidth={3} opacity={1 - ring} /> : null}
        <circle cx={last[0]} cy={last[1]} r={11 * window01(t, hit - 0.15, hit)} fill={c.brand.primary} />
      </svg>
      {alert ? (
        <div
          style={{
            position: 'absolute',
            right: 70,
            top: last[1] - 110,
            padding: '14px 22px',
            borderRadius: 14,
            background: c.brand.ink,
            color: '#FFFFFF',
            fontSize: 20,
            fontWeight: 600,
            opacity: Math.min(1, pill * 1.4),
            scale: String(0.85 + 0.15 * pill),
            transformOrigin: 'right bottom',
            whiteSpace: 'nowrap',
          }}
        >
          {alert}
        </div>
      ) : null}
    </Card>
  );
};
