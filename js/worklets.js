// Audio worklets for TALK mode (loaded with audioWorklet.addModule).

/**
 * Pitch shifter that keeps the length: two read heads sweep through a short delay
 * line faster (higher) or slower (lower) than real time and cross-fade, so the
 * sound gets higher/lower without getting shorter/longer. Gets robotic at the
 * extremes, which is half the fun.
 */
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.size = 16384;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.phase = 0;
    this.win = Math.round(sampleRate * 0.05); // 50 ms grains
  }

  process(inputs, outputs, params) {
    const inp = inputs[0] && inputs[0][0];
    const outs = outputs[0];
    if (!outs || !outs[0]) return true;
    const out = outs[0];
    const ratio = params.ratio[0];
    const { buf, size, win } = this;
    const step = (1 - ratio) / win;
    for (let i = 0; i < out.length; i++) {
      buf[this.w] = inp ? inp[i] : 0;
      this.phase += step;
      this.phase -= Math.floor(this.phase);
      let y = 0;
      for (let k = 0; k < 2; k++) {
        let p = this.phase + k * 0.5;
        if (p >= 1) p -= 1;
        let rp = this.w - (p * win + 1);
        if (rp < 0) rp += size;
        const i0 = rp | 0, f = rp - i0;
        const a = buf[i0], b = buf[(i0 + 1) % size];
        const g = Math.sin(Math.PI * p);
        y += (a + (b - a) * f) * g * g; // sin² + cos² = 1: the two heads always add up to full volume
      }
      out[i] = y;
      this.w = (this.w + 1) % size;
    }
    for (let c = 1; c < outs.length; c++) outs[c].set(out);
    return true;
  }
}
registerProcessor('pitch-shifter', PitchShifter);

/** Hands every block of raw mic samples to the page. */
class TapeRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('tape-recorder', TapeRecorder);
