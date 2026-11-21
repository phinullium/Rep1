// Brief compiler + input validator.
// A campaign must pass every check here BEFORE any render starts.
// "A production system should reject bad input instead of generating a
// beautiful video containing incorrect information."
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {z} from 'zod';

export const FORMATS = {
  '9:16': {width: 1080, height: 1920, slug: '9x16'},
  '1:1': {width: 1080, height: 1080, slug: '1x1'},
  '16:9': {width: 1920, height: 1080, slug: '16x9'},
};

// Character limits per component, tuned so text fits the narrowest format (9:16).
export const LIMITS = {
  hook: 34,
  tagline: 34,
  featureTitle: 24,
  featureBody: 60,
  ctaLabel: 14,
  ctaSub: 28,
  navItem: 10,
  kpiLabel: 14,
  kpiValue: 8,
};

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'must be a #RRGGBB colour');
const rel = z.string().min(1).refine((p) => !path.isAbsolute(p) && !p.includes('..'), 'must be a relative path inside the campaign folder');

export const CampaignSchema = z.object({
  project: z.string().regex(/^[a-z0-9-]+$/, 'lowercase-kebab project id'),
  client: z.string().optional(),
  duration: z.number().positive().max(180),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]),
  brand: z.object({
    name: z.string().min(1),
    primary: hex,
    background: hex,
    surface: hex,
    ink: hex,
    muted: hex,
    line: hex,
    font: z.string().min(1),
    url: z.string().min(1),
  }),
  assets: z.object({
    logo: rel,
    fonts: z.record(z.enum(['300', '400', '500', '600', '700', '800', '900']), rel),
    music: rel.optional(),
    sfx: z.record(z.string(), rel).default({}),
    beats: rel.optional(),
  }),
  product: z.object({
    tagline: z.string().min(1),
    ui: z.object({
      dataSource: z.enum(['demo-data', 'client-approved']),
      nav: z.array(z.string()).min(2).max(5),
      kpis: z.array(z.object({label: z.string(), value: z.string()})).length(3),
      series: z.record(z.string(), z.array(z.number().nonnegative()).min(4).max(16)),
      newItem: z.object({button: z.string(), title: z.string(), detail: z.string()}),
    }),
  }),
  hooks: z.array(z.object({id: z.string(), angle: z.string(), text: z.string()})).min(1),
  features: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
        visual: z.enum(['bars', 'query', 'line']),
        query: z.string().optional(),
        alert: z.string().optional(),
      }),
    )
    .length(3),
  ctas: z.array(z.object({id: z.string(), label: z.string(), sub: z.string()})).min(1),
  approvedClaims: z.array(z.string()).default([]),
  scenes: z
    .array(
      z.object({
        id: z.enum(['hook', 'product', 'features', 'cta']),
        start: z.number().nonnegative(),
        end: z.number().positive(),
        type: z.string(),
      }),
    )
    .length(4),
  variants: z.object({
    hooks: z.number().int().positive(),
    formats: z.array(z.enum(['9:16', '1:1', '16:9'])).min(1),
    ctas: z.number().int().positive(),
  }),
});

const stripMarks = (s) => s.replace(/\*/g, '');

// WCAG relative luminance / contrast ratio.
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/**
 * Load + validate a campaign. Returns {campaign, dir, errors, warnings}.
 * errors => the render must not start.
 */
export function loadCampaign(campaignPath) {
  const file = fs.statSync(campaignPath).isDirectory() ? path.join(campaignPath, 'campaign.json') : campaignPath;
  const dir = path.dirname(path.resolve(file));
  const errors = [];
  const warnings = [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return {campaign: null, dir, file, errors: [`campaign.json is not valid JSON: ${e.message}`], warnings};
  }
  const parsed = CampaignSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`schema: ${issue.path.join('.')}: ${issue.message}`);
    return {campaign: null, dir, file, errors, warnings};
  }
  const c = parsed.data;

  // 1. Every referenced asset must exist.
  const assetPaths = [c.assets.logo, ...Object.values(c.assets.fonts), c.assets.music, ...Object.values(c.assets.sfx), c.assets.beats].filter(Boolean);
  for (const p of assetPaths) {
    if (!fs.existsSync(path.join(dir, p))) errors.push(`missing asset: ${p}`);
  }
  // 2. Fonts must be real font files (magic bytes) and include the weights the templates use.
  for (const [w, p] of Object.entries(c.assets.fonts)) {
    const abs = path.join(dir, p);
    if (!fs.existsSync(abs)) continue;
    const magic = fs.readFileSync(abs).subarray(0, 4).toString('latin1');
    if (!['wOF2', 'wOFF', 'OTTO', '\x00\x01\x00\x00', 'true'].includes(magic)) errors.push(`font ${w} (${p}) is not a woff2/woff/otf/ttf file`);
  }
  for (const w of ['400', '600', '700']) if (!c.assets.fonts[w]) errors.push(`font weight ${w} is required by the templates`);

  // 3. Text-length limits per component.
  const check = (label, text, limit) => {
    const len = stripMarks(text).length;
    if (len > limit) errors.push(`${label} is ${len} chars, limit ${limit}: "${stripMarks(text)}"`);
  };
  c.hooks.forEach((h) => check(`hook ${h.id}`, h.text, LIMITS.hook));
  check('tagline', c.product.tagline, LIMITS.tagline);
  c.features.forEach((f, i) => {
    check(`feature ${i + 1} title`, f.title, LIMITS.featureTitle);
    check(`feature ${i + 1} body`, f.body, LIMITS.featureBody);
    if (f.visual === 'query' && !f.query) errors.push(`feature ${i + 1} uses visual "query" but has no "query" text`);
    if (f.visual === 'line' && !f.alert) warnings.push(`feature ${i + 1} line visual has no alert label`);
  });
  c.ctas.forEach((x) => {
    check(`cta ${x.id} label`, x.label, LIMITS.ctaLabel);
    check(`cta ${x.id} sub`, x.sub, LIMITS.ctaSub);
  });
  c.product.ui.nav.forEach((n) => check(`nav item`, n, LIMITS.navItem));
  c.product.ui.kpis.forEach((k) => {
    check('kpi label', k.label, LIMITS.kpiLabel);
    check('kpi value', k.value, LIMITS.kpiValue);
  });
  for (const key of c.product.ui.nav.slice(0, 2)) {
    if (!c.product.ui.series[key]) errors.push(`product.ui.series is missing data for nav tab "${key}" (first two tabs are animated)`);
  }

  // 4. Claims: any marketing sentence containing a number must contain an approved claim verbatim.
  const marketing = [
    ...c.hooks.map((h) => [`hook ${h.id}`, h.text]),
    ['tagline', c.product.tagline],
    ...c.features.flatMap((f, i) => [[`feature ${i + 1} title`, f.title], [`feature ${i + 1} body`, f.body], [`feature ${i + 1} alert`, f.alert || '']]),
    ...c.ctas.map((x) => [`cta ${x.id}`, x.label]),
  ];
  const approved = c.approvedClaims.map((s) => s.toLowerCase());
  for (const [label, text] of marketing) {
    for (const sentence of stripMarks(text).split(/(?<=[.!?])\s+/)) {
      if (/\d/.test(sentence) && !approved.some((a) => sentence.toLowerCase().includes(a))) {
        errors.push(`unapproved claim in ${label}: "${sentence}" (add the exact wording to approvedClaims once the client signs it off)`);
      }
    }
  }
  if (c.product.ui.dataSource === 'demo-data') {
    warnings.push('product UI shows demo data: label the delivery as a concept/demo unless the client supplies real screenshots or approves the numbers');
  }

  // 5. Timeline integrity.
  const order = ['hook', 'product', 'features', 'cta'];
  c.scenes.forEach((s, i) => {
    if (s.id !== order[i]) errors.push(`scene ${i} must be "${order[i]}" (got "${s.id}")`);
    if (s.end <= s.start) errors.push(`scene ${s.id} ends before it starts`);
    if (i > 0 && Math.abs(s.start - c.scenes[i - 1].end) > 1e-6) errors.push(`gap/overlap between ${c.scenes[i - 1].id} and ${s.id}`);
  });
  if (c.scenes[0].start !== 0) errors.push('first scene must start at 0');
  if (Math.abs(c.scenes.at(-1).end - c.duration) > 1e-6) errors.push(`last scene ends at ${c.scenes.at(-1).end}s but duration is ${c.duration}s`);
  const minLen = {hook: 2, product: 5, features: 6, cta: 4};
  for (const s of c.scenes) if (s.end - s.start < minLen[s.id]) errors.push(`scene ${s.id} is ${s.end - s.start}s, template needs >= ${minLen[s.id]}s`);

  // 6. Variant matrix must be satisfiable.
  if (c.variants.hooks > c.hooks.length) errors.push(`variants.hooks=${c.variants.hooks} but only ${c.hooks.length} hooks defined`);
  if (c.variants.ctas > c.ctas.length) errors.push(`variants.ctas=${c.variants.ctas} but only ${c.ctas.length} CTAs defined`);
  if (new Set(c.hooks.map((h) => h.id)).size !== c.hooks.length) errors.push('hook ids must be unique');
  if (new Set(c.ctas.map((h) => h.id)).size !== c.ctas.length) errors.push('cta ids must be unique');

  // 7. Legibility: text colours must clear WCAG AA (4.5:1) on their backgrounds.
  const pairs = [
    ['ink on background', c.brand.ink, c.brand.background],
    ['ink on surface', c.brand.ink, c.brand.surface],
    ['white on primary (CTA)', '#FFFFFF', c.brand.primary],
  ];
  for (const [label, fg, bg] of pairs) {
    const r = contrast(fg, bg);
    if (r < 4.5) errors.push(`contrast too low for ${label}: ${r.toFixed(2)}:1 (need 4.5:1)`);
  }
  const mr = contrast(c.brand.muted, c.brand.background);
  if (mr < 4.5) warnings.push(`muted text on background is ${mr.toFixed(2)}:1 (below 4.5:1, keep it for secondary text only)`);

  return {campaign: c, dir, file, errors, warnings};
}

export const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

export function variantMatrix(c, filter = {}) {
  const hooks = c.hooks.slice(0, c.variants.hooks).map((h) => h.id).filter((id) => !filter.hooks || filter.hooks.includes(id));
  const ctas = c.ctas.slice(0, c.variants.ctas).map((x) => x.id).filter((id) => !filter.ctas || filter.ctas.includes(id));
  const formats = c.variants.formats.filter((f) => !filter.formats || filter.formats.includes(f));
  const out = [];
  for (const format of formats) for (const hook of hooks) for (const cta of ctas) out.push({format, hook, cta});
  return out;
}
