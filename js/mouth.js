// TALK mode: the microphone drives the goo. Loud = full "after", quiet = "before".
// Also records the canvas plus the mic into one video.

let ac = null;
let mic = null;
let analyser = null;
let data = null;
let level = 0;

/** asks for the mic (silently if it was granted at start) and starts listening */
export async function openMic() {
  if (mic) return;
  mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
    video: false,
  });
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') await ac.resume();
  const src = ac.createMediaStreamSource(mic);
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  src.connect(analyser);
  data = new Float32Array(analyser.fftSize);
}

export function closeMic() {
  if (mic) mic.getTracks().forEach((t) => t.stop());
  mic = null;
  analyser = null;
  level = 0;
}

export const micStream = () => mic;

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

// ---------- recording ----------
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

/** starts recording `canvas` (30 fps) together with the mic; returns stop() → Promise<{blob, ext}> */
export function startRecording(canvas) {
  const type = recType();
  if (!type) throw new Error('This browser cannot record video');
  const vs = canvas.captureStream(30);
  const tracks = [...vs.getVideoTracks()];
  if (mic) tracks.push(...mic.getAudioTracks());
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start(250);
  return async () => {
    if (rec.state !== 'inactive') rec.stop();
    await done;
    vs.getTracks().forEach((t) => t.stop());
    return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
  };
}
