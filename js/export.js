// Turns the before/after bobble into a video for the gallery.

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
