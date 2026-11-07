// Sound effects. The start voices are MP3s (same as STARSHOT), everything else is
// synthesized live with Web Audio, so every squish comes out a little different.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
const VOL = 0.9;

const rnd = (a, b) => a + Math.random() * (b - a);

export function initAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// A bank of decoded sounds; play() picks one at random, never the same twice in a row.
function makeBank(label) {
  const bufs = [];
  let last = -1;
  return {
    load(urls) {
      urls.forEach(async (url) => {
        try {
          const ab = await (await fetch(url)).arrayBuffer();
          bufs.push(await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)));
        } catch (e) {
          console.warn(label, 'not loaded', url, e);
        }
      });
    },
    /** returns the length in seconds, or 0 if nothing is loaded yet */
    play() {
      if (!bufs.length) return 0;
      let i = Math.floor(Math.random() * bufs.length);
      if (bufs.length > 1 && i === last) i = (i + 1 + Math.floor(Math.random() * (bufs.length - 1))) % bufs.length;
      last = i;
      const src = ctx.createBufferSource();
      src.buffer = bufs[i];
      src.connect(master);
      src.start();
      return bufs[i].duration;
    },
  };
}
const startBank = makeBank('start sound');
const endBank = makeBank('end sound');
export const loadVoices = (urls) => startBank.load(urls);
export const loadEnds = (urls) => endBank.load(urls);

/** Plays a random end sound for the last photo; falls back to the synth fart. Returns seconds. */
export function playEnd() {
  return endBank.play() || fart();
}

let resultBuf = null;
let resultSrc = null;

export async function loadResult(url) {
  try {
    const ab = await (await fetch(url)).arrayBuffer();
    resultBuf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
  } catch (e) {
    console.warn('result sound not loaded', url, e);
  }
}

/** Plays the result sound; returns false if it isn't loaded (caller falls back to the jingle). */
export function playResult() {
  if (!resultBuf) return false;
  stopResult();
  resultSrc = ctx.createBufferSource();
  resultSrc.buffer = resultBuf;
  resultSrc.connect(master);
  resultSrc.start();
  return true;
}

export function stopResult() {
  if (resultSrc) {
    try { resultSrc.stop(); } catch (e) { /* already stopped */ }
    resultSrc = null;
  }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : VOL, ctx.currentTime, 0.02);
}

/** Plays a random start sound, returns its length in seconds. */
export function playVoice() {
  const d = startBank.play();
  if (!d) { chu(); return 0.4; }
  return d;
}

// ---------- building blocks ----------

function env(t0, dur, vol = 0.3, attack = 0.005) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  return g;
}

function tone({ type = 'square', f = 440, f2 = null, dur = 0.2, vol = 0.25, t = 0, lin = false, dest = master }) {
  const t0 = ctx.currentTime + t;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) {
    if (lin) o.frequency.linearRampToValueAtTime(f2, t0 + dur);
    else o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  }
  const g = env(t0, dur, vol);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return o;
}

function vibrato(osc, rate, depth, t0, dur) {
  const l = ctx.createOscillator();
  const lg = ctx.createGain();
  l.frequency.value = rate;
  lg.gain.value = depth;
  l.connect(lg).connect(osc.frequency);
  l.start(t0);
  l.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.1, vol = 0.2, t = 0, type = 'highpass', f = 6000, f2 = null, q = 1, dest = master }) {
  const t0 = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f, t0);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  flt.Q.value = q;
  const g = env(t0, dur, vol, 0.002);
  s.connect(flt).connect(g).connect(dest);
  s.start(t0, Math.random());
  s.stop(t0 + dur + 0.05);
}

// ---------- UI sounds ----------

export function beep(high = false) {
  tone({ type: 'square', f: high ? 1320 : 660, dur: high ? 0.35 : 0.14, vol: 0.18 });
  tone({ type: 'square', f: high ? 1980 : 990, dur: high ? 0.35 : 0.14, vol: 0.06 });
}

export function kick(t = 0) {
  tone({ type: 'sine', f: 160, f2: 40, dur: 0.18, vol: 0.55, t });
}
export function hat(t = 0) {
  noise({ dur: 0.04, vol: 0.12, t, f: 8000 });
}
/** Schedules a simple four-on-the-floor beat. */
export function beat(beats, interval = 0.5, offset = 0) {
  for (let i = 0; i < beats; i++) {
    kick(offset + i * interval);
    hat(offset + i * interval + interval / 2);
  }
}

export function jingle() {
  [523, 659, 784, 1047, 1319].forEach((f, i) => {
    tone({ type: 'square', f, dur: 0.16, vol: 0.12, t: i * 0.09 });
    tone({ type: 'triangle', f: f / 2, dur: 0.16, vol: 0.15, t: i * 0.09 });
  });
  tone({ type: 'square', f: 1568, dur: 0.6, vol: 0.12, t: 0.5 });
  tone({ type: 'triangle', f: 784, dur: 0.6, vol: 0.18, t: 0.5 });
}

export function blip() {
  tone({ type: 'square', f: 660, f2: 1320, dur: 0.12, vol: 0.14 });
  tone({ type: 'square', f: 990, f2: 1980, dur: 0.12, vol: 0.08, t: 0.06 });
}

export function click() {
  tone({ type: 'square', f: 1200, f2: 600, dur: 0.05, vol: 0.12 });
}

// ---------- the funny ones ----------

function boing() {
  const t0 = ctx.currentTime;
  const o = tone({ type: 'sine', f: 330, f2: 90, dur: 0.6, vol: 0.45, lin: true });
  vibrato(o, 16, 70, t0, 0.6);
}
function quack() {
  [0, 0.17].forEach((t) => {
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = 1100; flt.Q.value = 3;
    flt.connect(master);
    tone({ type: 'sawtooth', f: 720, f2: 380, dur: 0.13, vol: 0.9, t, dest: flt });
  });
}
function laser() {
  tone({ type: 'square', f: 1900, f2: 110, dur: 0.28, vol: 0.2 });
  tone({ type: 'sawtooth', f: 1700, f2: 90, dur: 0.28, vol: 0.08 });
}
function slideUp() {
  const t0 = ctx.currentTime;
  const o = tone({ type: 'sine', f: 280, f2: 1600, dur: 0.5, vol: 0.4 });
  vibrato(o, 7, 25, t0, 0.5);
}
function slideDown() {
  const t0 = ctx.currentTime;
  const o = tone({ type: 'sine', f: 1500, f2: 220, dur: 0.55, vol: 0.4 });
  vibrato(o, 6, 30, t0, 0.55);
}
function honk() {
  [0, 0.26].forEach((t) => {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(master);
    tone({ type: 'sawtooth', f: 340, f2: 300, dur: 0.22, vol: 0.35, t, dest: lp });
    tone({ type: 'sawtooth', f: 345, f2: 304, dur: 0.22, vol: 0.35, t, dest: lp });
  });
}
function cowbell() {
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 1.2; bp.connect(master);
  tone({ type: 'square', f: 545, dur: 0.4, vol: 0.5, dest: bp });
  tone({ type: 'square', f: 815, dur: 0.4, vol: 0.5, dest: bp });
}
function coin() {
  tone({ type: 'square', f: 988, dur: 0.08, vol: 0.18 });
  tone({ type: 'square', f: 1319, dur: 0.4, vol: 0.18, t: 0.08 });
}
function spring() {
  const t0 = ctx.currentTime;
  const o = tone({ type: 'triangle', f: 500, f2: 260, dur: 0.7, vol: 0.45, lin: true });
  vibrato(o, 11, 180, t0, 0.7);
}
function pop() {
  tone({ type: 'sine', f: 1300, f2: 140, dur: 0.08, vol: 0.6 });
  noise({ dur: 0.05, vol: 0.25, f: 2000, type: 'bandpass' });
}
function kazoo() {
  const t0 = ctx.currentTime;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 4;
  bp.frequency.setValueAtTime(500, t0);
  bp.frequency.exponentialRampToValueAtTime(1400, t0 + 0.25);
  bp.frequency.exponentialRampToValueAtTime(600, t0 + 0.6);
  bp.connect(master);
  const o = tone({ type: 'sawtooth', f: 290, f2: 250, dur: 0.6, vol: 0.9, dest: bp });
  vibrato(o, 6, 8, t0, 0.6);
}
function chirps() {
  [0, 0.09, 0.18].forEach((t, i) => tone({ type: 'sine', f: 800 + i * 300, f2: 2000 + i * 400, dur: 0.08, vol: 0.3, t }));
}
export function chu() {
  tone({ type: 'sine', f: 2200, f2: 500, dur: 0.07, vol: 0.4 });
  noise({ dur: 0.03, vol: 0.2, f: 3000, type: 'bandpass', q: 2 });
}
function scratch() {
  noise({ dur: 0.12, vol: 0.5, type: 'bandpass', f: 3500, f2: 600, q: 3 });
  noise({ dur: 0.16, vol: 0.5, type: 'bandpass', f: 500, f2: 2500, q: 3, t: 0.13 });
}
function wobble() {
  const t0 = ctx.currentTime;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 12; lp.frequency.value = 600; lp.connect(master);
  const l = ctx.createOscillator(); const lg = ctx.createGain();
  l.frequency.value = 8; lg.gain.value = 500; l.connect(lg).connect(lp.frequency);
  l.start(t0); l.stop(t0 + 0.6);
  tone({ type: 'sawtooth', f: 75, dur: 0.55, vol: 0.6, dest: lp });
}

export const FUNNY = [boing, quack, laser, slideUp, slideDown, honk, cowbell, coin, spring, pop, kazoo, chirps, chu, scratch, wobble];

// ---------- the grand finale ----------

export function fart() {
  const t0 = ctx.currentTime;
  const kind = Math.random();
  const dur = rnd(0.7, 1.5);
  const base = kind < 0.2 ? rnd(160, 240) : rnd(60, 110); // squeaker or tuba

  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const n = 48;
  const curve = new Float32Array(n);
  let f = base * 1.25;
  for (let i = 0; i < n; i++) {
    f *= 1 + rnd(-0.09, 0.07);
    f = Math.min(Math.max(f, base * 0.55), base * 1.8);
    curve[i] = f * (1 - (i / n) * 0.35);
  }
  o.frequency.setValueCurveAtTime(curve, t0, dur);

  // the flutter
  const am = ctx.createGain();
  am.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.type = kind > 0.75 ? 'square' : 'sine'; // machine gun mode
  lfo.frequency.setValueAtTime(rnd(22, 34), t0);
  lfo.frequency.linearRampToValueAtTime(rnd(10, 18), t0 + dur);
  const lg = ctx.createGain();
  lg.gain.value = 0.5;
  lfo.connect(lg).connect(am.gain);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 6;
  lp.frequency.setValueAtTime(1100, t0);
  lp.frequency.exponentialRampToValueAtTime(260, t0 + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1.0, t0 + 0.03);
  g.gain.setValueAtTime(1.0, t0 + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  o.connect(lp).connect(am).connect(g).connect(master);

  // wet noise layer
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = base * 2.5; bp.Q.value = 1.5;
  const ng = ctx.createGain();
  ng.gain.value = 0.35;
  s.connect(bp).connect(ng).connect(am);

  [o, lfo, s].forEach((x) => { x.start(t0); x.stop(t0 + dur + 0.1); });

  // little "pfft" at the end
  noise({ dur: 0.18, vol: 0.25, type: 'bandpass', f: 900, f2: 300, q: 1, t: dur - 0.05 });
  return dur;
}

// ---------- goo sounds ----------

/** A short wet squish, played every few px while smearing. */
export function squish() {
  if (!ctx) return;
  tone({ type: 'sine', f: rnd(180, 340), f2: rnd(55, 110), dur: rnd(0.07, 0.12), vol: 0.3 });
  noise({ dur: 0.06, vol: 0.1, type: 'bandpass', f: rnd(500, 1300), f2: 220, q: 4 });
}

/**
 * A held, wobbly tone while a GROW / SHRINK / SWIRL / UNGOO brush is pressed.
 * kind: 'grow' rises, 'shrink' falls, 'swirl' warbles, 'ungoo' sighs. Returns stop().
 */
export function gooHold(kind) {
  if (!ctx) return () => {};
  const t0 = ctx.currentTime;
  const P = {
    grow: { f0: 120, f1: 900, type: 'triangle', lfo: 9, depth: 30, cut: 1400 },
    shrink: { f0: 800, f1: 70, type: 'triangle', lfo: 11, depth: 25, cut: 1400 },
    swirl: { f0: 260, f1: 380, type: 'sawtooth', lfo: 6, depth: 90, cut: 900 },
    ungoo: { f0: 500, f1: 180, type: 'sine', lfo: 4, depth: 15, cut: 2000 },
  }[kind];
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 8; lp.frequency.value = P.cut;
  lp.connect(master);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05);
  g.connect(lp);
  const o = ctx.createOscillator();
  o.type = P.type;
  o.frequency.setValueAtTime(P.f0, t0);
  o.frequency.exponentialRampToValueAtTime(P.f1, t0 + 2.2);
  const l = ctx.createOscillator(), lg = ctx.createGain();
  l.frequency.value = P.lfo; lg.gain.value = P.depth;
  l.connect(lg).connect(o.frequency);
  o.connect(g);
  o.start(t0); l.start(t0);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.04);
    o.stop(t + 0.3); l.stop(t + 0.3);
  };
}

/** Camera shutter: click + chu. */
export function shutter() {
  noise({ dur: 0.05, vol: 0.4, type: 'highpass', f: 3000 });
  tone({ type: 'square', f: 1800, f2: 400, dur: 0.06, vol: 0.12, t: 0.05 });
  chu();
}

/** Undo / reset: a little reverse boing. */
export function rewind() {
  tone({ type: 'triangle', f: 900, f2: 200, dur: 0.25, vol: 0.3 });
}

/** pause / continue everything (page in the background, share sheet open) */
export function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
