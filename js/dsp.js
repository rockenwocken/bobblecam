// Sound processing for TALK takes: loudness normalising, the loudness envelope
// that drives the goo, and a clean pitch shifter.

/**
 * Brings a take to a solid speaking volume: measures the loudness of the parts
 * where something is said, raises (or lowers) it to about -16 dB RMS and catches
 * the peaks with a soft limiter, so nothing clips.
 */
export function normalize(x, sr) {
  const win = Math.round(sr * 0.05);
  const rmsList = [];
  for (let i = 0; i + win <= x.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += x[j] * x[j];
    rmsList.push(Math.sqrt(s / win));
  }
  if (!rmsList.length) return x;
  // loudness of the voiced part: the louder 40% of the 50 ms blocks
  const sorted = [...rmsList].sort((a, b) => a - b);
  const voiced = sorted.slice(Math.floor(sorted.length * 0.6));
  const rms = Math.sqrt(voiced.reduce((s, v) => s + v * v, 0) / voiced.length) || 1e-6;
  const gain = Math.min(30, Math.max(0.3, 0.158 / rms)); // 0.158 ≈ -16 dBFS
  const out = new Float32Array(x.length);
  const knee = 0.6;
  for (let i = 0; i < x.length; i++) {
    let v = x[i] * gain;
    const a = Math.abs(v);
    if (a > knee) v = Math.sign(v) * (knee + (0.89 - knee) * Math.tanh((a - knee) / (0.89 - knee))); // never above 0.89
    out[i] = v;
  }
  // tiny fades so the loop doesn't click
  const f = Math.min(out.length >> 1, Math.round(sr * 0.008));
  for (let i = 0; i < f; i++) { const g = i / f; out[i] *= g; out[out.length - 1 - i] *= g; }
  return out;
}

/** loudness 0..1 at 60 steps per second, with the same jumpy feel as the live meter */
export function envelope(x, sr) {
  const fps = 60, win = 1024, env = [];
  let level = 0;
  for (let k = 0; ; k++) {
    const t = k / fps;
    const c = Math.round(t * sr);
    if (c >= x.length) break;
    const a = Math.max(0, c - (win >> 1)), b = Math.min(x.length, a + win);
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    const db = 20 * Math.log10(Math.sqrt(s / Math.max(1, b - a)) + 1e-8);
    const target = Math.max(0, Math.min(1, (db + 52) / 34));
    level = target > level ? target : level + (target - level) * 0.45;
    env.push([t, level]);
  }
  return env;
}

// ---------- pitch shift: resample, then WSOLA back to the original length ----------

/** plays x back `speed` times faster (higher + shorter), with a gentle anti-alias filter */
function resample(x, speed) {
  let src = x;
  if (speed > 1) {
    // simple low-pass before speeding up, so high pitches don't turn into hiss
    const taps = Math.min(15, Math.ceil(speed * 3) | 1);
    const h = new Float32Array(taps);
    const fc = 0.5 / speed;
    let sum = 0;
    for (let i = 0; i < taps; i++) {
      const n = i - (taps - 1) / 2;
      const sinc = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
      h[i] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)));
      sum += h[i];
    }
    for (let i = 0; i < taps; i++) h[i] /= sum;
    src = new Float32Array(x.length);
    const half = (taps - 1) >> 1;
    for (let i = 0; i < x.length; i++) {
      let s = 0;
      for (let k = 0; k < taps; k++) {
        const j = i + k - half;
        if (j >= 0 && j < x.length) s += x[j] * h[k];
      }
      src[i] = s;
    }
  }
  const n = Math.floor(x.length / speed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * speed, i0 = p | 0, f = p - i0;
    const a = src[i0] || 0, b = src[i0 + 1] || 0;
    out[i] = a + (b - a) * f;
  }
  return out;
}

/**
 * WSOLA time stretch: makes x `factor` times longer without changing its pitch.
 * Every new grain is taken from where it lines up best with the previous one,
 * so syllables stay whole instead of being chopped or swallowed.
 */
function wsola(x, factor, sr, grain = 0.03) {
  const N = Math.round(sr * grain) & ~1; // grain length
  const Hs = N >> 1; // 50% overlap in the output
  const Ha = Hs / factor; // hop through the input
  const tol = Math.round(sr * 0.009); // ±9 ms search
  const outLen = Math.ceil(x.length * factor);
  const out = new Float32Array(outLen + N);
  const norm = new Float32Array(outLen + N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const at = (i) => (i >= 0 && i < x.length ? x[i] : 0);
  const D = 4; // correlate on every 4th sample: fast enough for a phone

  let prev = 0;
  for (let k = 0; k * Hs < outLen; k++) {
    let pos;
    if (k === 0) pos = 0;
    else {
      const nominal = Math.round(k * Ha);
      const natural = prev + Hs; // where the previous grain would naturally continue
      let best = nominal, bestC = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const c0 = nominal + d;
        let c = 0;
        for (let i = 0; i < Hs; i += D) c += at(natural + i) * at(c0 + i);
        if (c > bestC) { bestC = c; best = c0; }
      }
      pos = best;
    }
    const o = k * Hs;
    for (let i = 0; i < N; i++) {
      out[o + i] += at(pos + i) * win[i];
      norm[o + i] += win[i];
    }
    prev = pos;
  }
  const res = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
  return res;
}

/** pitch shift by `semis` semitones, same length as x */
export function pitchShift(x, sr, semis) {
  if (!semis) return x;
  const r = Math.pow(2, semis / 12);
  const y = resample(x, r); // r× higher, 1/r as long
  // grains: shorter when going up (keeps the rhythm crisp), 30 ms when going down
  // (long enough to hold a whole slowed-down voice period)
  const grain = r > 1 ? Math.max(0.01, 0.03 / r) : 0.03;
  const z = wsola(y, x.length / y.length, sr, grain); // back to the original length
  const out = new Float32Array(x.length);
  out.set(z.subarray(0, Math.min(z.length, x.length)));
  // the shifting can push single peaks up again: keep headroom for the video encoder
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.89) { const g = 0.89 / peak; for (let i = 0; i < out.length; i++) out[i] *= g; }
  return out;
}
