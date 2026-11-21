import React from 'react';
import type {Campaign} from '../types';
import {SPRINGS, edgeSplit, springStep, springTo, window01, lerp, clamp01} from '../lib/motion';
import {Cursor, Logo, countUp} from './Primitives';

// The product UI is drawn from data at a fixed internal size (APP_W x APP_H),
// then scaled to fit each format. Coordinates below are in app pixels.
export const APP_W = 1000;
export const APP_H = 720;

const TAB_W = 128;
const TAB_X0 = 28;
const tabRect = (i: number) => ({left: TAB_X0 + i * TAB_W + 18, right: TAB_X0 + (i + 1) * TAB_W - 18});

type Times = {kpisIn: number; cursorIn: number; click1: number; click2: number};

export const AppWindow: React.FC<{c: Campaign; t: number; times: Times; scale: number}> = ({c, t, times, scale}) => {
  const ui = c.product.ui;
  const B = c.brand;
  const [tabA, tabB] = ui.nav;

  // Tab indicator: leading edge moves first, trailing edge follows.
  const ind = edgeSplit(t, tabRect(0), [{at: times.click1 + 0.02, ...tabRect(1)}]);
  const activeTab = t >= times.click1 + 0.02 ? 1 : 0;

  // Bars morph from tab A data to tab B data (one spring per bar, staggered).
  const a = ui.series[tabA];
  const b = ui.series[tabB] ?? a;
  const max = Math.max(...a, ...b) * 1.08;

  // Cursor path: springs between waypoints (app coordinates).
  const tab1Center = {x: (tabRect(1).left + tabRect(1).right) / 2, y: 96};
  const btn = {x: 822, y: 266, w: 150, h: 46};
  const btnCenter = {x: btn.x + btn.w / 2 + 6, y: btn.y + btn.h / 2 + 2};
  const cx = springTo(t, 1060, [
    {at: times.cursorIn, to: tab1Center.x + 30},
    {at: times.click1 - 0.62, to: tab1Center.x},
    {at: times.click2 - 0.7, to: btnCenter.x},
    {at: times.click2 + 0.45, to: btnCenter.x - 90},
  ]);
  const cy = springTo(t, 800, [
    {at: times.cursorIn, to: tab1Center.y + 160},
    {at: times.click1 - 0.62, to: tab1Center.y},
    {at: times.click2 - 0.7, to: btnCenter.y},
    {at: times.click2 + 0.45, to: btnCenter.y + 230},
  ]);
  const press = Math.max(window01(t, times.click1 - 0.05, times.click1) * (1 - window01(t, times.click1 + 0.04, times.click1 + 0.16)), window01(t, times.click2 - 0.05, times.click2) * (1 - window01(t, times.click2 + 0.04, times.click2 + 0.16)));
  const cursorOpacity = window01(t, times.cursorIn - 0.05, times.cursorIn + 0.15);

  // Button -> card: container moves first, text waits for space.
  const grow = springStep(t - (times.click2 + 0.04), SPRINGS.snappy);
  const card = {x: 560, y: 252, w: 412, h: 196};
  const box = {
    x: lerp(btn.x, card.x, grow),
    y: lerp(btn.y, card.y, grow),
    w: lerp(btn.w, card.w, grow),
    h: lerp(btn.h, card.h, grow),
  };
  const oldLabel = 1 - window01(t, times.click2 + 0.0, times.click2 + 0.1); // gone before the container really moves
  const newContent = clamp01((grow - 0.72) / 0.22); // appears only once there is enough room
  const toggle = springStep(t - (times.click2 + 0.95), SPRINGS.snappy); // switch flips on after the card opens
  const confirm = springStep(t - (times.click2 + 1.3), SPRINGS.smooth);
  const btnPressed = press > 0 && t < times.click2 + 0.2 && t > times.click2 - 0.2 ? press : 0;

  return (
    <div
      style={{
        width: APP_W,
        height: APP_H,
        position: 'relative',
        background: B.surface,
        borderRadius: 26,
        border: `1.5px solid ${B.line}`,
        boxShadow: '0 30px 60px -24px rgba(11,18,32,0.22), 0 2px 6px rgba(11,18,32,0.05)',
        overflow: 'hidden',
        fontFamily: B.font,
        color: B.ink,
        scale: String(scale),
        transformOrigin: '0 0',
      }}
    >
      {/* Top bar */}
      <div style={{position: 'absolute', left: 28, top: 22, display: 'flex', alignItems: 'center', gap: 12}}>
        <Logo c={c} size={30} style={{borderRadius: 8}} />
        <span style={{fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em'}}>{B.name}</span>
      </div>
      <div style={{position: 'absolute', left: 300, top: 18, width: 420, height: 38, borderRadius: 10, background: B.background, border: `1px solid ${B.line}`}}>
        <div style={{position: 'absolute', left: 14, top: 12, width: 14, height: 14, borderRadius: 99, border: `2px solid ${B.muted}`, opacity: 0.6}} />
      </div>
      <div style={{position: 'absolute', right: 28, top: 18, width: 38, height: 38, borderRadius: 99, background: B.line}} />

      {/* Tabs + split-edge indicator */}
      {ui.nav.map((n, i) => (
        <div
          key={n}
          style={{
            position: 'absolute',
            left: TAB_X0 + i * TAB_W,
            top: 78,
            width: TAB_W,
            textAlign: 'center',
            fontSize: 19,
            fontWeight: 600,
            color: i === activeTab ? B.ink : B.muted,
          }}
        >
          {n}
        </div>
      ))}
      <div style={{position: 'absolute', left: ind.left, width: Math.max(4, ind.right - ind.left), top: 110, height: 4, borderRadius: 99, background: B.primary}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 120, height: 1, background: B.line}} />

      {/* KPI cards */}
      {ui.kpis.map((k, i) => {
        const p = springStep(t - (times.kpisIn + i * 0.09), SPRINGS.smooth);
        const count = window01(t, times.kpisIn + 0.1 + i * 0.09, times.kpisIn + 1.0 + i * 0.09);
        return (
          <div
            key={k.label}
            style={{
              position: 'absolute',
              left: 28 + i * 318,
              top: 142,
              width: 298,
              height: 92,
              borderRadius: 16,
              border: `1px solid ${B.line}`,
              background: B.surface,
              opacity: p,
              translate: `0px ${(1 - p) * 18}px`,
            }}
          >
            <div style={{position: 'absolute', left: 20, top: 16, fontSize: 16, fontWeight: 500, color: B.muted}}>{k.label}</div>
            <div style={{position: 'absolute', left: 20, top: 40, fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums'}}>{countUp(k.value, count)}</div>
          </div>
        );
      })}

      {/* Chart card */}
      <div style={{position: 'absolute', left: 28, top: 252, width: 944, height: 440, borderRadius: 18, border: `1px solid ${B.line}`}}>
        <div style={{position: 'absolute', left: 24, top: 20, fontSize: 19, fontWeight: 600}}>{ui.nav[activeTab]}</div>
        <div style={{position: 'absolute', left: 24, top: 46, fontSize: 15, color: B.muted}}>{ui.dataSource === 'demo-data' ? 'Demo data' : 'Last 10 weeks'}</div>
        {[0, 1, 2, 3].map((g) => (
          <div key={g} style={{position: 'absolute', left: 24, right: 24, top: 110 + g * 80, height: 1, background: B.line}} />
        ))}
        {a.map((va, i) => {
          const h = springTo(t, 0, [
            {at: times.kpisIn + 0.25 + i * 0.05, to: va, spring: SPRINGS.smooth},
            {at: times.click1 + 0.08 + i * 0.03, to: b[i] ?? va, spring: SPRINGS.bouncy},
          ]);
          const barW = 62;
          const gap = (944 - 48 - a.length * barW) / (a.length - 1);
          const hpx = Math.max(0, (h / max) * 300);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 24 + i * (barW + gap),
                bottom: 30,
                width: barW,
                height: hpx,
                borderRadius: '10px 10px 4px 4px',
                background: i === a.length - 1 ? B.primary : `${B.primary}33`,
              }}
            />
          );
        })}
      </div>

      {/* New report: button that becomes a card */}
      <div
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          borderRadius: lerp(12, 18, grow),
          background: grow > 0.02 ? B.surface : B.primary,
          border: grow > 0.02 ? `1.5px solid ${B.line}` : 'none',
          boxShadow: grow > 0.02 ? `0 24px 48px -20px rgba(11,18,32,${0.28 * grow})` : 'none',
          scale: String(1 - 0.05 * btnPressed),
          overflow: 'hidden',
        }}
      >
        <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: 17, fontWeight: 600, opacity: oldLabel * (grow < 0.02 ? 1 : 0)}}>
          + {ui.newItem.button}
        </div>
        <div style={{position: 'absolute', left: 24, top: 22, right: 24, opacity: newContent, translate: `0px ${(1 - newContent) * 10}px`}}>
          <div style={{fontSize: 14, fontWeight: 600, color: B.primary, textTransform: 'uppercase', letterSpacing: '0.06em'}}>New report</div>
          <div style={{fontSize: 24, fontWeight: 700, marginTop: 10, letterSpacing: '-0.01em'}}>{ui.newItem.title}</div>
          <div style={{fontSize: 17, color: B.muted, marginTop: 8}}>{ui.newItem.detail}</div>
          <div style={{position: 'absolute', left: 0, top: 108, fontSize: 16, fontWeight: 600, color: B.primary, opacity: confirm, translate: `${(1 - confirm) * -8}px 0px`}}>Scheduled ✓</div>
          <div style={{position: 'absolute', right: 0, top: 104, width: 58, height: 32, borderRadius: 99, background: toggle > 0.5 ? B.primary : B.line}}>
            <div style={{position: 'absolute', left: 4 + 26 * toggle, top: 4, width: 24, height: 24, borderRadius: 99, background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'}} />
          </div>
        </div>
      </div>

      <Cursor x={cx} y={cy} press={press} opacity={cursorOpacity} />
    </div>
  );
};
