// Resolves layer artwork for export so the headless renderer sees the same
// images the Story preview shows. Supported references:
//   - data:image/png|jpeg|webp;base64,...   embedded artwork (imported files)
//   - /assets/...                           project-owned files under public/assets
// Anything else (blob:, http(s):, other paths) is refused with a clear reason.
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_ROOT = fileURLToPath(new URL('../public/', import.meta.url));
export const MAX_ASSET_BYTES = 40 * 1024 * 1024;
const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const SIGNATURES = {
  'image/png': bytes => bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': bytes => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/webp': bytes => bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
};

export class AssetError extends Error {
  constructor(layer, reason) { super(`Layer "${layer}": ${reason}`); this.name = 'AssetError'; this.layer = layer; this.reason = reason; }
}

function checkBytes(bytes, mime, layer) {
  if (!SIGNATURES[mime]?.(bytes)) throw new AssetError(layer, `file is not a valid ${mime.replace('image/', '').toUpperCase()} image`);
  if (bytes.length > MAX_ASSET_BYTES) throw new AssetError(layer, `image is larger than ${MAX_ASSET_BYTES / 1024 / 1024} MB`);
}

// Decodes an embedded data URL. Exact bytes are preserved.
export function decodeDataUrl(url, layer) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if (!match) throw new AssetError(layer, 'embedded artwork is malformed or not a PNG, JPEG or WebP data URL');
  const base64 = match[2].replace(/\s+/g, '');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) throw new AssetError(layer, 'embedded artwork is empty');
  checkBytes(bytes, match[1], layer);
  return { mime: match[1], bytes };
}

// Resolves /assets/... under public/assets only. Rejects traversal, symlink escapes,
// unsupported extensions, missing files, and non-image contents.
export async function readProjectAsset(reference, layer) {
  if (!reference.startsWith('/assets/')) throw new AssetError(layer, `unsupported asset path "${reference}"`);
  let decoded;
  try { decoded = decodeURIComponent(reference.split('?')[0].split('#')[0]); }
  catch { throw new AssetError(layer, 'asset path is not valid URL encoding'); }
  if (decoded.includes('\0') || decoded.split(/[\\/]/).includes('..')) throw new AssetError(layer, 'asset path escapes the project asset directory');
  const mime = MIME_BY_EXT[extname(decoded).toLowerCase()];
  if (!mime) throw new AssetError(layer, `unsupported file type "${extname(decoded) || 'none'}" (use PNG, JPEG or WebP)`);
  const assetsDir = resolve(PUBLIC_ROOT, 'assets');
  const candidate = resolve(PUBLIC_ROOT, decoded.slice(1));
  if (!candidate.startsWith(assetsDir + sep)) throw new AssetError(layer, 'asset path escapes the project asset directory');
  let real;
  try { real = await realpath(candidate); }
  catch { throw new AssetError(layer, `file does not exist in the project assets (${reference})`); }
  const realAssets = await realpath(assetsDir);
  if (!real.startsWith(realAssets + sep)) throw new AssetError(layer, 'asset resolves outside the project asset directory');
  const bytes = await readFile(real);
  checkBytes(bytes, mime, layer);
  return { mime, bytes };
}

// Returns a data URL the renderer can load, regardless of where the artwork came from.
export async function resolveLayerAsset(layer) {
  const label = layer.name || layer.id;
  const reference = layer.asset;
  if (typeof reference !== 'string' || !reference) throw new AssetError(label, 'no artwork is attached');
  if (reference.startsWith('data:')) {
    const { mime, bytes } = decodeDataUrl(reference, label);
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }
  if (reference.startsWith('blob:')) throw new AssetError(label, 'artwork is a browser blob URL that the export worker cannot read; re-import the image');
  if (/^https?:/i.test(reference)) throw new AssetError(label, 'remote URLs are not fetched by the export service; import the image into the project');
  const { mime, bytes } = await readProjectAsset(reference, label);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}
