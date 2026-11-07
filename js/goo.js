// The goo engine, Kai's-Power-Goo style.
//
// The photo itself is never changed. Instead we keep a displacement field D on a coarse
// grid (one point every G pixels): output pixel p shows the photo at p + D(p).
// Every brush rewrites D by "where should this pixel look now?", so effects stack
// endlessly without the image getting blurrier and blurrier. The GPU does the
// per-pixel lookup, so it stays smooth on a phone.

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D img;
uniform sampler2D disp;
uniform vec2 size;   // image size in px
uniform vec2 grid;   // field size in points
uniform float G;     // px per grid step
uniform float amt;   // 0 = original photo, 1 = full goo (for the before/after animation)
out vec4 o;
void main() {
  vec2 p = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  vec2 d = texture(disp, (p / G + 0.5) / grid).rg * amt;
  o = texture(img, (p + d) / size);
}`;

// smooth bell: 1 in the middle, 0 at the rim
const fall = (t) => (t >= 1 ? 0 : (1 - t * t) * (1 - t * t));

export class Goo {
  constructor(canvas, W, H, G = 4) {
    this.W = W; this.H = H; this.G = G;
    this.gw = Math.ceil(W / G) + 1;
    this.gh = Math.ceil(H / G) + 1;
    this.field = new Float32Array(this.gw * this.gh * 2);
    this.tmp = new Float32Array(this.field.length);
    this.history = [];
    this.dirty = true;

    canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.canvas = canvas;

    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = (unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.imgTex = tex(0);
    this.dispTex = tex(1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, this.gw, this.gh, 0, gl.RG, gl.FLOAT, this.field);

    gl.uniform1i(gl.getUniformLocation(prog, 'img'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'disp'), 1);
    gl.uniform2f(gl.getUniformLocation(prog, 'size'), W, H);
    gl.uniform2f(gl.getUniformLocation(prog, 'grid'), this.gw, this.gh);
    gl.uniform1f(gl.getUniformLocation(prog, 'G'), G);
    this.amtLoc = gl.getUniformLocation(prog, 'amt');
    gl.uniform1f(this.amtLoc, 1);
    this.amt = 1;
    gl.viewport(0, 0, W, H);
  }

  /** source: a canvas/image of exactly W×H */
  setImage(source) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.history = [];
    this.field.fill(0);
    this.dirty = true;
  }

  // ---------- history ----------
  /** call once at the start of every stroke */
  checkpoint() {
    this.history.push(this.field.slice());
    if (this.history.length > 30) this.history.shift();
  }
  undo() {
    if (!this.history.length) return false;
    this.field.set(this.history.pop());
    this.dirty = true;
    return true;
  }
  reset() {
    this.checkpoint();
    this.field.fill(0);
    this.dirty = true;
  }
  get canUndo() { return this.history.length > 0; }

  /** how much goo is on the picture: strength = average px moved where gooed, cover = gooed share 0..1 */
  amount() {
    const f = this.field;
    let sum = 0, n = 0;
    for (let i = 0; i < f.length; i += 2) {
      const d = Math.hypot(f[i], f[i + 1]);
      if (d > 1.5) { sum += d; n++; }
    }
    return { strength: n ? sum / n : 0, cover: n / (f.length / 2) };
  }

  // ---------- field helpers ----------
  /** bilinear sample of the OLD field (this.tmp) at pixel position x,y → [dx,dy] */
  sample(x, y) {
    const { gw, gh, G, tmp } = this;
    let gx = x / G, gy = y / G;
    gx = Math.max(0, Math.min(gw - 1.001, gx));
    gy = Math.max(0, Math.min(gh - 1.001, gy));
    const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j;
    const a = (j * gw + i) * 2, b = a + 2, c = a + gw * 2, d = c + 2;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    return [
      tmp[a] * w00 + tmp[b] * w10 + tmp[c] * w01 + tmp[d] * w11,
      tmp[a + 1] * w00 + tmp[b + 1] * w10 + tmp[c + 1] * w01 + tmp[d + 1] * w11,
    ];
  }

  /**
   * Runs fn(px, py, w) for every grid point inside the brush; fn returns where that point
   * should now look ([qx,qy], a position in the current output), and the new displacement
   * is that position's old displacement carried over.
   */
  brush(cx, cy, r, fn) {
    const { gw, gh, G, field } = this;
    this.tmp.set(field);
    const i0 = Math.max(0, Math.floor((cx - r) / G)), i1 = Math.min(gw - 1, Math.ceil((cx + r) / G));
    const j0 = Math.max(0, Math.floor((cy - r) / G)), j1 = Math.min(gh - 1, Math.ceil((cy + r) / G));
    for (let j = j0; j <= j1; j++) {
      const py = j * G;
      for (let i = i0; i <= i1; i++) {
        const px = i * G;
        const w = fall(Math.hypot(px - cx, py - cy) / r);
        if (w <= 0) continue;
        const [qx, qy] = fn(px, py, w);
        const [dx, dy] = this.sample(qx, qy);
        const k = (j * gw + i) * 2;
        field[k] = qx + dx - px;
        field[k + 1] = qy + dy - py;
      }
    }
    this.dirty = true;
  }

  // ---------- the tools ----------
  /** drag the goo from (x,y) by (dx,dy) */
  smear(x, y, dx, dy, r) {
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / (r * 0.2)));
    const sx = dx / steps, sy = dy / steps;
    for (let s = 0; s < steps; s++) {
      const cx = x + sx * s, cy = y + sy * s;
      this.brush(cx + sx, cy + sy, r, (px, py, w) => [px - sx * w, py - sy * w]);
    }
  }

  /** amount > 0 grows (bulge), amount < 0 shrinks (pinch) */
  scale(x, y, r, amount) {
    this.brush(x, y, r, (px, py, w) => {
      const s = 1 - amount * w;
      return [x + (px - x) * s, y + (py - y) * s];
    });
  }

  swirl(x, y, r, angle) {
    this.brush(x, y, r, (px, py, w) => {
      const a = -angle * w, c = Math.cos(a), s = Math.sin(a);
      const ux = px - x, uy = py - y;
      return [x + ux * c - uy * s, y + ux * s + uy * c];
    });
  }

  /** paint the photo back to normal */
  ungoo(x, y, r, amount) {
    const { gw, gh, G, field } = this;
    const i0 = Math.max(0, Math.floor((x - r) / G)), i1 = Math.min(gw - 1, Math.ceil((x + r) / G));
    const j0 = Math.max(0, Math.floor((y - r) / G)), j1 = Math.min(gh - 1, Math.ceil((y + r) / G));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const w = fall(Math.hypot(i * G - x, j * G - y) / r);
        if (w <= 0) continue;
        const k = (j * gw + i) * 2, f = 1 - amount * w;
        field[k] *= f;
        field[k + 1] *= f;
      }
    }
    this.dirty = true;
  }

  // ---------- output ----------
  /** amt: how much of the goo to show (1 = all of it) */
  render(amt = 1) {
    const gl = this.gl;
    if (this.dirty) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.dispTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gw, this.gh, gl.RG, gl.FLOAT, this.field);
    } else if (amt === this.amt) return;
    if (amt !== this.amt) { gl.uniform1f(this.amtLoc, amt); this.amt = amt; }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dirty = false;
  }
}
