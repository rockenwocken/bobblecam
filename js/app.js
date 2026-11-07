import * as sfx from './sfx.js';
import { START_SOUNDS } from './start-sounds.js';
import { Goo } from './goo.js';
import { bobble, makeVideo, makeSticker } from './export.js';
import { prepare as prepareCut, cutout } from './cutout.js';

// ---------- config ----------
const W = 1080, H = 1440;
const COUNT_STEP = 450; // ms per countdown number
const VOICE_WAIT = 1.3; // s of start voice before the countdown kicks in (the voice keeps playing)
const R_MIN = 30, R_MAX = 520;
const RATE = { grow: 1.1, shrink: 1.1, swirl: 2.6, ungoo: 3.5 }; // per second while held

// ---------- dom ----------
const $ = (s) => document.querySelector(s);
const app = $('#app');
const camCv = $('#cam');
const camG = camCv.getContext('2d');
const gooCv = $('#goo');
const video = $('#video');
const screenEl = $('#screen');
const stage = $('#stage');
const banner = $('#banner');
const countEl = $('#count');
const flashEl = $('#flash');
const ring = $('#ring');
const btnShoot = $('#btn-shoot');
const btnFlip = $('#btn-flip');
const btnMute = $('#btn-mute');
const btnCut = $('#btn-cut');
const bgCv = $('#bg');
const btnUndo = $('#btn-undo');
const btnSize = $('#btn-size');
const btnAgain = $('#btn-again');
const speedEl = $('#speed');
const btnVSave = $('#btn-vsave');
const btnVShare = $('#btn-vshare');
const btnSticker = $('#btn-sticker');

// ---------- state ----------
let facing = 'user';
let stream = null;
let state = 'title'; // title | ready | running | goo
let muted = false;
let goo = null;
let tool = 'smear';
let brushR = 150;
let swirlDir = 1; // 1 = clockwise, -1 = counter-clockwise
let sizeMode = false;
let phase = 0; // before/after animation
let busy = false;
let cutBg = true; // remove the background after the shot?
let isCut = false; // is the current photo cut out?
try { cutBg = localStorage.getItem('bobblecam.cut') !== '0'; } catch (e) { /* no storage */ }
let ready = null; // { kind, blob, name } waiting for a second tap
let exportsCache = {}; // kind → { key, blob, name }
let pointer = null; // { id, x, y, stop?, travel }
let lastT = 0;
let confirmNew = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const radius = () => brushR;

// ---------- overlays ----------
let bannerTimer = 0;
function showBanner({ text, tag = '' }, ms = 0) {
  clearTimeout(bannerTimer);
  banner.querySelector('.banner-text').textContent = text;
  banner.querySelector('.banner-tag').textContent = tag;
  banner.classList.remove('hidden');
  banner.style.animation = 'none';
  void banner.offsetWidth;
  banner.style.animation = '';
  if (ms) bannerTimer = setTimeout(hideBanner, ms);
}
function hideBanner() { banner.classList.add('hidden'); }

function showCount(t) {
  countEl.textContent = t;
  countEl.classList.toggle('go', t.length > 1);
  countEl.classList.remove('hidden');
  countEl.style.animation = 'none';
  void countEl.offsetWidth;
  countEl.style.animation = '';
}


// ---------- camera ----------
async function startCamera() {
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play().catch(() => {});
}
function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

/** draws the current video frame, cover-cropped to 3:4 and mirrored for the selfie cam */
function drawFrame() {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s;
  camG.save();
  if (facing === 'user') { camG.translate(W, 0); camG.scale(-1, 1); }
  camG.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  camG.restore();
}

// ---------- flow ----------
function setMode(m) { app.className = `mode-${m}${isCut ? ' cut' : ''}`; }

function updateCut() {
  btnCut.classList.toggle('cutting', cutBg);
  btnCut.querySelector('small').textContent = cutBg ? 'NO BG' : 'BG ON';
}

/** the arcade backdrop shown behind a cut-out photo (and baked into the video) */
function paintBackdrop() {
  const g = bgCv.getContext('2d');
  const cx = W / 2, cy = H * 0.42, R = Math.hypot(W, H);
  g.fillStyle = '#3d1170';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 36; i += 2) {
    const a0 = (i / 36) * Math.PI * 2, a1 = ((i + 1) / 36) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, a0, a1);
    g.closePath();
    g.fillStyle = '#ff2e88';
    g.fill();
  }
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, W * 0.7);
  glow.addColorStop(0, 'rgba(255,230,0,.85)');
  glow.addColorStop(0.35, 'rgba(255,122,0,.35)');
  glow.addColorStop(1, 'rgba(122,44,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.18)';
  for (let y = 0; y < H; y += 36) for (let x = (y / 36) % 2 ? 18 : 0; x < W; x += 36) {
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
}
function toCamera() {
  state = 'ready';
  setMode('cam');
  btnShoot.disabled = false;
  btnFlip.disabled = false;
  btnCut.disabled = false;
  hideBanner();
  ring.classList.add('hidden');
  fit();
}

// ---------- photo girl ----------
const girl = $('#girl');
/** slides in from the bottom, only the top half of her shows (see .girl in style.css) */
function girlUp() {
  girl.classList.remove('down');
  girl.classList.add('up');
}
async function girlDown() {
  girl.classList.remove('up');
  girl.classList.add('down');
  await wait(450);
}

// ---------- flash ----------
const bigFlash = $('#bigflash');
const track = () => stream && stream.getVideoTracks()[0];

/** rear camera only: is it too dark for a good photo? */
function isDark() {
  if (facing === 'user') return false;
  const t = track();
  try {
    const st = t.getSettings();
    if ((st.iso && st.iso >= 1600) || (st.exposureTime && st.exposureTime >= 330)) return true;
  } catch (e) { /* not reported */ }
  // average brightness of the preview (auto exposure brightens a lot, so the bar is low)
  const c = document.createElement('canvas');
  c.width = 48; c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, 0, 0, 48, 64);
  const d = g.getImageData(0, 0, 48, 64).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4) < 70;
}
async function torch(on) {
  const t = track();
  try {
    if (!t || !t.getCapabilities || !t.getCapabilities().torch) return false;
    await t.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch (e) { return false; }
}

/** white screen (and the torch on the rear cam if it's dark), take the picture, fade out */
async function snap(dark) {
  let lit = false;
  if (dark) {
    lit = await torch(true);
    if (lit) await wait(350); // give auto exposure a moment
  }
  bigFlash.classList.remove('fade');
  bigFlash.classList.add('on');
  await wait(facing === 'user' ? 180 : 60); // the white screen lights the selfie face
  drawFrame();
  sfx.shutter();
  if (lit) torch(false);
  bigFlash.classList.add('fade');
  bigFlash.classList.remove('on');
  await wait(320);
  bigFlash.classList.remove('fade');
}

async function shoot() {
  if (state !== 'ready') return;
  sfx.initAudio();
  state = 'running';
  btnShoot.disabled = true;
  btnFlip.disabled = true;
  btnCut.disabled = true;

  showBanner({ text: 'GET READY!', tag: 'いくぞ！' });
  const vd = sfx.playVoice();
  await wait(Math.min(vd, VOICE_WAIT) * 1000);

  hideBanner();
  girlUp();
  sfx.beat(4, COUNT_STEP / 1000);
  const dark = isDark(); // check the light while the scene is still unlit
  for (const n of [3, 2, 1]) {
    showCount(String(n));
    sfx.beep(false);
    await wait(COUNT_STEP);
  }
  showCount('BOBBLE\nUP!');
  sfx.beep(true);
  await snap(dark);
  hideBanner();
  await girlDown();

  stopCamera();
  let photo = camCv;
  isCut = false;
  if (cutBg) {
    showBanner({ text: 'CUTTING OUT…', tag: 'チョキチョキ！' });
    try {
      const c = await cutout(camCv);
      if (c.coverage > 0.02) { photo = c; isCut = true; }
      else showBanner({ text: 'NOBODY FOUND!', tag: 'だれもいない？' }, 1800);
    } catch (e) {
      console.warn('cutout failed', e);
      showBanner({ text: 'CUT FAILED!', tag: String(e.message || e) }, 2500);
    }
  }
  goo.setImage(photo);
  goo.render();
  state = 'goo';
  setMode('goo');
  updateUndo();
  fit();
  if (banner.classList.contains('hidden') || isCut) {
    await wait(isCut ? 100 : 500);
    showBanner({ text: 'GOO TIME!', tag: 'ぐにゃぐにゃ！' }, 1600);
  }
}

// ---------- editor ----------
function setTool(t) {
  if (t === 'swirl' && tool === 'swirl') swirlDir = -swirlDir; // tap again: other direction
  tool = t;
  setSizeMode(false);
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  const sb = $('[data-tool=swirl]');
  sb.classList.toggle('ccw', swirlDir < 0);
  $('#swirl-icon').textContent = swirlDir > 0 ? '↻' : '↺';
}
function setSizeMode(on) {
  sizeMode = on;
  btnSize.classList.toggle('armed', on);
  btnSize.classList.toggle('alt', !on);
  updateSize();
}
function updateUndo() { btnUndo.disabled = !goo.canUndo; }
function updateSize() {
  btnSize.querySelector('small').textContent = sizeMode ? 'DRAG!' : 'SIZE';
  $('#size-dot').style.fontSize = `${8 + ((brushR - R_MIN) / (R_MAX - R_MIN)) * 26}px`;
}

function toImage(e) {
  const r = gooCv.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
function showRing(x, y, active, sizing = false) {
  const d = (radius() * 2 / W) * 100;
  ring.style.left = `${(x / W) * 100}%`;
  ring.style.top = `${(y / H) * 100}%`;
  ring.style.width = `${d}%`;
  ring.style.height = `${(radius() * 2 / H) * 100}%`;
  ring.classList.toggle('active', active);
  ring.classList.toggle('sizing', sizing);
  ring.classList.remove('hidden');
}

gooCv.addEventListener('pointerdown', (e) => {
  if (state !== 'goo' || pointer) return;
  sfx.initAudio();
  gooCv.setPointerCapture(e.pointerId);
  const [x, y] = toImage(e);
  if (sizeMode) {
    // size mode: the ring sits where the finger went down, its edge follows the finger
    pointer = { id: e.pointerId, x, y, sx: x, sy: y, sizing: true };
    showRing(x, y, true, true);
    return;
  }
  goo.checkpoint();
  updateUndo();
  pointer = { id: e.pointerId, x, y, travel: 0, stop: tool === 'smear' ? null : sfx.gooHold(tool) };
  if (tool === 'smear') sfx.squish();
  showRing(x, y, true);
  hideBanner();
});
gooCv.addEventListener('pointermove', (e) => {
  if (state !== 'goo') return;
  const [x, y] = toImage(e);
  if (!pointer || pointer.id !== e.pointerId) {
    if (e.pointerType === 'mouse') showRing(x, y, false);
    return;
  }
  if (pointer.sizing) {
    const r = Math.max(R_MIN, Math.min(R_MAX, Math.hypot(x - pointer.sx, y - pointer.sy)));
    if (Math.floor(r / 40) !== Math.floor(brushR / 40)) sfx.click();
    brushR = r;
    updateSize();
    showRing(pointer.sx, pointer.sy, true, true);
    return;
  }
  if (tool === 'smear') {
    const dx = x - pointer.x, dy = y - pointer.y;
    goo.smear(pointer.x, pointer.y, dx, dy, radius());
    pointer.travel += Math.hypot(dx, dy);
    if (pointer.travel > 60) { pointer.travel = 0; sfx.squish(); }
  }
  pointer.x = x; pointer.y = y;
  showRing(x, y, true);
});
function endPointer(e) {
  if (!pointer || pointer.id !== e.pointerId) return;
  if (pointer.stop) pointer.stop();
  const wasSizing = pointer.sizing;
  pointer = null;
  if (wasSizing) {
    setSizeMode(false);
    sfx.blip();
    setTimeout(() => { if (!pointer) ring.classList.add('hidden'); }, 600);
    return;
  }
  if (e.pointerType === 'mouse') ring.classList.remove('active');
  else ring.classList.add('hidden');
}
gooCv.addEventListener('pointerup', endPointer);
gooCv.addEventListener('pointercancel', endPointer);
gooCv.addEventListener('pointerleave', (e) => { if (!pointer && e.pointerType === 'mouse') ring.classList.add('hidden'); });

document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => {
  sfx.initAudio();
  sfx.blip();
  setTool(b.dataset.tool);
}));
btnSize.addEventListener('click', () => {
  sfx.initAudio();
  sfx.blip();
  setSizeMode(!sizeMode);
  if (sizeMode) showBanner({ text: 'DRAG TO SIZE!', tag: 'おおきく？ちいさく？' }, 1800);
});
btnUndo.addEventListener('click', () => {
  if (goo.undo()) sfx.rewind();
  updateUndo();
});
btnAgain.addEventListener('click', async () => {
  sfx.click();
  if (goo.canUndo && Date.now() - confirmNew > 2500) {
    confirmNew = Date.now();
    showBanner({ text: 'NEW PHOTO? TAP AGAIN!', tag: 'ほんとに？' }, 2500);
    return;
  }
  confirmNew = 0;
  try { await startCamera(); } catch (e) { showBanner({ text: 'CAMERA ERROR!', tag: String(e.name || e) }, 3000); return; }
  toCamera();
});

// ---------- before/after screen ----------
/** speed slider 0..100 → seconds per bobble, 4 s (slow) … 0.4 s (fast) */
const period = () => 4 * Math.pow(0.1, Number(speedEl.value) / 100);

function toAnim() {
  if (state !== 'goo') return;
  sfx.click();
  if (!goo.canUndo) { showBanner({ text: 'GOO IT FIRST!', tag: 'まだまだ！' }, 1800); return; }
  state = 'anim';
  setMode('anim');
  ring.classList.add('hidden');
  setSizeMode(false);
  phase = 0;
  exportsCache = {};
  clearReady();
  fit();
  showBanner({ text: 'BEFORE ⇄ AFTER!', tag: 'ビフォー・アフター！' }, 1800);
}
function backToGoo() {
  if (busy) return;
  sfx.click();
  state = 'goo';
  setMode('goo');
  clearReady();
  goo.render(1);
  fit();
}

function fileName(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `bobblecam-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

/** makes (or reuses) the video or sticker for the current speed */
async function build(kind) {
  const key = speedEl.value;
  const c = exportsCache[kind];
  if (c && c.key === key) return c;
  busy = true;
  try {
    let out;
    if (kind === 'video') {
      const rec = document.createElement('canvas');
      rec.width = W; rec.height = H;
      const rg = rec.getContext('2d');
      const draw = (ph) => {
        goo.render(bobble(ph % 1));
        if (isCut) rg.drawImage(bgCv, 0, 0); else rg.clearRect(0, 0, W, H);
        rg.drawImage(gooCv, 0, 0);
      };
      const { blob, ext } = await makeVideo(rec, draw, period());
      out = { key, blob, name: fileName(ext) };
    } else {
      const blob = await makeSticker(gooCv, (a) => goo.render(a), period(), isCut);
      out = { key, blob, name: fileName('webp') };
    }
    exportsCache[kind] = out;
    return out;
  } finally {
    busy = false;
  }
}

function download({ blob, name }) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function shareFile({ blob, name }, title) {
  const file = new File([blob], name, { type: blob.type });
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) {
    download({ blob, name });
    showBanner({ text: 'SAVED!', tag: 'シェアできない…' }, 2200);
    return;
  }
  try { await navigator.share({ files: [file], title }); } catch (e) { /* cancelled */ }
}

function clearReady() {
  ready = null;
  [btnVSave, btnVShare, btnSticker].forEach((b) => b.classList.remove('ready', 'busy'));
}

const ACTIONS = {
  vsave: { btn: btnVSave, kind: 'video', run: (f) => download(f) },
  vshare: { btn: btnVShare, kind: 'video', run: (f) => shareFile(f, 'BOBBLECAM') },
  sticker: { btn: btnSticker, kind: 'sticker', run: (f) => shareFile(f, 'BOBBLECAM sticker') },
};

async function act(name) {
  if (state !== 'anim' || busy) return;
  sfx.initAudio();
  const a = ACTIONS[name];
  // second tap on a ready button: the share sheet needs a fresh tap after a long wait
  if (ready && ready.name === name) { sfx.chu(); clearReady(); return a.run(exportsCache[a.kind]); }
  clearReady();
  sfx.click();
  const t0 = Date.now();
  a.btn.classList.add('busy');
  showBanner(a.kind === 'video'
    ? { text: 'RECORDING…', tag: 'ろくがちゅう！' }
    : { text: 'MAKING STICKER…', tag: 'ステッカー！' });
  let f;
  try {
    f = await build(a.kind);
  } catch (e) {
    a.btn.classList.remove('busy');
    showBanner({ text: 'OOPS!', tag: String(e.message || e) }, 3000);
    return;
  }
  a.btn.classList.remove('busy');
  if (Date.now() - t0 < 3500 || name === 'vsave') {
    hideBanner();
    return a.run(f);
  }
  ready = { name };
  a.btn.classList.add('ready');
  sfx.blip();
  showBanner({ text: 'READY! TAP AGAIN!', tag: 'できた！' });
}

$('#btn-save').addEventListener('click', toAnim);
$('#btn-share').addEventListener('click', toAnim);
$('#btn-back').addEventListener('click', backToGoo);
btnVSave.addEventListener('click', () => act('vsave'));
btnVShare.addEventListener('click', () => act('vshare'));
btnSticker.addEventListener('click', () => act('sticker'));
speedEl.addEventListener('input', () => { if (ready) clearReady(); });

// ---------- frame loop ----------
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  if (state === 'ready' || state === 'running') drawFrame();
  if (state === 'goo' && pointer && !pointer.sizing && tool !== 'smear') {
    const r = radius(), { x, y } = pointer;
    if (tool === 'grow') goo.scale(x, y, r, RATE.grow * dt * 0.25);
    else if (tool === 'shrink') goo.scale(x, y, r, -RATE.shrink * dt * 0.25);
    else if (tool === 'swirl') goo.swirl(x, y, r, swirlDir * RATE.swirl * dt);
    else if (tool === 'ungoo') goo.ungoo(x, y, r, Math.min(1, RATE.ungoo * dt));
  }
  if (state === 'anim') {
    if (!busy) phase = (phase + dt / period()) % 1;
    if (!busy) goo.render(bobble(phase));
  } else if (goo) goo.render();
  requestAnimationFrame(loop);
}

// ---------- sizing ----------
function fit() {
  const r = stage.getBoundingClientRect();
  const pad = 40;
  const aw = r.width - pad, ah = r.height - pad;
  let w = aw, h = (aw * H) / W;
  if (h > ah) { h = ah; w = (ah * W) / H; }
  screenEl.style.width = `${Math.floor(w)}px`;
  screenEl.style.height = `${Math.floor(h)}px`;
}

// ---------- wiring ----------
$('#btn-start').addEventListener('click', async () => {
  sfx.initAudio();
  sfx.chu();
  const err = $('#title-error');
  err.classList.add('hidden');
  if (!goo) {
    try { goo = new Goo(gooCv, W, H); } catch (e) {
      err.textContent = `GOO ENGINE ERROR: ${e.message || e}. This browser needs WebGL2.`;
      err.classList.remove('hidden');
      return;
    }
  }
  try {
    await startCamera();
  } catch (e) {
    err.textContent = `CAMERA ERROR: ${e.name || e}. Allow camera access (HTTPS needed) and press START again.`;
    err.classList.remove('hidden');
    return;
  }
  sfx.loadVoices(START_SOUNDS.map((f) => `assets/start/${f}`));
  if (cutBg) prepareCut().catch((e) => console.warn('cutout not ready', e));
  $('#title').classList.add('hidden');
  toCamera();
});

btnShoot.addEventListener('click', shoot);
btnCut.addEventListener('click', () => {
  if (state !== 'ready') return;
  sfx.initAudio();
  sfx.blip();
  cutBg = !cutBg;
  try { localStorage.setItem('bobblecam.cut', cutBg ? '1' : '0'); } catch (e) { /* no storage */ }
  updateCut();
  if (cutBg) prepareCut().catch((e) => console.warn('cutout not ready', e));
  showBanner(cutBg ? { text: 'BACKGROUND: BYE!', tag: 'バイバイ！' } : { text: 'BACKGROUND STAYS!', tag: 'そのまま！' }, 1400);
});
btnFlip.addEventListener('click', async () => {
  if (state !== 'ready') return;
  sfx.click();
  facing = facing === 'user' ? 'environment' : 'user';
  try { await startCamera(); } catch (e) { facing = facing === 'user' ? 'environment' : 'user'; }
});
btnMute.addEventListener('click', () => {
  muted = !muted;
  sfx.setMuted(muted);
  btnMute.classList.toggle('off', muted);
  btnMute.querySelector('small').textContent = muted ? 'OFF' : 'ON';
  if (!muted) sfx.click();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'ready') shoot();
    else if (state === 'title') $('#btn-start').click();
  } else if (state === 'goo' && (e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    btnUndo.click();
  } else if (state === 'goo' && /^Digit[1-5]$/.test(e.code)) {
    setTool(['smear', 'grow', 'shrink', 'swirl', 'ungoo'][Number(e.code.slice(5)) - 1]);
  }
});
window.addEventListener('resize', fit);

// ---------- boot ----------
(async () => {
  try {
    await Promise.all([
      document.fonts.load('128px "Dela Gothic One"'),
      document.fonts.load('28px "DotGothic16"', 'ボブルカム'),
      document.fonts.load('28px "Press Start 2P"'),
    ]);
  } catch (e) { /* fonts optional */ }
  updateSize();
  updateCut();
  paintBackdrop();
  fit();
  requestAnimationFrame(loop);
})();
