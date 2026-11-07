// Audio worklet for TALK mode (loaded with audioWorklet.addModule): records the raw mic.

/** Hands every block of raw mic samples to the page. */
class TapeRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('tape-recorder', TapeRecorder);
