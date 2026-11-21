// Mirrors scripts/lib/campaign.mjs (the zod schema used by the validator).
export type FormatId = '9:16' | '1:1' | '16:9';

export type Campaign = {
  project: string;
  client?: string;
  duration: number;
  fps: number;
  brand: {
    name: string;
    primary: string;
    background: string;
    surface: string;
    ink: string;
    muted: string;
    line: string;
    font: string;
    url: string;
  };
  assets: {
    logo: string;
    fonts: Record<string, string>;
    music?: string;
    sfx: Record<string, string>;
    beats?: string;
  };
  product: {
    tagline: string;
    ui: {
      dataSource: 'demo-data' | 'client-approved';
      nav: string[];
      kpis: {label: string; value: string}[];
      series: Record<string, number[]>;
      newItem: {button: string; title: string; detail: string};
    };
  };
  hooks: {id: string; angle: string; text: string}[];
  features: {title: string; body: string; visual: 'bars' | 'query' | 'line'; query?: string; alert?: string}[];
  ctas: {id: string; label: string; sub: string}[];
  approvedClaims: string[];
  scenes: {id: 'hook' | 'product' | 'features' | 'cta'; start: number; end: number; type: string}[];
  variants: {hooks: number; formats: FormatId[]; ctas: number};
};

export type CampaignProps = {
  campaign: Campaign;
  hook: string;
  cta: string;
  /** Draw safe-zone guides + QC overlays (preview only, never in exports). */
  debug?: boolean;
};
