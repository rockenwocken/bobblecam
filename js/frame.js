// The arcade frame around exported videos, in the style of the STARSHOT print:
// gradient + halftone, big logo with stars, the picture in a black frame with a
// kana tag, and a footer plate with title, info line and date.

export const FW = 1080, FH = 1700;
export const PA = { x: 40, y: 168, w: 1000, h: 1333 }; // picture area, 3:4 like the photo

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}

function star(x, cx, cy, r, col, rot) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  x.closePath();
  x.fillStyle = col; x.fill();
  x.lineWidth = 6; x.strokeStyle = '#120620'; x.stroke();
  x.restore();
}

function fit(x, text, maxW, px, font) {
  x.font = `${px}px ${font}`;
  while (x.measureText(text).width > maxW && px > 16) { px -= 2; x.font = `${px}px ${font}`; }
}

function dateStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** title: big footer line, info: small line under it. Returns draw(ctx, photo, backdrop|null). */
export function makeFrame(title, info) {
  const base = document.createElement('canvas');
  base.width = FW; base.height = FH;
  const x = base.getContext('2d');

  const grd = x.createLinearGradient(0, 0, FW, FH);
  grd.addColorStop(0, '#ff7a00');
  grd.addColorStop(0.55, '#ff2e88');
  grd.addColorStop(1, '#7a2cff');
  x.fillStyle = grd;
  x.fillRect(0, 0, FW, FH);
  x.fillStyle = 'rgba(255,255,255,0.16)';
  for (let yy = 0; yy < FH; yy += 26) {
    for (let xx = (yy / 26) % 2 ? 13 : 0; xx < FW; xx += 26) {
      x.beginPath(); x.arc(xx, yy, 4 + 3 * (yy / FH), 0, Math.PI * 2); x.fill();
    }
  }

  // logo
  x.save();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  fit(x, 'BOBBLECAM', 780, 128, '"Dela Gothic One"');
  x.translate(FW / 2, 88);
  x.rotate(-0.025);
  x.lineWidth = 20; x.strokeStyle = '#120620';
  x.fillStyle = '#00e5ff';
  x.strokeText('BOBBLECAM', 8, 8);
  x.fillText('BOBBLECAM', 8, 8);
  x.strokeText('BOBBLECAM', 0, 0);
  x.fillStyle = '#ffe600';
  x.fillText('BOBBLECAM', 0, 0);
  x.restore();
  star(x, 70, 82, 46, '#ffe600', 0.2);
  star(x, 1010, 92, 42, '#00e5ff', -0.3);
  star(x, 140, 146, 18, '#fffaf2', 0.5);

  // footer plate
  const fy = PA.y + PA.h + 14;
  roundRect(x, 30, fy, 1020, FH - fy - 22, 22);
  x.fillStyle = '#120620';
  x.fill();
  roundRect(x, 40, fy + 10, 1000, FH - fy - 42, 16);
  x.lineWidth = 4; x.strokeStyle = '#ff2e88';
  x.stroke();
  x.save();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const cx = FW / 2;
  fit(x, title, 920, 60, '"Dela Gothic One"');
  x.lineWidth = 10; x.lineJoin = 'round'; x.strokeStyle = '#ff2e88';
  x.strokeText(title, cx, fy + 56);
  x.fillStyle = '#ffe600';
  x.fillText(title, cx, fy + 56);
  x.font = '24px "Press Start 2P"';
  x.fillStyle = '#00e5ff';
  x.fillText(info, cx, fy + 112);
  x.font = '13px "Press Start 2P"';
  x.fillStyle = 'rgba(255,250,242,0.55)';
  x.fillText(`${dateStamp()}  ★  BOBBLECAM`, cx, fy + 146);
  x.restore();

  // things on top of the picture: frame line + kana tag
  const top = document.createElement('canvas');
  top.width = FW; top.height = FH;
  const t = top.getContext('2d');
  t.lineWidth = 12;
  t.strokeStyle = '#120620';
  t.strokeRect(PA.x, PA.y, PA.w, PA.h);
  t.save();
  t.translate(870, PA.y + 4);
  t.rotate(-0.05);
  t.font = '30px "DotGothic16"';
  const tw = t.measureText('ボブルカム').width;
  roundRect(t, -tw / 2 - 18, -24, tw + 36, 48, 10);
  t.fillStyle = '#120620';
  t.fill();
  t.fillStyle = '#ffe600';
  t.textAlign = 'center';
  t.textBaseline = 'middle';
  t.fillText('ボブルカム', 0, 1);
  t.restore();

  return (ctx, photo, backdrop) => {
    ctx.drawImage(base, 0, 0);
    if (backdrop) ctx.drawImage(backdrop, PA.x, PA.y, PA.w, PA.h);
    else { ctx.fillStyle = '#120620'; ctx.fillRect(PA.x, PA.y, PA.w, PA.h); }
    ctx.drawImage(photo, PA.x, PA.y, PA.w, PA.h);
    ctx.drawImage(top, 0, 0);
  };
}
