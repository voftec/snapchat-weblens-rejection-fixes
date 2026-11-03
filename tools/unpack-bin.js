/**
 * unpack-bin.js — Zero-dependency browser helper to decode .bin files created
 * by pack-bin.mjs using the native DecompressionStream('deflate-raw') API.
 */
export async function unpackBinText(url, xorKey = 0x5a) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const u8 = new Uint8Array(await res.arrayBuffer());
  for (let i = 0; i < u8.length; i++) u8[i] ^= xorKey;
  return new Response(
    new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  ).text();
}

export async function unpackBinJSON(url, xorKey = 0x5a) {
  const txt = await unpackBinText(url, xorKey);
  return txt ? JSON.parse(txt) : null;
}
