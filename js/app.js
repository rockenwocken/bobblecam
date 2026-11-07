import * as sfx from './sfx.js';
import { START_SOUNDS } from './start-sounds.js';
import { Goo } from './goo.js';

// ---------- config ----------
const W = 1080, H = 1440;
const COUNT_STEP = 1000; // ms per countdown number
const SIZES = [{ r: 80, n: 'S' }, { r: 150, n: 'M' }, { r: 250, n: 'L' }, { r: 380, n: 'XL' }];
const RATE = { grow: 1.1, shrink: 1.1, swirl: 2.6, ungoo: 3.5 }; // per second while held
const POSES = [
  { text: 'MAKE A FUNNY FACE!', tag: 'へんがお！' },
  { text: 'PUFF YOUR CHEEKS!', tag: 'ぷくー！' },
  { text: 'BIG EYES! BIG EYES!', tag: 'じーっ！' },
  { text: 'OPEN WIDE!', tag: 'あーん！' },
  { text: 'FLEX LIKE A WRESTLER!', tag: 'ムキムキ！' },
  { text: 'SMILE LIKE A SHARK!', tag: 'ニヤリ！' },
  { text: 'LOOK SURPRISED!', tag: 'えっ？！' },
  { text: 'KISSY FACE!', tag: 'チュー！' },
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

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
const btnUndo = $('#btn-undo');
const btnSize = $('#btn-size');
const btnAgain = $('#btn-again');

// ---------- state ----------
let facing = 'user';
let stream = null;
let state = 'title'; // title | ready | running | goo
let muted = false;
let goo = null;
let tool = 'smear';
let sizeIdx = 1;
let pointer = null; // { id, x, y, stop?, travel }
let lastT = 0;
let confirmNew = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const radius = () => SIZES[sizeIdx].r;

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

function flash() {
  flashEl.classList.remove('on');
  void flashEl.offsetWidth;
  flashEl.classList.add('on');
  screenEl.classList.remove('shake');
  void screenEl.offsetWidth;
  screenEl.classList.add('shake');
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
function toCamera() {
  state = 'ready';
  app.className = 'mode-cam';
  btnShoot.disabled = false;
  btnFlip.disabled = false;
  hideBanner();
  ring.classList.add('hidden');
  fit();
}

async function shoot() {
  if (state !== 'ready') return;
  sfx.initAudio();
  state = 'running';
  btnShoot.disabled = true;
  btnFlip.disabled = true;

  showBanner({ text: 'GET READY!', tag: 'いくぞ！' });
  const vd = sfx.playVoice();
  await wait(Math.min(vd, 3.2) * 1000 + 150);

  showBanner(pick(POSES));
  sfx.beat(4, 0.5);
  for (const n of [3, 2, 1]) {
    showCount(String(n));
    sfx.beep(false);
    await wait(COUNT_STEP);
  }
  showCount('GOO!');
  sfx.beep(true);
  sfx.shutter();
  drawFrame();
  flash();
  hideBanner();

  goo.setImage(camCv);
  goo.render();
  stopCamera();
  state = 'goo';
  app.className = 'mode-goo';
  updateUndo();
  fit();
  await wait(500);
  showBanner({ text: 'GOO TIME!', tag: 'ぐにゃぐにゃ！' }, 1600);
}

// ---------- editor ----------
function setTool(t) {
  tool = t;
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
}
function updateUndo() { btnUndo.disabled = !goo.canUndo; }
function updateSize() {
  btnSize.querySelector('small').textContent = `SIZE ${SIZES[sizeIdx].n}`;
  $('#size-dot').style.fontSize = `${10 + sizeIdx * 7}px`;
}

function toImage(e) {
  const r = gooCv.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
function showRing(x, y, active) {
  const d = (radius() * 2 / W) * 100;
  ring.style.left = `${(x / W) * 100}%`;
  ring.style.top = `${(y / H) * 100}%`;
  ring.style.width = `${d}%`;
  ring.style.height = `${(radius() * 2 / H) * 100}%`;
  ring.classList.toggle('active', active);
  ring.classList.remove('hidden');
}

gooCv.addEventListener('pointerdown', (e) => {
  if (state !== 'goo' || pointer) return;
  sfx.initAudio();
  gooCv.setPointerCapture(e.pointerId);
  const [x, y] = toImage(e);
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
  pointer = null;
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
  sfx.click();
  sizeIdx = (sizeIdx + 1) % SIZES.length;
  updateSize();
  showRing(W / 2, H / 2, false);
  setTimeout(() => { if (!pointer) ring.classList.add('hidden'); }, 700);
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

// ---------- save / share ----------
function fileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `bobblecam-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}
async function save() {
  sfx.click();
  const blob = await goo.toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function share() {
  sfx.click();
  const blob = await goo.toBlob();
  const file = new File([blob], fileName(), { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'BOBBLECAM' }); } catch (e) { /* cancelled */ }
  } else {
    save();
  }
}
$('#btn-save').addEventListener('click', save);
$('#btn-share').addEventListener('click', share);

// ---------- frame loop ----------
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  if (state === 'ready' || state === 'running') drawFrame();
  if (state === 'goo' && pointer && tool !== 'smear') {
    const r = radius(), { x, y } = pointer;
    if (tool === 'grow') goo.scale(x, y, r, RATE.grow * dt * 0.25);
    else if (tool === 'shrink') goo.scale(x, y, r, -RATE.shrink * dt * 0.25);
    else if (tool === 'swirl') goo.swirl(x, y, r, RATE.swirl * dt);
    else if (tool === 'ungoo') goo.ungoo(x, y, r, Math.min(1, RATE.ungoo * dt));
  }
  if (goo) goo.render();
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
  $('#title').classList.add('hidden');
  toCamera();
});

btnShoot.addEventListener('click', shoot);
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
  fit();
  requestAnimationFrame(loop);
})();
