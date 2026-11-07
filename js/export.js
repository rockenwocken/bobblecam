// Turns the before/after bobble into files: a video for the gallery and an
// animated WebP in WhatsApp sticker format (512×512, transparent, ≤ 500 KB).

/** 0 → 1 → 0 over one period, soft at both ends */
export const bobble = (phase) => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- video ----------
export function videoType() {
  if (!window.MediaRecorder) return null;
  for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

/**
 * Records the animation in real time. draw(phase) must render one frame onto `canvas`.
 * Resolves to { blob, ext }.
 */
export async function makeVideo(canvas, draw, period, minSeconds = 3) {
  const type = videoType();
  if (!type) throw new Error('This browser cannot record video');
  const loops = Math.max(2, Math.ceil(minSeconds / period));
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => { rec.onstop = res; });

  draw(0);
  rec.start();
  const t0 = performance.now(), total = loops * period * 1000;
  await new Promise((res) => {
    const step = (t) => {
      const el = t - t0;
      draw(Math.min(el, total) / (period * 1000));
      if (el < total + 60) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: type.split(';')[0] });
  return { blob, ext: type.includes('mp4') ? 'mp4' : 'webm' };
}

// ---------- animated WebP sticker ----------
const S = 512;
const MAX_BYTES = 500 * 1024;

/** sticker look: the photo as a rounded card with a white rim on a transparent square */
function stickerFrame(ctx, src) {
  const h = S - 28, w = Math.round((h * src.width) / src.height);
  const x = (S - w) / 2, y = (S - h) / 2, r = 40;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(18,6,32,.35)';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 10, w - 20, h - 20, r - 10);
  ctx.clip();
  ctx.drawImage(src, x + 10, y + 10, w - 20, h - 20);
  ctx.restore();
}

/** splits a RIFF/WEBP file into its chunks */
function chunks(buf) {
  const v = new DataView(buf), out = [];
  for (let o = 12; o + 8 <= buf.byteLength;) {
    const id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    const size = v.getUint32(o + 4, true);
    out.push({ id, data: new Uint8Array(buf, o + 8, size) });
    o += 8 + size + (size & 1);
  }
  return out;
}

function chunk(id, data) {
  const pad = data.length & 1;
  const out = new Uint8Array(8 + data.length + pad);
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}
const u24 = (a, o, n) => { a[o] = n & 255; a[o + 1] = (n >> 8) & 255; a[o + 2] = (n >> 16) & 255; };
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

function assemble(frames, ms) {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02 | 0x10; // animation + alpha
  u24(vp8x, 4, S - 1); u24(vp8x, 7, S - 1);
  const anim = new Uint8Array(6); // transparent background, loop forever
  const parts = [chunk('VP8X', vp8x), chunk('ANIM', anim)];
  for (const f of frames) {
    const head = new Uint8Array(16);
    u24(head, 6, S - 1); u24(head, 9, S - 1); u24(head, 12, ms);
    head[15] = 0x02; // replace the previous frame, don't blend
    const body = chunks(f).filter((c) => c.id === 'ALPH' || c.id === 'VP8 ' || c.id === 'VP8L').map((c) => chunk(c.id, c.data));
    parts.push(chunk('ANMF', concat([head, ...body])));
  }
  const payload = concat(parts);
  const riff = new Uint8Array(12);
  riff.set([82, 73, 70, 70], 0); // RIFF
  new DataView(riff.buffer).setUint32(4, payload.length + 4, true);
  riff.set([87, 69, 66, 80], 8); // WEBP
  return new Blob([riff, payload], { type: 'image/webp' });
}

/**
 * render(amt) must draw the goo at that amount onto src (a W×H canvas).
 * Picks frame count and quality so the sticker stays under WhatsApp's 500 KB.
 */
export async function makeSticker(src, render, period) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const enc = (q) => new Promise((res) => cv.toBlob(res, 'image/webp', q));
  const test = await enc(0.8);
  if (!test || test.type !== 'image/webp') throw new Error('This browser cannot make WebP');

  const loopMs = Math.min(10000, Math.round(period * 1000));
  for (const [n, q] of [[20, 0.8], [16, 0.7], [14, 0.6], [12, 0.5], [10, 0.4], [8, 0.3]]) {
    const ms = Math.max(20, Math.round(loopMs / n));
    const frames = [];
    let bytes = 0;
    for (let i = 0; i < n; i++) {
      render(bobble(i / n));
      stickerFrame(ctx, src);
      const b = await enc(q);
      bytes += b.size;
      if (bytes > MAX_BYTES) break;
      frames.push(await b.arrayBuffer());
      if (i % 4 === 3) await wait(0); // keep the page responsive
    }
    if (frames.length === n) {
      const blob = assemble(frames, ms);
      if (blob.size <= MAX_BYTES) return blob;
    }
  }
  throw new Error('Sticker too big');
}
