// Turns the before/after bobble into a video for the gallery, or into a looping GIF.
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js?v=202611072152';

/** 0 → 1 → 0 over one period, soft at both ends */
export const bobble = (phase) => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- video ----------
export function videoType(withAudio = false) {
  if (!window.MediaRecorder) return null;
  const list = withAudio
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4',
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const t of list) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

// the background music for LOOP videos, decoded once
let ac = null;
const songs = new Map();
async function song(url) {
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') await ac.resume();
  if (!songs.has(url)) {
    songs.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => new Promise((res, rej) => ac.decodeAudioData(b, res, rej))));
  }
  return songs.get(url);
}
// the song on the LOOP page: loops for as long as the page is open
let bgm = null;
let musicWanted = false;
export async function startMusic(url, muted) {
  musicWanted = true;
  if (bgm) return;
  let buf;
  try { buf = await song(url); } catch (e) { console.warn('music not loaded', e); return; }
  if (!musicWanted || bgm) return; // page left while loading
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ac.createGain();
  g.gain.value = muted ? 0 : 0.8;
  src.connect(g).connect(ac.destination);
  src.start();
  bgm = { src, g };
}
export function stopMusic() {
  musicWanted = false;
  if (!bgm) return;
  try { bgm.src.stop(); } catch (e) { /* already stopped */ }
  bgm.src.disconnect();
  bgm.g.disconnect();
  bgm = null;
}
export function suspendMusic() { if (ac && ac.state === 'running') ac.suspend(); }
export function resumeMusic() { if (ac && ac.state === 'suspended') ac.resume(); }

/**
 * Records the animation in real time. draw(phase) must render one frame onto `canvas`.
 * music: optional URL of a song that plays from `musicFrom` seconds and fades out at the end
 * (also out loud, unless muted). Resolves to { blob, ext }.
 */
export async function makeVideo(canvas, draw, period, minSeconds = 3, music = null, muted = false, musicFrom = 0) {
  let buf = null;
  if (music) { try { buf = await song(music); } catch (e) { console.warn('music not loaded', e); } }
  const type = videoType(!!buf);
  if (!type) throw new Error('This browser cannot record video');
  const loops = Math.max(2, Math.ceil(minSeconds / period));
  const stream = canvas.captureStream(30);
  const total = loops * period * 1000;
  let src = null, gain = null;
  if (buf) {
    const dest = ac.createMediaStreamDestination();
    src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    gain = ac.createGain();
    src.connect(gain);
    gain.connect(dest);
    if (!muted) gain.connect(ac.destination);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => { rec.onstop = res; });

  draw(0);
  rec.start();
  if (src) {
    const a0 = ac.currentTime, end = a0 + total / 1000;
    gain.gain.setValueAtTime(1, a0);
    gain.gain.setValueAtTime(1, Math.max(a0, end - 0.6));
    gain.gain.linearRampToValueAtTime(0, end); // fade out with the last bobble
    src.start(a0, musicFrom);
  }
  const t0 = performance.now();
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
  if (src) { try { src.stop(); } catch (e) { /* done */ } src.disconnect(); gain.disconnect(); }
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
