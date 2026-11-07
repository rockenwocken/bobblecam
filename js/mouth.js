// TALK mode: the microphone drives the goo. Loud = full "after", quiet = "before".
// A take keeps the raw sound plus a loudness envelope, so it can be replayed
// with a different pitch while the picture flaps along exactly as recorded.

let ac = null;
let mic = null;
let micSrc = null;
let analyser = null;
let data = null;
let level = 0;
let workletsReady = null;

/** asks for the mic (silently if it was granted at start) and starts listening */
export async function openMic() {
  if (mic) return;
  mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
    video: false,
  });
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') await ac.resume();
  workletsReady = workletsReady || ac.audioWorklet.addModule('js/worklets.js');
  await workletsReady;
  micSrc = ac.createMediaStreamSource(mic);
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  micSrc.connect(analyser);
  data = new Float32Array(analyser.fftSize);
}

export function closeMic() {
  stopPlayback();
  if (mic) mic.getTracks().forEach((t) => t.stop());
  mic = null;
  micSrc = null;
  analyser = null;
  level = 0;
}

/**
 * Loudness 0..1, call once per frame. Jumpy on purpose: snaps up instantly,
 * drops fast, so the picture flaps along with every syllable.
 */
export function readLevel() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  const db = 20 * Math.log10(Math.sqrt(sum / data.length) + 1e-8);
  const target = Math.max(0, Math.min(1, (db + 52) / 34)); // -52 dB = silent, -18 dB = full goo
  level = target > level ? target : level + (target - level) * 0.45;
  return level;
}

// ---------- recording a take ----------
let tape = null;

export function startTake() {
  const node = new AudioWorkletNode(ac, 'tape-recorder');
  const mute = ac.createGain();
  mute.gain.value = 0;
  const chunks = [];
  node.port.onmessage = (e) => chunks.push(e.data);
  micSrc.connect(node);
  node.connect(mute).connect(ac.destination); // has to be pulled by the graph to run
  tape = { node, mute, chunks, t0: ac.currentTime, env: [] };
}

/** call every frame while recording */
export function logLevel(l) {
  if (tape) tape.env.push([ac.currentTime - tape.t0, l]);
}
export const takeTime = () => (tape ? ac.currentTime - tape.t0 : 0);

/** returns { buf, env, dur } */
export function stopTake() {
  const t = tape;
  tape = null;
  if (!t) return null;
  micSrc.disconnect(t.node);
  t.node.disconnect();
  t.mute.disconnect();
  const n = t.chunks.reduce((s, c) => s + c.length, 0);
  const buf = ac.createBuffer(1, Math.max(1, n), ac.sampleRate);
  const ch = buf.getChannelData(0);
  let o = 0;
  for (const c of t.chunks) { ch.set(c, o); o += c.length; }
  return { buf, env: t.env, dur: buf.duration };
}

/** loudness of a take at time t (s), interpolated */
export function levelAt(take, t) {
  const e = take.env;
  if (!e.length) return 0;
  let lo = 0, hi = e.length - 1;
  if (t <= e[0][0]) return e[0][1];
  if (t >= e[hi][0]) return e[hi][1];
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (e[m][0] <= t) lo = m; else hi = m;
  }
  const [t0, l0] = e[lo], [t1, l1] = e[hi];
  return l0 + ((t - t0) / (t1 - t0 || 1)) * (l1 - l0);
}

// ---------- playback with pitch ----------
const ratioOf = (semis) => Math.pow(2, semis / 12);
let play = null;

/** loops the take through the pitch shifter; clock() gives the position in the take (s) */
export function startPlayback(take, semis, muted) {
  stopPlayback();
  const src = ac.createBufferSource();
  src.buffer = take.buf;
  src.loop = true;
  const ps = new AudioWorkletNode(ac, 'pitch-shifter');
  ps.parameters.get('ratio').value = ratioOf(semis);
  const g = ac.createGain();
  g.gain.value = muted ? 0 : 1;
  src.connect(ps).connect(g).connect(ac.destination);
  const t0 = ac.currentTime + 0.02;
  src.start(t0);
  play = { src, ps, g, t0, dur: take.dur };
}
export function setPitch(semis) {
  if (play) play.ps.parameters.get('ratio').setValueAtTime(ratioOf(semis), ac.currentTime);
}
export function setPlaybackMuted(m) {
  if (play) play.g.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.02);
}
export function playClock() {
  if (!play) return -1;
  const t = ac.currentTime - play.t0;
  return t < 0 ? 0 : t % play.dur;
}
export function stopPlayback() {
  if (!play) return;
  try { play.src.stop(); } catch (e) { /* not started */ }
  play.src.disconnect();
  play.ps.disconnect();
  play.g.disconnect();
  play = null;
}

// ---------- export: picture + pitched sound as one video ----------
function recType() {
  for (const t of [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // H.264 + AAC: plays everywhere
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1,opus',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]) if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

/**
 * Plays the take once with the given pitch (also out loud) and records `canvas` with it.
 * onFrame(t) must draw the picture for take time t onto canvas. Resolves to { blob, ext }.
 */
export async function exportTake(take, semis, canvas, onFrame, muted) {
  const type = recType();
  if (!type) throw new Error('This browser cannot record video');
  stopPlayback();
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  src.buffer = take.buf;
  const ps = new AudioWorkletNode(ac, 'pitch-shifter');
  ps.parameters.get('ratio').value = ratioOf(semis);
  const g = ac.createGain();
  g.gain.value = muted ? 0 : 1;
  src.connect(ps);
  ps.connect(dest);
  ps.connect(g).connect(ac.destination);

  onFrame(0);
  const vs = canvas.captureStream(30);
  const rec = new MediaRecorder(new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]),
    { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start(250);
  const t0 = ac.currentTime + 0.05;
  src.start(t0);
  const tail = 0.12; // let the shifter's short delay run out
  await new Promise((res) => {
    const step = () => {
      const t = ac.currentTime - t0;
      onFrame(Math.max(0, Math.min(t, take.dur)));
      if (t < take.dur + tail) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await done;
  vs.getTracks().forEach((t) => t.stop());
  src.disconnect(); ps.disconnect(); g.disconnect();
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}

/** pause / continue the take playback with the rest of the page */
export function suspendAudio() { if (ac && ac.state === 'running') ac.suspend(); }
export function resumeAudio() { if (ac && ac.state === 'suspended') ac.resume(); }
