#!/usr/bin/env node
// Usage: node scripts/validate.mjs campaigns/nova-launch
// Exit code 1 if the campaign must not be rendered.
import {loadCampaign, variantMatrix} from './lib/campaign.mjs';

const target = process.argv[2] || 'campaigns/nova-launch';
const {campaign, errors, warnings} = loadCampaign(target);

for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  FAIL  ${e}`);
if (errors.length) {
  console.log(`\n✗ ${target}: ${errors.length} problem(s). Fix the brief before rendering.`);
  process.exit(1);
}
const n = variantMatrix(campaign).length;
console.log(`\n✓ ${target}: valid. ${campaign.variants.hooks} hooks × ${campaign.variants.formats.length} formats × ${campaign.variants.ctas} CTAs = ${n} exports.`);
