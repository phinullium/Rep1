import React from 'react';
import {Composition, type CalculateMetadataFunction} from 'remotion';
import {CampaignVideo} from './Campaign';
import type {Campaign, CampaignProps} from './types';
import nova from '../campaigns/nova-launch/campaign.json';
import novaBeats from '../campaigns/nova-launch/audio/beats.json';

type Props = CampaignProps & {beats?: number[]};

// Duration and fps come from the campaign data, not from the template.
const calculateMetadata: CalculateMetadataFunction<Props> = ({props}) => ({
  durationInFrames: Math.round(props.campaign.duration * props.campaign.fps),
  fps: props.campaign.fps,
});

const defaults: Props = {campaign: nova as Campaign, hook: 'A', cta: 'A', debug: false, beats: novaBeats.beats};

// One template, three layouts. Width/height are the only per-format inputs;
// every scene computes its own layout from them (no cropping).
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Campaign-9x16" component={CampaignVideo} width={1080} height={1920} fps={30} durationInFrames={750} defaultProps={defaults} calculateMetadata={calculateMetadata} />
    <Composition id="Campaign-1x1" component={CampaignVideo} width={1080} height={1080} fps={30} durationInFrames={750} defaultProps={defaults} calculateMetadata={calculateMetadata} />
    <Composition id="Campaign-16x9" component={CampaignVideo} width={1920} height={1080} fps={30} durationInFrames={750} defaultProps={defaults} calculateMetadata={calculateMetadata} />
  </>
);
