// Turns the before/after bobble into a video for the gallery, or into a looping GIF.
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js?v=202611072120';

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

// ---------- GIF ----------
/**
 * One bobble as a looping GIF. draw(phase) must render one frame onto `canvas`
 * (any size); the GIF is scaled down to `width` px wide. Resolves to a Blob.
 */
export async function makeGif(canvas, draw, period, width = 480) {
  const w = width, h = Math.round((canvas.height / canvas.width) * width);
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  const sg = small.getContext('2d', { willReadFrequently: true });
  const fps = 15;
  const n = Math.max(8, Math.min(60, Math.round(period * fps)));
  const delay = Math.round((period * 1000) / n / 10) * 10; // GIFs count in 1/100 s
  const frames = [];
  for (let i = 0; i < n; i++) {
    draw(i / n);
    sg.drawImage(canvas, 0, 0, w, h);
    frames.push(sg.getImageData(0, 0, w, h).data);
    if (i % 6 === 5) await wait(0); // keep the page responsive
  }
  // one shared palette from a few frames, so colours don't flicker between frames
  const sample = new Uint8ClampedArray(w * h * 4);
  const picks = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)];
  const band = Math.floor(h / picks.length);
  picks.forEach((f, k) => sample.set(frames[f].subarray(k * band * w * 4, (k + 1) * band * w * 4), k * band * w * 4));
  const palette = quantize(sample, 256);
  const gif = GIFEncoder();
  for (let i = 0; i < n; i++) {
    gif.writeFrame(applyPalette(frames[i], palette), w, h, { palette: i === 0 ? palette : undefined, delay, repeat: 0 });
    if (i % 6 === 5) await wait(0);
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
