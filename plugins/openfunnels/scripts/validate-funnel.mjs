#!/usr/bin/env node
/**
 * Pre-flight validator for OpenFunnels funnel packages (spec v1).
 * Mirrors the platform's upload validation (ERROR = upload rejects) and adds
 * local-only lint checks (WARN = deploys, but something silently won't work).
 *
 * Usage: node validate-funnel.mjs <funnel-dir>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const MAX_FILES = 500;
const MAX_UNPACKED = 100e6;
const IGNORED = new Set(['.DS_Store', 'Thumbs.db']);
const IGNORED_DIRS = new Set(['__MACOSX', '.git', 'node_modules']);

const dir = process.argv[2] || '.';
let root;
try {
  root = statSync(dir).isDirectory() ? dir : null;
} catch {
  root = null;
}
if (!root) {
  console.error(`Not a directory: ${dir}`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const files = [];

(function walk(d) {
  for (const entry of readdirSync(d, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walk(join(d, entry.name));
    } else if (!IGNORED.has(entry.name) && !entry.name.endsWith('.zip')) {
      files.push(relative(root, join(d, entry.name)).split(sep).join('/'));
    }
  }
})(root);

// --- package-level checks (platform rejects) ---
if (!files.includes('index.html')) {
  errors.push('No index.html at the package root — every funnel package needs an entry page (spec v1).');
}
if (files.length > MAX_FILES) {
  errors.push(`Package has ${files.length} files — max is ${MAX_FILES}.`);
}
const totalBytes = files.reduce((n, f) => n + statSync(join(root, f)).size, 0);
if (totalBytes > MAX_UNPACKED) {
  errors.push(`Unpacked size is ${Math.round(totalBytes / 1e6)}MB — max is 100MB.`);
}
for (const f of files) {
  if (f === '_platform' || f.startsWith('_platform/')) {
    errors.push(`${f}: the _platform/ path prefix is reserved by the platform (spec v1 §Reserved).`);
  }
}

// --- per-page checks ---
const htmlFiles = files.filter((f) => /\.html?$/i.test(f) && f !== 'tracking.md');
for (const name of htmlFiles) {
  const html = readFileSync(join(root, name), 'utf8');
  const lower = html.toLowerCase();

  // Platform REJECTS: missing literal closing tags means the snippet is never
  // injected — the page renders fine but captures nothing.
  const missing = ['</head>', '</body>'].filter((tag) => !lower.includes(tag));
  if (missing.length > 0) {
    errors.push(`${name}: missing ${missing.join(' and ')}. The platform injects tracking and the lead-capture snippet at those tags — add explicit <head> and <body> elements.`);
  }

  // Platform WARNS: forms without data-lead are not captured.
  if (name === 'index.html' && /<form[\s>]/i.test(html) && !/<form[^>]*\bdata-lead\b/i.test(html)) {
    warnings.push('index.html has a <form> without data-lead — its submissions will not be captured as leads (spec v1 §Forms).');
  }

  // Platform WARNS: data-section without id can't be deep-linked.
  const unanchored = [...html.matchAll(/<[a-z][^>]*\bdata-section\b[^>]*>/gi)]
    .filter((m) => !/\bid\s*=/i.test(m[0])).length;
  if (unanchored > 0) {
    warnings.push(`${name}: ${unanchored} data-section element(s) have no id — those sections can't be deep-linked (#hash). Spec §Section anchors.`);
  }

  // Local lint: root-relative refs break under the preview path prefix.
  // /_platform/* is the only permitted root-relative target in src/href.
  const rootRel = [...html.matchAll(/\b(?:src|href)\s*=\s*["'](\/[^"'/][^"']*)["']/gi)]
    .map((m) => m[1])
    .filter((url) => !url.startsWith('/_platform/'));
  if (rootRel.length > 0) {
    warnings.push(`${name}: root-relative reference(s) will 404 under the funnel's path prefix — make them relative: ${[...new Set(rootRel)].slice(0, 5).join(', ')}${rootRel.length > 5 ? ' …' : ''}`);
  }

  // Local lint: every data-lead form needs the honeypot field.
  for (const form of html.split(/<form\b/i).slice(1)) {
    const formHtml = form.slice(0, form.search(/<\/form>/i) === -1 ? undefined : form.search(/<\/form>/i));
    if (/^[^>]*\bdata-lead\b/i.test(formHtml) && !/name\s*=\s*["']company_website["']/i.test(formHtml)) {
      warnings.push(`${name}: a data-lead form is missing the honeypot input (name="company_website", class="hp", hidden off-screen — spec v1 §Forms).`);
    }
  }

  // Local lint: data-edit elements must hold a single text node. An element
  // child inside one silently loses click-to-edit in the editor.
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)[^>]*\bdata-edit\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const [tagOpen, tag, editName] = m;
    if (tagOpen.endsWith('/>')) continue;
    const after = html.slice(m.index + tagOpen.length);
    const close = after.search(new RegExp(`</${tag}\\b`, 'i'));
    if (close === -1) continue;
    const inner = after.slice(0, close);
    if (/<[a-z]/i.test(inner)) {
      warnings.push(`${name}: data-edit="${editName}" contains child element(s) — it loses click-to-edit (editable only via chat). Give each text its own element + data-edit (spec v1 §Editable-content markers).`);
    }
  }
}

// --- funnel.json sanity ---
if (files.includes('funnel.json')) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'funnel.json'), 'utf8'));
    if (manifest.steps !== undefined) {
      if (!Array.isArray(manifest.steps)) warnings.push('funnel.json: "steps" should be an array of {name, path} — the platform will ignore it.');
      else if (manifest.steps.length > 10) warnings.push(`funnel.json: ${manifest.steps.length} steps — max is 10.`);
      else for (const s of manifest.steps) if (!s?.path) warnings.push('funnel.json: a step is missing its "path" — the platform will skip it.');
    }
    if (manifest.goal !== undefined && manifest.goal !== 'leads' && manifest.goal !== 'booking' && !/^step:\//.test(String(manifest.goal))) {
      warnings.push(`funnel.json: unknown goal "${manifest.goal}" — expected "leads", "booking" or "step:/path".`);
    }
  } catch {
    warnings.push('funnel.json is not valid JSON — the platform will ignore it.');
  }
}

// --- report ---
const pages = htmlFiles.filter((f) => f !== '404.html');
console.log(`Checked ${files.length} file(s), ${pages.length} page(s) in ${root}`);
if (files.includes('index-b.html')) console.log('Split test: index-b.html present — deploys as a 50/50 A/B test.');
if (files.includes('funnel.json')) console.log('Manifest: funnel.json present.');
if (files.includes('tracking.md')) console.log('Tracking: tracking.md present.');
for (const e of errors) console.log(`ERROR  ${e}`);
for (const w of warnings) console.log(`WARN   ${w}`);
if (errors.length === 0 && warnings.length === 0) console.log('OK — package is clean.');
process.exit(errors.length > 0 ? 1 : 0);
