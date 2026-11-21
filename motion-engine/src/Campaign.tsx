import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Sequence, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {loadFont} from '@remotion/fonts';
import {LEAD, computeEvents} from './lib/timeline';
import {useLayout} from './lib/layout';
import {SafeGuides} from './lib/qc';
import {Hook} from './scenes/Hook';
import {Interface} from './scenes/Interface';
import {Features} from './scenes/Features';
import {Cta} from './scenes/Cta';
import type {CampaignProps} from './types';

const Background: React.FC<{color: string; line: string}> = ({color, line}) => {
  const frame = useCurrentFrame();
  const l = useLayout();
  const step = 60 * l.u;
  const off = (frame * 0.35 * l.u) % step; // slow, deterministic drift
  return (
    <AbsoluteFill style={{backgroundColor: color}}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${line} ${1.6 * l.u}px, transparent ${1.7 * l.u}px)`,
          backgroundSize: `${step}px ${step}px`,
          backgroundPosition: `${off}px ${off}px`,
          opacity: 0.9,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Slow camera push-in across a scene so no frame is ever static (retention). Origin = safe-area centre.
 * Amount is sized so text at the safe edge drifts <= ~10 px (~2.4% portrait, ~2.2% square, ~1.2% landscape),
 * leaving room for exit slides inside the QC safe-zone tolerance.
 */
const ScenePush: React.FC<{lead: number; len: number; children: React.ReactNode}> = ({lead, len, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const l = useLayout();
  const p = Math.max(0, Math.min(1, (frame / fps - lead) / len));
  const amount = Math.min(0.025, 10 / (l.box.w / 2));
  return (
    <AbsoluteFill style={{scale: String(1 + amount * p), transformOrigin: `${l.safe.left + l.box.w / 2}px ${l.safe.top + l.box.h / 2}px`}}>
      {children}
    </AbsoluteFill>
  );
};

const Timecode: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{position: 'absolute', right: 16, top: 12, fontFamily: 'monospace', fontSize: 26, color: '#ff0050', background: 'rgba(255,255,255,0.85)', padding: '2px 8px'}}>
      {(frame / fps).toFixed(2)}s · f{frame}
    </div>
  );
};

export const CampaignVideo: React.FC<CampaignProps & {beats?: number[]}> = ({campaign: c, hook, cta, debug, beats}) => {
  const {fps} = useVideoConfig();
  const [handle] = useState(() => delayRender('Loading brand fonts'));
  useEffect(() => {
    Promise.all(Object.entries(c.assets.fonts).map(([weight, url]) => loadFont({family: c.brand.font, url: staticFile(url), weight})))
      .then(() => continueRender(handle))
      .catch((err) => cancelRender(err));
  }, [c, handle]);

  const hookData = c.hooks.find((h) => h.id === hook) ?? c.hooks[0];
  const ctaData = c.ctas.find((x) => x.id === cta) ?? c.ctas[0];
  const {scenes, ev, sfx, per} = computeEvents(c, beats);
  const F = (s: number) => Math.round(s * fps);
  const leadF = Math.round(LEAD * fps);
  // Every scene after the first mounts LEAD seconds early so entrances overlap exits.
  const seq = (id: keyof typeof scenes) => {
    const lead = id === 'hook' ? 0 : leadF;
    return {from: F(scenes[id].start) - lead, durationInFrames: F(scenes[id].end) - F(scenes[id].start) + lead};
  };
  const lead = leadF / fps;

  return (
    <AbsoluteFill style={{fontFamily: `${c.brand.font}, sans-serif`, color: c.brand.ink}}>
      <Background color={c.brand.background} line={c.brand.line} />
      <Sequence name="Hook" {...seq('hook')}>
        <ScenePush lead={0} len={scenes.hook.end - scenes.hook.start}>
          <Hook c={c} text={hookData.text} ev={ev.hook} />
        </ScenePush>
      </Sequence>
      <Sequence name="Product" {...seq('product')}>
        <ScenePush lead={lead} len={scenes.product.end - scenes.product.start}>
          <Interface c={c} ev={ev.product} lead={lead} />
        </ScenePush>
      </Sequence>
      <Sequence name="Features" {...seq('features')}>
        <ScenePush lead={lead} len={scenes.features.end - scenes.features.start}>
          <Features c={c} ev={ev.features} per={per} lead={lead} />
        </ScenePush>
      </Sequence>
      <Sequence name="CTA" {...seq('cta')}>
        <Cta c={c} cta={ctaData} ev={ev.cta} lead={lead} />
      </Sequence>

      {c.assets.music ? <Audio src={staticFile(c.assets.music)} volume={0.8} /> : null}
      {sfx.map((s, i) =>
        c.assets.sfx[s.sound] ? (
          <Sequence key={i} name={`sfx:${s.sound}`} from={F(s.at)} durationInFrames={F(0.8)} layout="none">
            <Audio src={staticFile(c.assets.sfx[s.sound])} volume={s.volume ?? 1} />
          </Sequence>
        ) : null,
      )}
      {debug ? (
        <>
          <SafeGuides />
          <Timecode />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
