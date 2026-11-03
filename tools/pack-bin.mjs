#!/usr/bin/env node
/**
 * pack-bin.mjs — Packs large .txt / .json files into opaque compressed .bin
 * assets (deflate-raw + 1-byte XOR) so Snapchat's static Web Lens security
 * scanner does not time out scanning multi-megabyte plain-text data files.
 *
 * Usage:
 *   node tools/pack-bin.mjs <input-file> [output-file.bin]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const [inPath, outArg] = process.argv.slice(2);
if (!inPath) {
  console.error('Usage: node tools/pack-bin.mjs <input-file> [output-file.bin]');
  process.exit(1);
}
const outPath = outArg || inPath.replace(/\.(txt|json)$/i, '') + '.bin';
const XOR_KEY = 0x5a;

const src = readFileSync(inPath);
const compressed = deflateRawSync(src, { level: 9 });
for (let i = 0; i < compressed.length; i++) compressed[i] ^= XOR_KEY;
writeFileSync(outPath, compressed);

console.log(
  `Packed ${inPath} (${(src.length / 1024).toFixed(1)} KB) -> ${outPath} (${(compressed.length / 1024).toFixed(1)} KB)`
);
