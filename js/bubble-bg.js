// Paints a fresh soap-bubble backdrop for every photo (same look as
// tools/make-bubble-bg.py, but right on the phone, in a few milliseconds).

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** 1) soft colour field: big blurred blobs in pink / cyan / yellow / violet / peach */
function colourField(g, W, H) {
  g.fillStyle = '#ffd6ec';
  g.fillRect(0, 0, W, H);
  const cols = ['255,120,200', '80,220,255', '255,236,120', '150,110,255', '255,150,120', '90,230,230', '255,110,190', '255,240,170'];
  // a few blobs every time, in new places
  const n = 8 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const x = rnd(-0.05, 1.05) * W, y = rnd(-0.05, 1.05) * H, r = rnd(300, 470);
    const c = cols[i % cols.length];
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.6);
    gr.addColorStop(0, `rgba(${c},0.85)`);
    gr.addColorStop(0.35, `rgba(${c},0.6)`);
    gr.addColorStop(0.7, `rgba(${c},0.18)`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
}

/** 2) out-of-focus light discs and golden glints, screen-blended so they glow */
function bokeh(g, W, H) {
  const L = layer(W, H), l = L.getContext('2d');
  const hues = [330, 180, 50, 280, 350, 200, 43];
  for (let i = 0; i < 60; i++) {
    const r = rnd(25, 100);
    l.fillStyle = `hsla(${pick(hues)},100%,${Math.round(rnd(78, 90))}%,${rnd(0.24, 0.47).toFixed(2)})`;
    l.beginPath(); l.arc(rnd(0, W), rnd(0, H), r, 0, Math.PI * 2); l.fill();
  }
  g.save();
  g.globalCompositeOperation = 'screen';
  g.filter = 'blur(12px)';
  g.drawImage(L, 0, 0);
  g.restore();

  l.clearRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    l.fillStyle = `rgba(255,226,120,${rnd(0.55, 0.9).toFixed(2)})`;
    l.beginPath(); l.arc(rnd(0, W), rnd(0, H), rnd(5, 16), 0, Math.PI * 2); l.fill();
  }
  g.save();
  g.globalCompositeOperation = 'screen';
  g.filter = 'blur(3px)';
  g.drawImage(L, 0, 0);
  g.restore();
}

/** 3) one soap bubble: rainbow rim, faint body, light bounce, glossy highlights */
function bubble(g, x, y, r) {
  const turn = Math.random() * Math.PI * 2;
  // faint body that gets a bit stronger towards the edge
  const body = g.createRadialGradient(x, y, 0, x, y, r);
  body.addColorStop(0, 'rgba(255,255,255,0.06)');
  body.addColorStop(0.75, 'rgba(255,255,255,0.09)');
  body.addColorStop(1, 'rgba(255,255,255,0.22)');
  g.fillStyle = body;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();

  // iridescent rim: a pastel rainbow running around the bubble
  let rim;
  if (g.createConicGradient) {
    rim = g.createConicGradient(turn, x, y);
    for (let i = 0; i <= 6; i++) rim.addColorStop(i / 6, `hsla(${i * 60},100%,78%,0.95)`);
  } else rim = `hsla(${Math.round(turn * 57)},100%,80%,0.9)`; // very old browsers
  g.save();
  g.strokeStyle = rim;
  g.filter = `blur(${Math.max(0.6, r * 0.012)}px)`;
  g.lineWidth = Math.max(1.5, r * 0.045);
  g.beginPath(); g.arc(x, y, r * 0.985, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.35;
  g.lineWidth = Math.max(2, r * 0.12);
  g.beginPath(); g.arc(x, y, r * 0.93, 0, Math.PI * 2); g.stroke();
  g.restore();

  // light bounce, lower right
  const bx = x + r * 0.45, by = y + r * 0.55;
  const lb = g.createRadialGradient(bx, by, 0, bx, by, r * 0.35);
  lb.addColorStop(0, 'rgba(255,255,255,0.35)');
  lb.addColorStop(1, 'rgba(255,255,255,0)');
  g.save();
  g.beginPath(); g.arc(x, y, r * 0.98, 0, Math.PI * 2); g.clip();
  g.fillStyle = lb;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();

  // glossy highlights: soft oval + small sharp dot
  const hx = x - 0.42 * r, hy = y - 0.45 * r;
  g.save();
  g.filter = `blur(${Math.max(0.5, r * 0.01)}px)`;
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath(); g.ellipse(hx, hy, 0.22 * r, 0.12 * r, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.86)';
  g.beginPath(); g.arc(hx + 0.3 * r, hy - 0.16 * r, 0.06 * r, 0, Math.PI * 2); g.fill();
  g.restore();
}

function bubbles(g, W, H) {
  const placed = [];
  const place = (n, rmin, rmax) => {
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 400; t++) {
        const r = rnd(rmin, rmax);
        const x = rnd(-0.1 * r, W + 0.1 * r), y = rnd(-0.1 * r, H + 0.1 * r);
        if (placed.every(([px, py, pr]) => (x - px) ** 2 + (y - py) ** 2 > (r + pr * 0.8) ** 2)) {
          placed.push([x, y, r]);
          break;
        }
      }
    }
  };
  place(5, 150, 230);
  place(10, 60, 120);
  place(26, 14, 45);
  placed.sort((a, b) => b[2] - a[2]).forEach(([x, y, r]) => bubble(g, x, y, r));
}

/** 4) little white 4-point sparkles with a glow */
function sparkles(g, W, H) {
  g.save();
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 8;
  for (let i = 0; i < 45; i++) {
    const x = rnd(0, W), y = rnd(0, H), s = rnd(4, 16);
    g.fillStyle = `rgba(255,255,255,${rnd(0.6, 0.95).toFixed(2)})`;
    g.beginPath();
    g.moveTo(x, y - s); g.lineTo(x + s * 0.18, y - s * 0.18); g.lineTo(x + s, y); g.lineTo(x + s * 0.18, y + s * 0.18);
    g.lineTo(x, y + s); g.lineTo(x - s * 0.18, y + s * 0.18); g.lineTo(x - s, y); g.lineTo(x - s * 0.18, y - s * 0.18);
    g.closePath(); g.fill();
  }
  g.restore();
}

/** paints a brand-new bubble backdrop onto `canvas` */
export function paintBubbles(canvas) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d');
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.filter = 'none';
  colourField(g, W, H);
  bokeh(g, W, H);
  bubbles(g, W, H);
  sparkles(g, W, H);
  g.restore();
}
