#!/usr/bin/env node
/**
 * validate-weblens-zip.mjs — Pre-submit validator for Snapchat Web Lens .zip
 * packages, including checks for the two silent auto-rejection traps:
 *   1. Large .txt/.json files that time out the static security scanner
 *   2. <link rel="preload"> tags that throw ResourceLoadError in Snap's runner
 *
 * Usage:
 *   node tools/validate-weblens-zip.mjs <path-to-package.zip>
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const zipPath = process.argv[2];
if (!zipPath || !existsSync(zipPath)) {
  console.error('Usage: node tools/validate-weblens-zip.mjs <path-to-package.zip>');
  process.exit(1);
}

const list = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
if (list.status !== 0) {
  console.error('ERROR: unzip -l failed:', list.stderr);
  process.exit(1);
}

const entries = list.stdout
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^\d+\s+\S+\s+\S+\s+/.test(l))
  .map((l) => {
    const m = l.match(/^(\d+)\s+\S+\s+\S+\s+(.+)$/);
    return { bytes: Number(m[1]), name: m[2] };
  });

const names = entries.map((e) => e.name);
const failures = [];
const warnings = [];

if (!names.includes('index.html')) failures.push('index.html is NOT at the zip root');
if (names.some((n) => n.startsWith('dist/') || /^[a-zA-Z0-9_-]+\/index\.html$/.test(n))) {
  failures.push('index.html is inside a subfolder (zip the CONTENTS of dist/, not the folder)');
}
const backslash = names.filter((n) => n.includes('\\'));
if (backslash.length) failures.push(`backslash paths found: ${backslash.slice(0, 5).join(', ')}`);

const zipBytes = statSync(zipPath).size;
if (zipBytes > 8 * 1024 * 1024) {
  failures.push(`zip is ${(zipBytes / 1048576).toFixed(2)} MB (> 8 MB limit)`);
}

// Trap #1: Large .txt or .json files that time out Snapchat's static security scanner
for (const e of entries) {
  if (/\.(txt|csv|tsv)$/i.test(e.name)) {
    failures.push(
      `[Trap #1] Plain-text file "${e.name}" (${(e.bytes / 1024).toFixed(0)} KB) — convert to .bin with tools/pack-bin.mjs so Snap's security scanner does not fail`
    );
  } else if (/\.json$/i.test(e.name) && e.bytes > 250 * 1024) {
    warnings.push(
      `[Trap #1] Large JSON "${e.name}" (${(e.bytes / 1024).toFixed(0)} KB) — consider packing into .bin with tools/pack-bin.mjs to avoid security scan timeouts`
    );
  }
}

const idx = spawnSync('unzip', ['-p', zipPath, 'index.html'], {
  encoding: 'utf8',
  maxBuffer: 5 * 1024 * 1024,
});
if (idx.status === 0) {
  const html = idx.stdout;
  if (html.length > 1024 * 1024) {
    failures.push(`index.html is ${(html.length / 1048576).toFixed(2)} MB (> 1 MB limit)`);
  }
  const abs = html.match(/(?:src|href)="\/[^"]+"/g);
  if (abs) failures.push(`absolute paths in index.html: ${abs.slice(0, 5).join(', ')}`);
  const ext = html.match(/(?:src|href)="https?:\/\/[^"]+"/g);
  if (ext) failures.push(`external URLs in index.html: ${ext.slice(0, 5).join(', ')}`);
  if (/<base[\s>]/i.test(html)) failures.push('<base> element present (blocked by Snap CSP)');
  if (/rel=["']manifest["']/i.test(html)) failures.push('web app manifest present (blocked)');
  if (/<iframe/i.test(html)) failures.push('<iframe> present (blocked)');
  if (!/viewport-fit=cover/.test(html)) warnings.push('viewport-fit=cover missing in index.html');

  // Trap #2: <link rel="preload"> triggers ResourceLoadError in Snap's automated test runner
  const preloadLinks = html.match(/<link\b[^>]*rel=["']preload["'][^>]*>/gi);
  if (preloadLinks) {
    failures.push(
      `[Trap #2] <link rel="preload"> found in index.html (${preloadLinks.join(' ')}) — causes "ResourceLoadError: link failed to load ..." in Snap's automated test runner. Use fetch() instead.`
    );
  }
}

console.log(failures.length ? '❌ FAIL' : '✅ PASS');
console.log(`zip: ${basename(zipPath)} (${(zipBytes / 1048576).toFixed(2)} MB), ${entries.length} entries`);
for (const f of failures) console.log(`FAIL: ${f}`);
for (const w of warnings) console.log(`WARN: ${w}`);
process.exit(failures.length ? 1 : 0);
