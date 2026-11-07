// Background removal with MediaPipe Selfie Segmentation, fully self-hosted in
// assets/mediapipe/ so the photo never leaves the phone.

const BASE = 'assets/mediapipe/';
let seg = null;
let pending = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

/** loads the model once; call early so the first cut is quick */
export async function prepare() {
  if (seg) return seg;
  if (!window.SelfieSegmentation) await loadScript(`${BASE}selfie_segmentation.js`);
  const s = new window.SelfieSegmentation({ locateFile: (f) => `${BASE}${f}` });
  s.setOptions({ modelSelection: 0, selfieMode: false });
  s.onResults((r) => { if (pending) { pending(r.segmentationMask); pending = null; } });
  await s.initialize();
  seg = s;
  return seg;
}

/**
 * Returns a new canvas, same size as `photo`, with everything that isn't a person
 * made transparent. Edges are feathered a little so the goo doesn't look jaggy.
 */
export async function cutout(photo) {
  const s = await prepare();
  const mask = await new Promise((res, rej) => {
    pending = res;
    s.send({ image: photo }).catch(rej);
  });
  const W = photo.width, H = photo.height;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d');
  // the model's mask is soft and small (256 px); sharpen it a bit, then feather
  const m = document.createElement('canvas');
  m.width = W; m.height = H;
  const mg = m.getContext('2d');
  mg.filter = 'blur(3px)';
  mg.drawImage(mask, 0, 0, W, H);
  const id = mg.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    // confidence lives in red (and alpha); push it towards 0/1 around 0.5
    const c = Math.max(d[i], d[i + 3] < 255 ? d[i + 3] : 0) / 255;
    const a = Math.max(0, Math.min(1, (c - 0.5) / 0.25)); // slightly eroded: less halo
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  mg.putImageData(id, 0, 0);
  g.drawImage(m, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.drawImage(photo, 0, 0);
  // how much person is in there? (0..1) — lets the app say "nobody found"
  let sum = 0;
  for (let i = 3; i < d.length; i += 64) sum += d[i];
  out.coverage = sum / (255 * (d.length / 64));
  return out;
}
