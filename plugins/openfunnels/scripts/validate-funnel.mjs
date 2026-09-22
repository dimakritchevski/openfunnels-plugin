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

  // Platform WARNS: forms without data-lead are not captured. A review
  // funnel's index form is data-review-request instead (spec §Review funnels).
  if (name === 'index.html' && /<form[\s>]/i.test(html) && !/<form[^>]*\b(data-lead|data-review-request)\b/i.test(html)) {
    warnings.push('index.html has a <form> without data-lead — its submissions will not be captured as leads (spec v1 §Forms).');
  }

  // Email templates (spec §Emails): sent, never served. SVG images and a
  // missing {link} are the two silent breakages in mail clients.
  if (/^emails\//i.test(name)) {
    if (/<img[^>]+src\s*=\s*["'][^"']+\.svg(\?[^"']*)?["']/i.test(html)) {
      warnings.push(`${name}: uses an SVG image — Gmail and Outlook won't show it. Use a PNG or JPG (spec §Emails).`);
    }
    if (/review\.html?$/i.test(name) && !/\{link\}/.test(html)) {
      warnings.push(`${name}: has no {link} placeholder — the customer gets no way to reach the review page (spec §Emails).`);
    }
    if (/\b(?:src|href)\s*=\s*["']https?:\/\/[^"']*\.svg["']/i.test(html)) {
      warnings.push(`${name}: links to an SVG — mail clients will not render it.`);
    }
    continue; // the page checks below don't apply to an email
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

  // Local lint: every data-lead / data-review-request form needs the honeypot field.
  for (const form of html.split(/<form\b/i).slice(1)) {
    const formHtml = form.slice(0, form.search(/<\/form>/i) === -1 ? undefined : form.search(/<\/form>/i));
    const marker = /^[^>]*\bdata-lead\b/i.test(formHtml) ? 'data-lead' : /^[^>]*\bdata-review-request\b/i.test(formHtml) ? 'data-review-request' : null;
    if (marker && !/name\s*=\s*["']company_website["']/i.test(formHtml)) {
      warnings.push(`${name}: a ${marker} form is missing the honeypot input (name="company_website", class="hp", hidden off-screen — spec v1 §Forms).`);
    }
    if (marker === 'data-review-request' && name === 'index.html') {
      warnings.push('index.html: the staff send form is at the root — a customer trimming their link lands on it. Put it on review-request.html and make index.html the customer page (spec §Review funnels, 2026-09-21 layout).');
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
let manifestSummary = '';
if (files.includes('funnel.json')) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'funnel.json'), 'utf8'));
    if (manifest.steps !== undefined) {
      if (!Array.isArray(manifest.steps)) warnings.push('funnel.json: "steps" should be an array of {name, path} — the platform will ignore it.');
      else if (manifest.steps.length > 10) warnings.push(`funnel.json: ${manifest.steps.length} steps — max is 10.`);
      else for (const s of manifest.steps) {
        if (!s?.path) warnings.push('funnel.json: a step is missing its "path" — the platform will skip it.');
        else if (s.role !== undefined && !['landing', 'form', 'booking', 'thankyou', 'review', 'other'].includes(s.role)) warnings.push(`funnel.json: step ${s.path} has an unknown "role" (${s.role}) — the platform will guess from the path instead.`);
        else if (s.role === undefined) warnings.push(`funnel.json: step ${s.path} has no "role" — the platform will guess from the path (spec v1 §funnel.json). Set it so bookings/forms are counted right.`);
      }
    }
    if (manifest.goal !== undefined && !String(manifest.goal).split(',').map((t) => t.trim()).filter(Boolean)
      .every((t) => ['leads', 'calls', 'form', 'call', 'booking'].includes(t) || /^step:\/.+/.test(t) || /^click:[a-z0-9][a-z0-9-]{0,39}$/.test(t))) {
      warnings.push(`funnel.json: unknown goal "${manifest.goal}" — expected a comma list of "form", "call", "booking", "step:/path" and/or "click:name" (or "leads").`);
    }
    for (const t of String(manifest.goal ?? '').split(',').map((t) => t.trim())) {
      if (t.startsWith('click:') && !htmlFiles.some((f) => new RegExp(`data-track-click\\s*=\\s*["']${t.slice(6)}["']`, 'i').test(readFileSync(join(root, f), 'utf8')))) {
        warnings.push(`funnel.json: goal "${t}" but no page has data-track-click="${t.slice(6)}" — that conversion can never fire (spec §Tracked clicks).`);
      }
    }
    if (manifest.kind !== undefined && !['funnel', 'form', 'review'].includes(manifest.kind)) {
      warnings.push(`funnel.json: unknown kind "${manifest.kind}" — expected "funnel", "form" or "review" — the platform will ignore it.`);
    }
    if (manifest.review !== undefined) {
      if (!manifest.review || typeof manifest.review !== 'object' || Array.isArray(manifest.review)) {
        warnings.push('funnel.json: "review" should be an object with "sms", "email_subject" and/or "email_body" — the platform will ignore it.');
      } else {
        for (const k of ['sms', 'email_subject', 'email_body']) {
          if (manifest.review[k] !== undefined && typeof manifest.review[k] !== 'string') warnings.push(`funnel.json: review.${k} should be a string — ignored.`);
        }
        if (typeof manifest.review.sms === 'string' && manifest.review.sms.trim() && !manifest.review.sms.includes('{link}')) {
          warnings.push('funnel.json: review.sms has no {link} placeholder — the customer gets no way to leave a review.');
        }
        if (manifest.kind !== 'review') warnings.push('funnel.json: "review" templates only take effect with "kind": "review".');
      }
    }
    if (manifest.kind === 'review') {
      const need = ['yes.html', 'no.html', 'review-request.html'].filter((p) => !files.includes(p));
      if (need.length > 0) warnings.push(`funnel.json: kind "review" but the package is missing ${need.join(', ')} — the customer link opens the root (index.html), staff send from review-request.html (spec §Review funnels).`);
      if (files.includes('review-request.html') && !/<form[^>]*\bdata-review-request\b/i.test(readFileSync(join(root, 'review-request.html'), 'utf8'))) {
        warnings.push('funnel.json: kind "review" but review-request.html has no data-review-request form — staff will have nothing to send from.');
      }
      if (files.includes('yes.html') && !/data-track-click\s*=\s*["']review["']/i.test(readFileSync(join(root, 'yes.html'), 'utf8'))) {
        warnings.push('yes.html: the review-platform link has no data-track-click="review" — clicks through to the review site won\'t be counted (spec §Review funnels).');
      }
    }
    // "slug" only means something in a bundle import, where a bad one ERRORS
    // that folder's row (spec v1 §Manifest) — so it's an error here too.
    if (manifest.slug !== undefined) {
      if (typeof manifest.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(manifest.slug)) {
        errors.push(`funnel.json: "slug" "${manifest.slug}" isn't a valid URL slug — lowercase letters, digits and hyphens, starting with a letter or digit, max 63 characters. In a bundle the platform rejects this folder.`);
      }
    }
    if (manifest.category !== undefined && manifest.category !== null && typeof manifest.category !== 'string') {
      warnings.push('funnel.json: "category" should be a string like "Family Law" — the platform will ignore it.');
    } else if (typeof manifest.category === 'string' && manifest.category.trim().length > 60) {
      warnings.push('funnel.json: "category" is over 60 characters — the platform truncates it.');
    }
    const parts = [];
    if (typeof manifest.slug === 'string') parts.push(`slug /${manifest.slug}/ (bundle imports only)`);
    if (typeof manifest.category === 'string' && manifest.category.trim()) parts.push(`category "${manifest.category.trim()}"`);
    if (Array.isArray(manifest.steps)) parts.push(`${manifest.steps.length} step(s): ${manifest.steps.map((s) => s?.name || s?.path).join(' → ')}`);
    if (manifest.goal !== undefined) parts.push(`goal ${manifest.goal}`);
    manifestSummary = parts.length > 0 ? ` — ${parts.join('; ')}` : '';
  } catch {
    warnings.push('funnel.json is not valid JSON — the platform will ignore it.');
  }
}

// --- report ---
const pages = htmlFiles.filter((f) => f !== '404.html');
console.log(`Checked ${files.length} file(s), ${pages.length} page(s) in ${root}`);
if (files.includes('index-b.html')) console.log('Split test: index-b.html present — deploys as a 50/50 A/B test.');
if (files.includes('funnel.json')) console.log(`Manifest: funnel.json present${manifestSummary}.`);
try {
  const k = JSON.parse(readFileSync(join(root, 'funnel.json'), 'utf8')).kind;
  if (k === 'review') console.log('Kind: review funnel — index.html is the customer page (the link they get); yes / no / thanks; staff send from review-request.html.');
  else if (k === 'form') console.log('Kind: form (submissions only).');
} catch { /* no manifest or unreadable - reported above */ }
if (files.includes('tracking.md')) console.log('Tracking: tracking.md present.');
for (const e of errors) console.log(`ERROR  ${e}`);
for (const w of warnings) console.log(`WARN   ${w}`);
if (errors.length === 0 && warnings.length === 0) console.log('OK — package is clean.');
process.exit(errors.length > 0 ? 1 : 0);
