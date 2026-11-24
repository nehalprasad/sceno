import { cacheDirectory, deleteAsync, downloadAsync, EncodingType, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Photo } from '@/services';

// ---- Tiny "stored" (no compression) ZIP writer. JPEGs don't shrink further, so storing is as small and much faster. ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function fromB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255; if (clean[i + 2] !== undefined && o < out.length) out[o++] = (n >> 8) & 255; if (clean[i + 3] !== undefined && o < out.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}
function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return s;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = (s: string) => Uint8Array.from(unescape(encodeURIComponent(s)), (ch) => ch.charCodeAt(0));
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const f of files) {
    const name = enc(f.name); const crc = crc32(f.data); const size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true);
    h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true);
    c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    locals.push(new Uint8Array(h.buffer), name, f.data); centrals.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = centrals.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(e.buffer)];
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0)); let p = 0;
  for (const x of parts) { out.set(x, p); p += x.length; }
  return out;
}

/** Downloads one part's photos, zips them on the phone (nothing extra in the cloud), and opens the share sheet to save or send. */
export async function zipAndShare(fileBase: string, photos: Photo[], onProgress: (done: number, total: number) => void, cancelled: () => boolean): Promise<'done' | 'cancelled' | 'empty'> {
  if (!photos.length) return 'empty';
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < photos.length; i++) {
    if (cancelled()) return 'cancelled';
    const tmp = `${cacheDirectory}zip-${photos[i].id.replace(/[^\w-]/g, '')}.jpg`;
    try {
      const r = await downloadAsync(photos[i].uri, tmp);
      if (r.status < 400) files.push({ name: `${String(i + 1).padStart(3, '0')}.jpg`, data: fromB64(await readAsStringAsync(tmp, { encoding: EncodingType.Base64 })) });
    } catch { /* skip a photo that fails; the rest still zip */ }
    await deleteAsync(tmp, { idempotent: true }).catch(() => {});
    onProgress(i + 1, photos.length);
  }
  if (cancelled()) return 'cancelled';
  const out = `${cacheDirectory}${fileBase.replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '-') || 'sceno'}.zip`;
  await writeAsStringAsync(out, toB64(zipStore(files)), { encoding: EncodingType.Base64 });
  await Sharing.shareAsync(out, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle: fileBase });
  return 'done';
}
